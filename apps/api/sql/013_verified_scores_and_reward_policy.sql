BEGIN;

ALTER TABLE game_attempts
  ADD COLUMN engine_version integer NOT NULL DEFAULT 1,
  ADD COLUMN terminal_tick integer,
  ADD COLUMN client_score integer,
  ADD COLUMN flap_ticks jsonb,
  ADD COLUMN verification_status text NOT NULL DEFAULT 'legacy',
  ADD COLUMN result_snapshot jsonb;

ALTER TABLE game_attempts
  ADD CONSTRAINT game_attempts_terminal_tick_check CHECK (terminal_tick IS NULL OR terminal_tick BETWEEN 1 AND 36000),
  ADD CONSTRAINT game_attempts_client_score_check CHECK (client_score IS NULL OR client_score BETWEEN 0 AND 400),
  ADD CONSTRAINT game_attempts_verification_status_check CHECK (verification_status IN ('legacy','pending','confirmed','failed'));

ALTER TABLE game_attempts DROP CONSTRAINT IF EXISTS game_attempts_status_check;
ALTER TABLE game_attempts ADD CONSTRAINT game_attempts_status_check CHECK (status IN ('active','completed','invalid'));
ALTER TABLE game_attempts DROP CONSTRAINT IF EXISTS game_attempts_score_check;
ALTER TABLE game_attempts ADD CONSTRAINT game_attempts_score_check CHECK (score IS NULL OR score BETWEEN 0 AND 400);
ALTER TABLE game_attempts DROP CONSTRAINT IF EXISTS game_attempts_session_id_player_number_key;
CREATE UNIQUE INDEX game_attempts_one_valid_player_idx ON game_attempts(session_id,player_number) WHERE status IN ('active','completed');

ALTER TABLE customer_rewards
  ADD COLUMN discount_percent integer,
  ADD COLUMN max_discount_cop bigint,
  ADD COLUMN void_reason varchar(100);

UPDATE customer_rewards SET
  discount_percent=CASE reward_key
    WHEN 'individual-15' THEN 10 WHEN 'individual-10' THEN 10
    WHEN 'friends-10' THEN 10 WHEN 'friends-5' THEN 5
    WHEN 'record-bonus' THEN 5 WHEN 'individual-coffee' THEN 10 WHEN 'friends-tasting' THEN 2 ELSE discount_percent END,
  max_discount_cop=CASE WHEN reward_key IN ('individual-15','individual-10','friends-10','friends-5','record-bonus','individual-coffee','friends-tasting')
    THEN 10000 ELSE max_discount_cop END;

UPDATE customer_rewards SET title='10% de descuento',
  description='En un próximo pedido de café, máximo $10.000 COP. No acumulable.'
WHERE reward_key='individual-15' AND status='available';

UPDATE customer_rewards SET title=CASE WHEN reward_key='friends-tasting' THEN '2% de descuento para la mesa' ELSE '10% de descuento' END,
  description='En un próximo pedido de café, máximo $10.000 COP. No acumulable.'
WHERE reward_key IN ('individual-coffee','friends-tasting') AND status='available';

UPDATE customer_rewards SET
  description='En un próximo pedido de café, máximo $10.000 COP. No acumulable.'
WHERE status='available' AND discount_percent IS NOT NULL;

ALTER TABLE customer_rewards
  ADD CONSTRAINT customer_rewards_discount_percent_check CHECK (discount_percent IS NULL OR discount_percent BETWEEN 2 AND 10),
  ADD CONSTRAINT customer_rewards_discount_cap_check CHECK (max_discount_cop IS NULL OR max_discount_cop BETWEEN 1 AND 10000),
  ADD CONSTRAINT customer_rewards_discount_fields_check CHECK ((discount_percent IS NULL)=(max_discount_cop IS NULL));

WITH ranked AS (
  SELECT id,row_number() OVER(PARTITION BY customer_id ORDER BY COALESCE(discount_percent,10) DESC,created_at DESC) AS position
  FROM customer_rewards WHERE status='available' AND expires_at>now()
)
UPDATE customer_rewards reward SET status='voided',void_reason='active_reward_limit'
FROM ranked WHERE reward.id=ranked.id AND ranked.position>3;

ALTER TABLE suborders
  ADD COLUMN discount_cop bigint NOT NULL DEFAULT 0,
  ADD COLUMN reward_id uuid REFERENCES customer_rewards(id);
ALTER TABLE suborders
  ADD CONSTRAINT suborders_discount_check CHECK (discount_cop BETWEEN 0 AND total_cop);
CREATE UNIQUE INDEX suborders_reward_once_idx ON suborders(reward_id) WHERE reward_id IS NOT NULL;

ALTER TABLE reward_redemption_challenges
  ADD COLUMN target_suborder_id uuid REFERENCES suborders(id);

COMMIT;
