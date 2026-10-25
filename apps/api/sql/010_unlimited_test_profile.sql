BEGIN;

-- El perfil preferencial de pruebas puede abrir varias sesiones con el mismo
-- pedido. Las sesiones e intentos siguen conservando su propia trazabilidad.
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_order_id_key;
ALTER TABLE game_entitlements DROP CONSTRAINT IF EXISTS game_entitlements_order_id_key;

COMMIT;
