BEGIN;

ALTER TABLE customers
  ADD COLUMN payment_bypass boolean NOT NULL DEFAULT false;

COMMIT;
