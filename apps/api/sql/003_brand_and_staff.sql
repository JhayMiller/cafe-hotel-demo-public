BEGIN;

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS display_name varchar(120);

CREATE TABLE IF NOT EXISTS brand_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  name varchar(140) NOT NULL,
  short_name varchar(60) NOT NULL,
  tagline varchar(180) NOT NULL DEFAULT '',
  description varchar(500) NOT NULL DEFAULT '',
  logo_url text,
  hero_image_url text,
  primary_color varchar(7) NOT NULL DEFAULT '#9B1C1F',
  secondary_color varchar(7) NOT NULL DEFAULT '#604536',
  accent_color varchar(7) NOT NULL DEFAULT '#D09A52',
  surface_color varchar(7) NOT NULL DEFAULT '#F4EDE3',
  guest_title varchar(160) NOT NULL DEFAULT 'Tu habitación, más cerca de todo',
  guest_description varchar(500) NOT NULL DEFAULT 'Pide a la habitación, solicita amenidades y sigue cada servicio desde aquí.',
  address varchar(240) NOT NULL DEFAULT '',
  phone varchar(40) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO brand_settings (
  singleton,name,short_name,tagline,description,primary_color,secondary_color,accent_color,surface_color,
  guest_title,guest_description
) VALUES (
  true,'Posada del Puerto | café hotel','Posada del Puerto','Café, descanso y hospitalidad junto al puerto.',
  'Sabores honestos, madera cálida y una estadía atendida con cercanía.',
  '#9B1C1F','#604536','#D09A52','#F4EDE3',
  'Tu habitación, más cerca de todo',
  'Entra con el número de tu habitación y el PIN de recepción para pedir alimentos, solicitar amenidades y seguir el servicio.'
) ON CONFLICT (singleton) DO NOTHING;

COMMIT;
