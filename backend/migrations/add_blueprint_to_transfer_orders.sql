-- Migration: Add blueprint support to transfer_orders
-- Created: 2025-12-07
-- Description: Makes transfer orders reference container_blueprints for templated moves

ALTER TABLE transfer_orders
ADD COLUMN blueprint_id INT NULL
AFTER loadout_id;

ALTER TABLE transfer_orders
ADD CONSTRAINT fk_transfer_orders_blueprint
FOREIGN KEY (blueprint_id)
REFERENCES container_blueprints(blueprint_id)
ON DELETE SET NULL;

CREATE INDEX idx_transfer_orders_blueprint_id ON transfer_orders(blueprint_id);

-- Verification query (optional)
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'transfer_orders'
--   AND COLUMN_NAME = 'blueprint_id';
