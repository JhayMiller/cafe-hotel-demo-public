BEGIN;
INSERT INTO products (id,name,description,category,area,visibility,price_cop) VALUES
  ('10000000-0000-4000-8000-000000000101','Toallas adicionales','Llevamos un juego limpio hasta tu habitación.','Comodidad','hotel','guest',0),
  ('10000000-0000-4000-8000-000000000102','Aseo de habitación','Solicita una visita del equipo de limpieza.','Habitación','hotel','guest',0),
  ('10000000-0000-4000-8000-000000000103','Desayuno a la habitación','Desayuno de la casa servido en tu habitación.','Alimentos','hotel','guest',18000),
  ('10000000-0000-4000-8000-000000000104','Salida tardía','Consulta disponibilidad para extender tu salida.','Estadía','hotel','guest',0)
ON CONFLICT (id) DO NOTHING;
COMMIT;
