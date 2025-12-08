import pool from '../db/pool.mjs';

/**
 * Inventory Movement Service
 * Handles all inventory movement tracking for transfer orders
 * Follows real-world WMS patterns: PICK → SHIP → RECEIVE
 */

/**
 * Record a PICK movement when inventory is picked from source bin
 * This is called when items are physically removed from storage
 *
 * @param {Object} params
 * @param {number} params.companyId - Company ID
 * @param {number} params.transferOrderId - Transfer order ID
 * @param {number} params.transferOrderItemId - Line item ID
 * @param {number} params.sourceInventoryId - Source inventory record ID
 * @param {number} params.quantity - Quantity being picked
 * @param {number} params.userId - User performing the pick
 */
export async function recordPickMovement({
  connection,
  companyId,
  transferOrderId,
  transferOrderItemId,
  sourceInventoryId,
  quantity,
  userId
}) {
  const sql = `
    INSERT INTO inventory_movements (
      company_id,
      transfer_order_id,
      transfer_order_item_id,
      source_inventory_id,
      part_id,
      lot_id,
      serial_number,
      from_location_id,
      from_bin_id,
      quantity,
      movement_type,
      created_by
    )
    SELECT
      i.company_id,
      ?,
      ?,
      i.inventory_id,
      i.part_id,
      i.lot_id,
      i.serial_number,
      i.location_id,
      i.bin_id,
      ?,
      'PICK',
      ?
    FROM inventory i
    WHERE i.inventory_id = ?
    LIMIT 1
  `;

  await connection.query(sql, [
    transferOrderId,
    transferOrderItemId,
    quantity,
    userId,
    sourceInventoryId
  ]);
}

/**
 * Record SHIP movements for all picked items in a transfer order
 * This is called when the order is handed off to carrier (in-transit)
 * No inventory quantities change - this is just audit trail
 *
 * @param {Object} params
 * @param {number} params.transferOrderId - Transfer order ID
 * @param {number} params.userId - User performing the ship
 */
export async function recordShipMovementsForOrder({
  connection,
  transferOrderId,
  userId
}) {
  const sql = `
    INSERT INTO inventory_movements (
      company_id,
      transfer_order_id,
      transfer_order_item_id,
      source_inventory_id,
      part_id,
      lot_id,
      from_location_id,
      from_bin_id,
      to_location_id,
      quantity,
      movement_type,
      created_by
    )
    SELECT
      i.company_id,
      to_order.transfer_order_id,
      toi.transfer_order_item_id,
      i.inventory_id,
      i.part_id,
      i.lot_id,
      i.location_id as from_location_id,
      i.bin_id as from_bin_id,
      to_order.to_location_id,
      toi.quantity_picked,
      'SHIP',
      ?
    FROM transfer_order_items toi
    JOIN transfer_orders to_order
      ON to_order.transfer_order_id = toi.transfer_order_id
    LEFT JOIN inventory i
      ON i.inventory_id = toi.picked_inventory_id
    WHERE toi.transfer_order_id = ?
      AND toi.quantity_picked > 0
  `;

  await connection.query(sql, [userId, transferOrderId]);
}

/**
 * Record a RECEIVE movement when inventory arrives at destination
 * This is called after destination inventory is created/incremented
 *
 * @param {Object} params
 * @param {number} params.transferOrderItemId - Line item ID
 * @param {number} params.destinationInventoryId - Destination inventory record ID
 * @param {number|null} params.toBinId - Destination bin ID (can be null)
 * @param {number} params.userId - User performing the receive
 */
export async function recordReceiveMovement({
  connection,
  transferOrderItemId,
  destinationInventoryId,
  toBinId,
  userId
}) {
  const sql = `
    INSERT INTO inventory_movements (
      company_id,
      transfer_order_id,
      transfer_order_item_id,
      source_inventory_id,
      destination_inventory_id,
      part_id,
      lot_id,
      serial_number,
      from_location_id,
      from_bin_id,
      to_location_id,
      to_bin_id,
      quantity,
      movement_type,
      created_by
    )
    SELECT
      i_src.company_id,
      to_order.transfer_order_id,
      toi.transfer_order_item_id,
      toi.picked_inventory_id as source_inventory_id,
      ? as destination_inventory_id,
      i_src.part_id,
      i_src.lot_id,
      i_src.serial_number,
      to_order.from_location_id,
      i_src.bin_id as from_bin_id,
      to_order.to_location_id,
      ? as to_bin_id,
      toi.quantity_picked,
      'RECEIVE',
      ?
    FROM transfer_order_items toi
    JOIN transfer_orders to_order
      ON to_order.transfer_order_id = toi.transfer_order_id
    LEFT JOIN inventory i_src
      ON i_src.inventory_id = toi.picked_inventory_id
    WHERE toi.transfer_order_item_id = ?
      AND toi.quantity_picked > 0
    LIMIT 1
  `;

  await connection.query(sql, [
    destinationInventoryId,
    toBinId,
    userId,
    transferOrderItemId
  ]);
}
