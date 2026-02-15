-- Migration: enforce unique (loadout_id, product_id, lot_id) for loadout lot upserts
-- Purpose: make ON DUPLICATE KEY UPDATE work in transfer receive flow

START TRANSACTION;

-- 1) Consolidate duplicate groups onto the earliest row and sum quantities
UPDATE container_loadout_lots keep_row
JOIN (
  SELECT
    MIN(loadout_lot_id) AS keep_id,
    loadout_id,
    product_id,
    lot_id,
    SUM(quantity_used) AS total_quantity_used,
    NULLIF(
      TRIM(
        GROUP_CONCAT(
          DISTINCT NULLIF(notes, '')
          ORDER BY loadout_lot_id
          SEPARATOR ' | '
        )
      ),
      ''
    ) AS merged_notes
  FROM container_loadout_lots
  GROUP BY loadout_id, product_id, lot_id
  HAVING COUNT(*) > 1
) dup
  ON keep_row.loadout_lot_id = dup.keep_id
SET
  keep_row.quantity_used = dup.total_quantity_used,
  keep_row.notes = COALESCE(dup.merged_notes, keep_row.notes);

-- 2) Delete duplicate rows after consolidation
DELETE cll
FROM container_loadout_lots cll
JOIN (
  SELECT
    MIN(loadout_lot_id) AS keep_id,
    loadout_id,
    product_id,
    lot_id
  FROM container_loadout_lots
  GROUP BY loadout_id, product_id, lot_id
  HAVING COUNT(*) > 1
) dup
  ON cll.loadout_id = dup.loadout_id
 AND cll.product_id = dup.product_id
 AND cll.lot_id <=> dup.lot_id
 AND cll.loadout_lot_id <> dup.keep_id;

-- 3) Add the unique key that ON DUPLICATE KEY UPDATE relies on
ALTER TABLE container_loadout_lots
ADD UNIQUE KEY uk_loadout_product_lot (loadout_id, product_id, lot_id);

COMMIT;
