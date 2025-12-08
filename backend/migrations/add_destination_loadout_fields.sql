-- Migration: Add destination type and destination loadout fields to transfer_orders
-- Created: 2025-12-03
-- Description: Adds support for destination loadout assignment and delivery types

-- Add destination_type field (VARCHAR instead of ENUM per requirements)
ALTER TABLE transfer_orders
ADD COLUMN destination_type VARCHAR(50) DEFAULT 'general_delivery'
AFTER to_location_id;

-- Add destination_loadout_id field with foreign key constraint
ALTER TABLE transfer_orders
ADD COLUMN destination_loadout_id INT DEFAULT NULL
AFTER destination_type;

-- Add foreign key constraint
ALTER TABLE transfer_orders
ADD CONSTRAINT fk_transfer_orders_destination_loadout
FOREIGN KEY (destination_loadout_id)
REFERENCES container_loadouts(loadout_id)
ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_transfer_orders_destination_type ON transfer_orders(destination_type);
CREATE INDEX idx_transfer_orders_destination_loadout_id ON transfer_orders(destination_loadout_id);

-- Update existing records to have the default destination_type
UPDATE transfer_orders
SET destination_type = 'general_delivery'
WHERE destination_type IS NULL;

-- Verification query (optional - can be run separately to verify changes)
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'transfer_orders'
-- AND COLUMN_NAME IN ('destination_type', 'destination_loadout_id');
