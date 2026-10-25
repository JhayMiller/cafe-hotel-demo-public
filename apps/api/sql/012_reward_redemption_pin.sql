BEGIN;

CREATE TABLE reward_redemption_challenges (
  id uuid PRIMARY KEY,
  reward_id uuid NOT NULL REFERENCES customer_rewards(id),
  requested_by uuid NOT NULL REFERENCES staff_users(id),
  verified_by uuid REFERENCES staff_users(id),
  customer_present_confirmed boolean NOT NULL,
  code_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','expired','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  provider_message_id varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE UNIQUE INDEX reward_redemption_one_pending_idx
  ON reward_redemption_challenges(reward_id) WHERE status='pending';
CREATE INDEX reward_redemption_audit_idx
  ON reward_redemption_challenges(reward_id,created_at DESC);

COMMIT;
