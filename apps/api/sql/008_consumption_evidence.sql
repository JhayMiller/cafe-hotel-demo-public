BEGIN;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_game_group_check;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_game_group_snapshot_check;

UPDATE products
SET game_group=CASE
  WHEN game_group<>'food' THEN game_group
  WHEN lower(category || ' ' || name) ~ '(pastel|postre|torta|pan|croissant|galleta|reposter)' THEN 'pastry'
  WHEN lower(category || ' ' || name) ~ '(paquete|snack|papas|chocolat|barra|dulce)' THEN 'packaged'
  ELSE 'meal'
END;

UPDATE order_items i
SET game_group_snapshot=CASE
  WHEN i.game_group_snapshot<>'food' THEN i.game_group_snapshot
  WHEN lower(COALESCE(p.category,'') || ' ' || i.product_name) ~ '(pastel|postre|torta|pan|croissant|galleta|reposter)' THEN 'pastry'
  WHEN lower(COALESCE(p.category,'') || ' ' || i.product_name) ~ '(paquete|snack|papas|chocolat|barra|dulce)' THEN 'packaged'
  ELSE 'meal'
END
FROM products p
WHERE p.id=i.product_id;

UPDATE order_items SET game_group_snapshot='meal' WHERE game_group_snapshot='food';

ALTER TABLE products ADD CONSTRAINT products_game_group_check
  CHECK (game_group IN ('beverage','pastry','meal','packaged','other','none'));
ALTER TABLE order_items ADD CONSTRAINT order_items_game_group_snapshot_check
  CHECK (game_group_snapshot IN ('beverage','pastry','meal','packaged','other','none'));

COMMIT;
