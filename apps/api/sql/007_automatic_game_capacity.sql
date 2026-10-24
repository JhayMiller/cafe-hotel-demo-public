BEGIN;

ALTER TABLE products
  ADD COLUMN game_group text NOT NULL DEFAULT 'none' CHECK (game_group IN ('beverage','food','none')),
  ADD COLUMN game_units integer NOT NULL DEFAULT 1 CHECK (game_units BETWEEN 0 AND 20);

UPDATE products
SET game_group=CASE
  WHEN area<>'cafe' THEN 'none'
  WHEN lower(category) IN ('bebida','bebidas','drink','drinks') THEN 'beverage'
  ELSE 'food'
END;

ALTER TABLE order_items
  ADD COLUMN game_group_snapshot text NOT NULL DEFAULT 'none' CHECK (game_group_snapshot IN ('beverage','food','none')),
  ADD COLUMN game_units_snapshot integer NOT NULL DEFAULT 0 CHECK (game_units_snapshot BETWEEN 0 AND 20);

UPDATE order_items i
SET game_group_snapshot=p.game_group,
    game_units_snapshot=p.game_units
FROM products p
WHERE p.id=i.product_id;

ALTER TABLE table_visits DROP CONSTRAINT IF EXISTS table_visits_party_size_check;
ALTER TABLE table_visits ADD CONSTRAINT table_visits_party_size_check CHECK (party_size BETWEEN 1 AND 20);
ALTER TABLE table_visits ALTER COLUMN opened_by DROP NOT NULL;

ALTER TABLE game_entitlements DROP CONSTRAINT IF EXISTS game_entitlements_player_count_check;
ALTER TABLE game_entitlements DROP CONSTRAINT IF EXISTS game_entitlements_check;
ALTER TABLE game_entitlements ADD CONSTRAINT game_entitlements_player_count_check CHECK (player_count BETWEEN 1 AND 20);
ALTER TABLE game_entitlements ADD CONSTRAINT game_entitlements_mode_players_check
  CHECK ((mode='individual' AND player_count=1) OR (mode='friends' AND player_count BETWEEN 2 AND 20));
ALTER TABLE game_entitlements ALTER COLUMN issued_by DROP NOT NULL;

ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_player_count_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_current_player_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_player_count_check CHECK (player_count BETWEEN 1 AND 20);
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_current_player_check CHECK (current_player BETWEEN 1 AND 20);
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_mode_players_check
  CHECK ((mode='individual' AND player_count=1) OR (mode='friends' AND player_count BETWEEN 2 AND 20));

ALTER TABLE game_attempts DROP CONSTRAINT IF EXISTS game_attempts_player_number_check;
ALTER TABLE game_attempts ADD CONSTRAINT game_attempts_player_number_check CHECK (player_number BETWEEN 1 AND 20);

COMMIT;
