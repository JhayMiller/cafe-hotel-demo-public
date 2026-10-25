BEGIN;

ALTER TABLE customer_game_stats
  ADD COLUMN IF NOT EXISTS practice_completed_at timestamptz;

UPDATE customer_rewards reward
SET status='voided'
WHERE reward.reward_key='record-bonus'
  AND reward.status='available'
  AND EXISTS (
    SELECT 1 FROM game_sessions session
    WHERE session.id=reward.game_session_id AND session.best_score<10
  );

COMMIT;
