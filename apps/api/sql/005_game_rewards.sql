BEGIN;

CREATE TABLE game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  device_hash char(64) NOT NULL,
  mode text NOT NULL CHECK (mode IN ('individual','friends')),
  player_count integer NOT NULL CHECK (player_count BETWEEN 1 AND 6),
  current_player integer NOT NULL DEFAULT 1 CHECK (current_player BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired')),
  total_score integer NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  best_score integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mode='individual' AND player_count=1) OR (mode='friends' AND player_count BETWEEN 2 AND 6))
);
CREATE INDEX game_sessions_customer_idx ON game_sessions(customer_id,created_at DESC);
CREATE INDEX game_sessions_device_idx ON game_sessions(device_hash,created_at DESC);

CREATE TABLE game_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_number integer NOT NULL CHECK (player_number BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  score integer CHECK (score BETWEEN 0 AND 250),
  duration_ms integer CHECK (duration_ms BETWEEN 500 AND 600000),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(session_id,player_number)
);

CREATE TABLE customer_game_stats (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  best_score integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  last_individual_play_at timestamptz,
  games_played integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  game_session_id uuid NOT NULL REFERENCES game_sessions(id),
  reward_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('customer','table')),
  title varchar(140) NOT NULL,
  description varchar(300) NOT NULL,
  redemption_code varchar(20) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed','expired','voided')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES staff_users(id),
  UNIQUE(game_session_id,reward_key)
);
CREATE INDEX customer_rewards_lookup_idx ON customer_rewards(customer_id,status,expires_at);

COMMIT;
