BEGIN;
INSERT INTO products (id,name,description,category,area,visibility,price_cop) VALUES
  ('10000000-0000-4000-8000-000000000001','Café de la casa','Café colombiano recién preparado.','Bebidas','cafe','standard',5000),
  ('10000000-0000-4000-8000-000000000002','Capuchino','Espresso con leche cremosa.','Bebidas','cafe','standard',8500),
  ('10000000-0000-4000-8000-000000000003','Hamburguesa artesanal','Producto de ejemplo para explorar las opciones del carrito.','Alimentos','cafe','standard',25000),
  ('10000000-0000-4000-8000-000000000004','Torta del día','Una porción para acompañar tu café.','Postres','cafe','standard',10000);
INSERT INTO modifier_groups (id,name,min_selected,max_selected) VALUES
  ('20000000-0000-4000-8000-000000000001','Extras',0,2);
INSERT INTO modifier_options (id,group_id,name,type,price_delta_cop,sort_order) VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Tocineta','add',4000,1),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Queso','add',3000,2);
INSERT INTO product_modifier_groups(product_id,group_id,sort_order) VALUES
  ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',1);
COMMIT;
