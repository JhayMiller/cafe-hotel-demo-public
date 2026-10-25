BEGIN;

ALTER TABLE customer_game_stats
  ADD COLUMN IF NOT EXISTS practice_completed_at timestamptz;

-- Las cuentas que ya jugaron antes de esta mejora no deben recibir una
-- práctica de "primera visita" al volver.
UPDATE customer_game_stats
SET practice_completed_at=COALESCE(practice_completed_at,now())
WHERE games_played>0;

-- Un mismo pedido puede habilitar hasta tres partidas completas.
ALTER TABLE game_entitlements
  DROP CONSTRAINT IF EXISTS game_entitlements_table_visit_id_key;

UPDATE customer_rewards reward
SET status='voided'
WHERE reward.reward_key='record-bonus'
  AND reward.status='available'
  AND EXISTS (
    SELECT 1 FROM game_sessions session
    WHERE session.id=reward.game_session_id AND session.best_score<10
  );

COMMIT;
