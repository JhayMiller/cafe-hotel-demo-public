BEGIN;

CREATE TABLE table_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_key varchar(60) NOT NULL,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  opened_by uuid NOT NULL REFERENCES staff_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '4 hours',
  closed_by uuid REFERENCES staff_users(id),
  closed_at timestamptz
);
CREATE UNIQUE INDEX table_visits_one_active_idx ON table_visits(table_key) WHERE status='active';

CREATE TABLE game_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  table_key varchar(60),
  table_visit_id uuid UNIQUE REFERENCES table_visits(id),
  mode text NOT NULL CHECK (mode IN ('individual','friends')),
  player_count integer NOT NULL CHECK (player_count BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','claimed','completed','revoked','expired')),
  issued_by uuid NOT NULL REFERENCES staff_users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '4 hours',
  claimed_at timestamptz,
  completed_at timestamptz,
  CHECK ((mode='individual' AND player_count=1) OR (mode='friends' AND player_count BETWEEN 2 AND 6)),
  CHECK (mode='individual' OR table_key IS NOT NULL)
);
CREATE INDEX game_entitlements_table_idx ON game_entitlements(table_key,issued_at DESC) WHERE table_key IS NOT NULL;

ALTER TABLE game_sessions
  ADD COLUMN entitlement_id uuid UNIQUE REFERENCES game_entitlements(id),
  ADD COLUMN table_key varchar(60);

ALTER TABLE game_attempts
  ADD COLUMN seed integer NOT NULL DEFAULT (floor(random()*2147483646)::integer + 1),
  ADD COLUMN flap_count integer NOT NULL DEFAULT 0 CHECK (flap_count >= 0);

CREATE TABLE game_security_events (
  id bigserial PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  game_session_id uuid REFERENCES game_sessions(id),
  game_attempt_id uuid REFERENCES game_attempts(id),
  event_type varchar(60) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_security_events_created_idx ON game_security_events(created_at DESC);

COMMIT;
