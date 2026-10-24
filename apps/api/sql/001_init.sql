-- PostgreSQL 15+. Importes en pesos colombianos (COP), no centavos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','reception','kitchen','cashier','housekeeping')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number varchar(15) NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id),
  pin_hash text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  checkout_at timestamptz NOT NULL,
  checked_out_at timestamptz,
  pin_revoked_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_by uuid REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (checkout_at > starts_at)
);
CREATE INDEX stays_room_active_idx ON stays(room_id, checkout_at) WHERE checked_out_at IS NULL;

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_e164 varchar(18) NOT NULL UNIQUE,
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(130) NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  category varchar(60) NOT NULL,
  area text NOT NULL CHECK (area IN ('cafe','hotel')),
  visibility text NOT NULL CHECK (visibility IN ('standard','guest')),
  price_cop bigint NOT NULL DEFAULT 0 CHECK (price_cop >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (area <> 'hotel' OR visibility = 'guest')
);
CREATE INDEX products_menu_idx ON products(visibility, area, category) WHERE deleted_at IS NULL AND is_available = true;

CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  min_selected integer NOT NULL DEFAULT 0 CHECK (min_selected >= 0),
  max_selected integer NOT NULL DEFAULT 1 CHECK (max_selected >= min_selected AND max_selected > 0),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id),
  name varchar(100) NOT NULL,
  type text NOT NULL CHECK (type IN ('add','remove','preference')),
  price_delta_cop bigint NOT NULL DEFAULT 0 CHECK (price_delta_cop >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (id, group_id),
  CHECK (type = 'add' OR price_delta_cop = 0)
);
CREATE INDEX modifier_options_group_idx ON modifier_options(group_id, sort_order);
CREATE TABLE product_modifier_groups (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES modifier_groups(id),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(product_id, group_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_role text NOT NULL CHECK (actor_role IN ('standard','guest')),
  customer_id uuid REFERENCES customers(id),
  stay_id uuid REFERENCES stays(id),
  table_code varchar(60),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash char(64) NOT NULL,
  tracking_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_role = 'standard' AND customer_id IS NOT NULL AND stay_id IS NULL) OR
         (actor_role = 'guest' AND stay_id IS NOT NULL))
);
CREATE TABLE suborders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  area text NOT NULL CHECK (area IN ('cafe','hotel')),
  status text NOT NULL CHECK (status IN ('pending_payment','waiting_gateway','queued','preparing','ready','dispatched','completed','cancelled')),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','online','none','room_charge')),
  payment_status text NOT NULL CHECK (payment_status IN ('not_required','pending','paid','room_charge')),
  total_cop bigint NOT NULL CHECK (total_cop >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, area),
  CHECK ((area = 'cafe' AND payment_method IN ('cash','online')) OR
         (area = 'hotel' AND payment_method IN ('none','room_charge')))
);
CREATE INDEX suborders_kanban_idx ON suborders(area,status,created_at);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suborder_id uuid NOT NULL REFERENCES suborders(id),
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 30),
  unit_price_cop bigint NOT NULL CHECK (unit_price_cop >= 0),
  options_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  line_total_cop bigint NOT NULL CHECK (line_total_cop >= 0)
);
CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suborder_id uuid NOT NULL REFERENCES suborders(id),
  provider text NOT NULL DEFAULT 'wompi',
  reference varchar(100) NOT NULL UNIQUE,
  amount_cop bigint NOT NULL CHECK (amount_cop >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','voided','error')),
  transaction_id varchar(150) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE room_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES stays(id),
  suborder_id uuid NOT NULL UNIQUE REFERENCES suborders(id),
  amount_cop bigint NOT NULL CHECK (amount_cop > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','voided')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  suborder_id uuid NOT NULL REFERENCES suborders(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending','processing','sent','skipped','error')),
  attempts int NOT NULL DEFAULT 0,
  processing_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX domain_events_pending_idx ON domain_events(created_at) WHERE delivery_state='pending';
COMMIT;
