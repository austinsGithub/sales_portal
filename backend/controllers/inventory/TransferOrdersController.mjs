import pool from '../../db/pool.mjs';
import { ContainerLoadoutsModel } from '../../models/inventory/ContainerLoadouts.mjs';
import {
  recordPickMovement,
  recordShipMovementsForOrder,
  recordReceiveMovement
} from '../../services/InventoryMovementService.mjs';

const MAX_LIMIT = 250;

const exec = (connection, sql, params = []) =>
  connection ? connection.query(sql, params) : pool.query(sql, params);

const pick = (obj = {}, keys = []) => {
  const out = {};
  keys.forEach((key) => {
    if (obj[key] !== undefined) out[key] = obj[key];
  });
  return out;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const TERMINAL_OR_IN_PROGRESS_STATUSES = new Set(['Picked', 'Packed', 'Shipped', 'Received', 'Completed']);
const EDITABLE_ORDER_STATUSES = new Set(['Pending', 'Approved']);

async function releaseReservation({
  connection,
  company_id,
  inventory_id,
  quantity
}) {
  const qty = Number(quantity) || 0;
  if (!inventory_id || qty <= 0) return;

  await exec(
    connection,
    `UPDATE inventory
     SET quantity_available = quantity_available + LEAST(COALESCE(quantity_reserved, 0), ?),
         quantity_reserved  = GREATEST(COALESCE(quantity_reserved, 0) - ?, 0)
     WHERE inventory_id = ? AND company_id = ?`,
    [qty, qty, inventory_id, company_id]
  );
}

async function releaseUnpickedReservationsForOrder({
  connection,
  company_id,
  transfer_order_id
}) {
  const [items] = await exec(
    connection,
    `SELECT
      transfer_order_item_id,
      inventory_id,
      picked_inventory_id,
      quantity,
      quantity_picked
     FROM transfer_order_items
     WHERE transfer_order_id = ? AND company_id = ?`,
    [transfer_order_id, company_id]
  );

  for (const item of items) {
    const sourceInventoryId = item.picked_inventory_id || item.inventory_id;
    const ordered = Number(item.quantity) || 0;
    const picked = Number(item.quantity_picked) || 0;
    const unpickedQty = Math.max(ordered - picked, 0);

    if (sourceInventoryId && unpickedQty > 0) {
      await releaseReservation({
        connection,
        company_id,
        inventory_id: sourceInventoryId,
        quantity: unpickedQty
      });
    }
  }

  return items;
}

/**
 * Validates that all items in a transfer order match the destination loadout blueprint
 * @param {Array} items - Transfer order items with part_id
 * @param {Number} blueprintId - Destination loadout blueprint ID
 * @param {Number} companyId - Company ID for security
 * @param {Object} connection - Database connection
 * @returns {Object} { valid: boolean, invalidItems: Array, blueprintItems: Array }
 */
async function validateItemsAgainstBlueprint(items, blueprintId, companyId, connection) {
  // Fetch all blueprint items
  const [blueprintItems] = await exec(
    connection,
    `SELECT cbi.*, prod.part_id, prod.product_name, parts.sku
     FROM container_blueprint_items cbi
     JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
     JOIN products prod ON cbi.product_id = prod.product_id
     LEFT JOIN parts ON prod.part_id = parts.part_id
     WHERE cbi.blueprint_id = ? AND cb.company_id = ?`,
    [blueprintId, companyId]
  );

  const allowedPartIds = new Set(
    blueprintItems.map(item => item.part_id).filter(Boolean)
  );

  const invalidItems = items.filter(item =>
    item.part_id && !allowedPartIds.has(item.part_id)
  );

  return {
    valid: invalidItems.length === 0,
    invalidItems,
    blueprintItems,
    allowedPartIds: Array.from(allowedPartIds)
  };
}

async function generateTransferOrderNumber(company_id) {
  const [[last]] = await pool.query(
    `SELECT transfer_order_number
     FROM transfer_orders
     WHERE company_id = ?
     ORDER BY transfer_order_id DESC
     LIMIT 1`,
    [company_id]
  );

  if (!last?.transfer_order_number) {
    return 'TO-0001';
  }

  const [, numeric] = last.transfer_order_number.split('-');
  const nextSequence = (parseInt(numeric, 10) || 0) + 1;
  return `TO-${String(nextSequence).padStart(4, '0')}`;
}

async function fetchBlueprintItems(connection, blueprint_id, company_id) {
  if (!blueprint_id) return [];

  const [rows] = await exec(
    connection,
    `SELECT 
      cbi.blueprint_item_id,
      cbi.product_id,
      cbi.minimum_quantity,
      cbi.maximum_quantity,
      cbi.default_quantity,
      cbi.usage_notes,
      COALESCE(cbi.default_quantity, cbi.minimum_quantity, 1) AS required_quantity,
      prod.product_name,
      prod.public_sku,
      prod.product_id,
      parts.part_id,
      parts.product_name AS part_product_name,
      parts.sku AS part_sku,
      parts.gtin AS part_gtin,
      parts.unit_of_measure AS part_unit_of_measure
     FROM container_blueprint_items cbi
     JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
     LEFT JOIN products prod ON cbi.product_id = prod.product_id
     LEFT JOIN parts parts ON prod.part_id = parts.part_id
     WHERE cbi.blueprint_id = ? AND cb.company_id = ?`,
    [blueprint_id, company_id]
  );

  return rows;
}

async function fetchBlueprintItemById(connection, blueprint_item_id, company_id, blueprint_id) {
  if (!blueprint_item_id) return null;

  const [[item]] = await exec(
    connection,
    `SELECT 
      cbi.blueprint_item_id,
      cbi.product_id,
      cbi.minimum_quantity,
      cbi.maximum_quantity,
      cbi.default_quantity,
      cbi.usage_notes,
      COALESCE(cbi.default_quantity, cbi.minimum_quantity, 1) AS required_quantity,
      prod.product_name,
      prod.public_sku,
      prod.product_id,
      parts.part_id,
      parts.product_name AS part_product_name,
      parts.sku AS part_sku,
      parts.gtin AS part_gtin,
      parts.unit_of_measure AS part_unit_of_measure
     FROM container_blueprint_items cbi
     JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
     LEFT JOIN products prod ON cbi.product_id = prod.product_id
     LEFT JOIN parts parts ON prod.part_id = parts.part_id
     WHERE cbi.blueprint_item_id = ?
       AND cb.company_id = ?
       AND cb.blueprint_id = ?`,
    [blueprint_item_id, company_id, blueprint_id]
  );

  return item || null;
}

async function getAssignedQuantity(connection, transfer_order_id, part_id) {
  if (!part_id) return 0;
  const [[row]] = await exec(
    connection,
    `SELECT COALESCE(SUM(quantity), 0) AS assigned
     FROM transfer_order_items
     WHERE transfer_order_id = ? AND part_id = ?`,
    [transfer_order_id, part_id]
  );
  return Number(row?.assigned || 0);
}

async function assignInventoryToOrder({
  connection,
  company_id,
  order,
  blueprintItem,
  inventoryRow,
  quantity,
  note
}) {
  const qty = Math.min(
    Number(quantity) || 0,
    Number(inventoryRow.quantity_available) || 0
  );

  if (!qty || qty <= 0) {
    throw new Error('Quantity must be greater than zero and within availability.');
  }

  if (
    order.from_location_id &&
    inventoryRow.location_id &&
    Number(inventoryRow.location_id) !== Number(order.from_location_id)
  ) {
    throw new Error('Inventory must be pulled from the transfer origin location.');
  }

  const part_id = blueprintItem?.part_id || inventoryRow.part_id;
  if (!part_id) {
    throw new Error('Inventory part reference is missing.');
  }

  await exec(
    connection,
    `UPDATE inventory
     SET quantity_available = quantity_available - ?,
         quantity_reserved = COALESCE(quantity_reserved, 0) + ?
     WHERE inventory_id = ?`,
    [qty, qty, inventoryRow.inventory_id]
  );

  if (order.loadout_id) {
    // Resolve product_id: from blueprint item if available, otherwise look up from part_id
    let productId = blueprintItem?.product_id || null;
    if (!productId && part_id) {
      const [[prod]] = await exec(
        connection,
        `SELECT product_id FROM products WHERE part_id = ? AND company_id = ? LIMIT 1`,
        [part_id, company_id]
      );
      productId = prod?.product_id || null;
    }

    if (productId) {
      await exec(
        connection,
        `INSERT INTO container_loadout_lots
          (loadout_id, product_id, lot_id, quantity_used, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          order.loadout_id,
          productId,
          inventoryRow.lot_id || null,
          qty,
          note || `Manual assignment for transfer order ${order.transfer_order_number}`
        ]
      );
    }
  }

  const [result] = await exec(
    connection,
    `INSERT INTO transfer_order_items (
      transfer_order_id,
      loadout_id,
      inventory_id,
      picked_inventory_id,
      part_id,
      lot_id,
      quantity,
      unit_of_measure,
      serial_number,
      expiration_date,
      notes,
      company_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.transfer_order_id,
      order.loadout_id || null,
      inventoryRow.inventory_id,
      inventoryRow.inventory_id,
      part_id,
      inventoryRow.lot_id || null,
      qty,
      blueprintItem?.part_unit_of_measure || inventoryRow.unit_of_measure || 'EA',
      inventoryRow.serial_number || null,
      inventoryRow.expiration_date || null,
      note || null,
      company_id
    ]
  );

  return {
    quantity_applied: qty,
    transfer_order_item_id: result?.insertId || null
  };
}

async function autoAssignBlueprintInventory({
  connection,
  company_id,
  blueprint_id,
  loadout_id,
  transfer_order_id,
  from_location_id,
  transfer_order_number,
  targetBlueprintItemId,
  assignedQuantities = {}
}) {
  if (!blueprint_id || !loadout_id) return;

  const blueprintItems = await fetchBlueprintItems(
    connection,
    Number(blueprint_id),
    company_id
  );

  const orderStub = {
    transfer_order_id,
    loadout_id,
    transfer_order_number,
    from_location_id
  };

  for (const item of blueprintItems) {
    if (targetBlueprintItemId && item.blueprint_item_id !== targetBlueprintItemId) {
      continue;
    }

    if (!item.part_id || !item.required_quantity) continue;

    const assignedAlready = Number(assignedQuantities[item.part_id] || 0);
    let remaining = Math.max(
      (Number(item.required_quantity) || 0) - assignedAlready,
      0
    );
    if (remaining <= 0) continue;

    const [inventoryRows] = await exec(
      connection,
      `SELECT
        inv.inventory_id,
        inv.part_id,
        inv.lot_id,
        inv.quantity_available,
        inv.serial_number,
        inv.location_id,
        inv.bin_id,
        l.expiration_date,
        b.aisle,
        b.rack,
        b.shelf,
        b.bin,
        b.zone
       FROM inventory inv
       LEFT JOIN lots l ON inv.lot_id = l.lot_id
       LEFT JOIN bins b ON inv.bin_id = b.bin_id AND b.company_id = inv.company_id
       WHERE inv.company_id = ?
         AND inv.location_id = ?
         AND inv.part_id = ?
         AND inv.quantity_available > 0
       ORDER BY
         CASE WHEN l.expiration_date IS NULL THEN 1 ELSE 0 END,
         l.expiration_date ASC`,
      [company_id, Number(from_location_id), item.part_id]
    );

    for (const invRow of inventoryRows) {
      if (remaining <= 0) break;

      const availableQty = Number(invRow.quantity_available) || 0;
      if (availableQty <= 0) continue;

      const consume = Math.min(remaining, availableQty);
      if (consume <= 0) continue;

      await assignInventoryToOrder({
        connection,
        company_id,
        order: orderStub,
        blueprintItem: item,
        inventoryRow: invRow,
        quantity: consume,
        note: 'Auto-assigned from blueprint'
      });
      remaining -= consume;
    }

    if (remaining > 0) {
      console.warn(
        `Insufficient inventory for blueprint item ${item.blueprint_item_id}. Short ${remaining} units.`
      );
    }
  }
}

async function fetchOrder(company_id, orderId) {
  const [[order]] = await pool.query(
    `SELECT
      o.*,
      fl.location_name AS from_location_name,
      fl.location_type AS from_location_type,
      fl.address AS from_address,
      fl.city AS from_city,
      fl.state AS from_state,
      fl.country AS from_country,
      fl.postal_code AS from_postal_code,
      tl.location_name AS to_location_name,
      tl.location_type AS to_location_type,
      tl.address AS to_address,
      tl.city AS to_city,
      tl.state AS to_state,
      tl.country AS to_country,
      tl.postal_code AS to_postal_code,
      cl.loadout_id,
      cl.blueprint_id AS loadout_blueprint_id,
      cl.serial_suffix AS loadout_serial_suffix,
      COALESCE(ob.blueprint_name, cb.blueprint_name) AS blueprint_name,
      ob.blueprint_name AS order_blueprint_name,
      cb.blueprint_name AS loadout_blueprint_name,
      dl.serial_suffix AS destination_loadout_serial,
      CONCAT(dcb.serial_number_prefix, dl.serial_suffix) AS destination_loadout_full_serial,
      dcb.blueprint_name AS destination_blueprint_name,
      creator.first_name AS created_by_first_name,
      creator.last_name AS created_by_last_name,
      approver.first_name AS approved_by_first_name,
      approver.last_name AS approved_by_last_name,
      picker.first_name AS picked_by_first_name,
      picker.last_name AS picked_by_last_name,
      packer.first_name AS packed_by_first_name,
      packer.last_name AS packed_by_last_name,
      shipper.first_name AS shipped_by_first_name,
      shipper.last_name AS shipped_by_last_name,
      receiver.first_name AS received_by_first_name,
      receiver.last_name AS received_by_last_name
    FROM transfer_orders o
    LEFT JOIN locations fl ON o.from_location_id = fl.location_id
    LEFT JOIN locations tl ON o.to_location_id = tl.location_id
    LEFT JOIN container_loadouts cl ON o.loadout_id = cl.loadout_id
    LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
    LEFT JOIN container_blueprints ob ON o.blueprint_id = ob.blueprint_id
    LEFT JOIN container_loadouts dl ON o.destination_loadout_id = dl.loadout_id
    LEFT JOIN container_blueprints dcb ON dl.blueprint_id = dcb.blueprint_id
    LEFT JOIN users creator ON o.created_by = creator.user_id
    LEFT JOIN users approver ON o.approved_by = approver.user_id
    LEFT JOIN users picker ON o.picked_by = picker.user_id
    LEFT JOIN users packer ON o.packed_by = packer.user_id
    LEFT JOIN users shipper ON o.shipped_by = shipper.user_id
    LEFT JOIN users receiver ON o.received_by = receiver.user_id
    WHERE o.company_id = ? AND o.transfer_order_id = ?`,
    [company_id, orderId]
  );

  return order || null;
}

async function fetchOrderItems(company_id, orderId) {
  const [items] = await pool.query(
    `SELECT
      toi.*,
      p.product_name,
      p.sku,
      p.gtin,
      p.unit_of_measure AS part_unit_of_measure,
      l.lot_number,
      l.expiration_date,
      inv.serial_number AS inventory_serial_number,
      inv.quantity_available,
      inv.bin_id,
      loc.location_name AS inventory_location,
      b.aisle,
      b.rack,
      b.shelf,
      b.bin,
      b.zone
    FROM transfer_order_items toi
    LEFT JOIN inventory inv ON toi.inventory_id = inv.inventory_id
    LEFT JOIN parts p ON p.part_id = COALESCE(toi.part_id, inv.part_id)
    LEFT JOIN lots l ON l.lot_id = COALESCE(toi.lot_id, inv.lot_id)
    LEFT JOIN locations loc ON inv.location_id = loc.location_id
    LEFT JOIN bins b ON inv.bin_id = b.bin_id AND b.company_id = toi.company_id
    WHERE toi.transfer_order_id = ? AND toi.company_id = ?
    ORDER BY toi.transfer_order_item_id ASC`,
    [orderId, company_id]
  );

  return items;
}

async function buildLoadoutDetails(company_id, order, items) {
  if (!order?.loadout_id) return null;

  const [[loadout]] = await pool.query(
    `SELECT 
      cl.loadout_id,
      cl.serial_suffix,
      cl.blueprint_id,
      cb.blueprint_name,
      cb.serial_number_prefix
     FROM container_loadouts cl
     LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
     WHERE cl.loadout_id = ? AND cl.company_id = ?`,
    [order.loadout_id, company_id]
  );

  if (!loadout) return null;

  const [blueprintItems] = await pool.query(
    `SELECT 
      cbi.blueprint_item_id,
      cbi.product_id,
      cbi.minimum_quantity,
      cbi.maximum_quantity,
      cbi.default_quantity,
      cbi.usage_notes,
      COALESCE(cbi.default_quantity, cbi.minimum_quantity, 1) AS required_quantity,
      prod.product_name,
      prod.public_sku,
      parts.part_id,
      parts.product_name AS part_product_name,
      parts.sku AS part_sku,
      parts.gtin AS part_gtin,
      parts.unit_of_measure AS part_unit_of_measure
     FROM container_blueprint_items cbi
     JOIN container_blueprints cb ON cbi.blueprint_id = cb.blueprint_id
     LEFT JOIN products prod ON cbi.product_id = prod.product_id
     LEFT JOIN parts parts ON prod.part_id = parts.part_id
     WHERE cbi.blueprint_id = ? AND cb.company_id = ?`,
    [loadout.blueprint_id, company_id]
  );

  const grouped = blueprintItems.map((bp) => {
    const lines = (items || []).filter(
      (line) =>
        line.loadout_id === order.loadout_id &&
        bp.part_id &&
        line.part_id === bp.part_id
    );
    const assigned = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    return {
      ...bp,
      assigned_quantity: assigned,
      lines
    };
  });

  return {
    loadout_id: loadout.loadout_id,
    serial_suffix: loadout.serial_suffix,
    blueprint_id: loadout.blueprint_id,
    blueprint_name: loadout.blueprint_name,
    blueprint_items: grouped
  };
}

async function getOrderWithItems(company_id, orderId) {
  const order = await fetchOrder(company_id, orderId);
  if (!order) return null;
  order.items = await fetchOrderItems(company_id, orderId);
  order.loadout_details = await buildLoadoutDetails(company_id, order, order.items);
  return order;
}

class TransferOrdersController {
  async getAll(req, res) {
    try {
      const company_id = req.user?.company_id;
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });

      const {
        status,
        from_location_id,
        to_location_id,
        priority,
        start_date,
        end_date,
        limit = 100,
        offset = 0
      } = req.query;

      const params = [company_id];
      let where = 'WHERE o.company_id = ?';

      if (status) {
        where += ' AND o.status = ?';
        params.push(status);
      }

      if (from_location_id) {
        where += ' AND o.from_location_id = ?';
        params.push(Number(from_location_id));
      }

      if (to_location_id) {
        where += ' AND o.to_location_id = ?';
        params.push(Number(to_location_id));
      }

      if (priority) {
        where += ' AND o.priority = ?';
        params.push(priority);
      }

      if (start_date) {
        where += ' AND o.created_at >= ?';
        params.push(new Date(start_date));
      }

      if (end_date) {
        where += ' AND o.created_at <= ?';
        params.push(new Date(end_date));
      }

      const safeLimit = Math.min(Number(limit) || 100, MAX_LIMIT);
      const safeOffset = Math.max(Number(offset) || 0, 0);

      // Get total count for pagination
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(DISTINCT o.transfer_order_id) as total
        FROM transfer_orders o
        LEFT JOIN locations fl ON o.from_location_id = fl.location_id
        LEFT JOIN locations tl ON o.to_location_id = tl.location_id
        LEFT JOIN container_loadouts cl ON o.loadout_id = cl.loadout_id
        LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
        LEFT JOIN container_blueprints ob ON o.blueprint_id = ob.blueprint_id
        LEFT JOIN users creator ON o.created_by = creator.user_id
        ${where}`,
        params
      );

      params.push(safeLimit, safeOffset);

      const [rows] = await pool.query(
        `SELECT
          o.*,
          fl.location_name AS from_location_name,
          tl.location_name AS to_location_name,
          cl.serial_suffix AS loadout_serial_suffix,
          cl.blueprint_id AS loadout_blueprint_id,
          COALESCE(ob.blueprint_name, cb.blueprint_name) AS blueprint_name,
          ob.blueprint_name AS order_blueprint_name,
          cb.blueprint_name AS loadout_blueprint_name,
          dl.serial_suffix AS destination_loadout_serial,
          CONCAT(dcb.serial_number_prefix, dl.serial_suffix) AS destination_loadout_full_serial,
          dcb.blueprint_name AS destination_blueprint_name,
          creator.first_name AS created_by_first_name,
          creator.last_name AS created_by_last_name,
          COUNT(items.transfer_order_item_id) AS item_count
        FROM transfer_orders o
        LEFT JOIN locations fl ON o.from_location_id = fl.location_id
        LEFT JOIN locations tl ON o.to_location_id = tl.location_id
        LEFT JOIN container_loadouts cl ON o.loadout_id = cl.loadout_id
        LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
        LEFT JOIN container_blueprints ob ON o.blueprint_id = ob.blueprint_id
        LEFT JOIN container_loadouts dl ON o.destination_loadout_id = dl.loadout_id
        LEFT JOIN container_blueprints dcb ON dl.blueprint_id = dcb.blueprint_id
        LEFT JOIN users creator ON o.created_by = creator.user_id
        LEFT JOIN transfer_order_items items ON o.transfer_order_id = items.transfer_order_id
        ${where}
        GROUP BY o.transfer_order_id
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`,
        params
      );

      return res.json({
        data: rows,
        pagination: {
          total: Number(total),
          limit: safeLimit,
          offset: safeOffset,
          page: Math.floor(safeOffset / safeLimit) + 1,
          totalPages: Math.ceil(total / safeLimit)
        }
      });
    } catch (error) {
      console.error('Error fetching transfer orders:', error);
      return res.status(500).json({ error: 'Failed to fetch transfer orders' });
    }
  }

  async getById(req, res) {
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      const order = await getOrderWithItems(company_id, id);
      if (!order) return res.status(404).json({ error: 'Transfer order not found' });

      return res.json(order);
    } catch (error) {
      console.error('Error fetching transfer order:', error);
      return res.status(500).json({ error: 'Failed to fetch transfer order' });
    }
  }

  async create(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const user_id = req.user?.user_id;
      if (!company_id || !user_id) {
        return res.status(401).json({ error: 'Missing user context' });
      }

      const {
        from_location_id,
        to_location_id,
        destination_type = 'general_delivery',
        destination_loadout_id = null,
        loadout_id = null,
        blueprint_id,
        transfer_reason,
        priority = 'Medium',
        requested_date,
        notes,
        items = []
      } = req.body || {};

      if (!from_location_id || !to_location_id) {
        return res.status(400).json({ error: 'from_location_id and to_location_id are required' });
      }

      if (Number(from_location_id) === Number(to_location_id)) {
        return res.status(400).json({ error: 'Source and destination locations must be different' });
      }

      // Validate destination type
      const validTypes = ['general_delivery', 'loadout_restock'];
      if (!validTypes.includes(destination_type)) {
        return res.status(400).json({
          error: 'Invalid destination_type. Must be general_delivery or loadout_restock'
        });
      }

      // If loadout restock, destination_loadout_id is required
      if (destination_type === 'loadout_restock') {
        if (!destination_loadout_id) {
          return res.status(400).json({
            error: 'destination_loadout_id is required when destination_type is loadout_restock'
          });
        }

        // Verify loadout exists and is at destination location
        const [[destLoadout]] = await pool.query(
          `SELECT cl.loadout_id, cl.blueprint_id, cl.location_id
           FROM container_loadouts cl
           WHERE cl.loadout_id = ? AND cl.company_id = ? AND cl.is_active = 1`,
          [destination_loadout_id, company_id]
        );

        if (!destLoadout) {
          return res.status(404).json({
            error: 'Destination loadout not found or inactive'
          });
        }

        if (Number(destLoadout.location_id) !== Number(to_location_id)) {
          return res.status(400).json({
            error: 'Destination loadout must be at the destination location'
          });
        }
      } else {
        // General delivery - destination_loadout_id must be null
        if (destination_loadout_id) {
          return res.status(400).json({
            error: 'destination_loadout_id must be null for general_delivery type'
          });
        }
      }

      // Validate manually-selected source loadout (no auto-creation)
      let sourceLoadoutId = null;
      let sourceBlueprintId = blueprint_id ? Number(blueprint_id) : null;

      if (loadout_id) {
        const loadout = await ContainerLoadoutsModel.getById(Number(loadout_id), company_id);
        if (!loadout || loadout.is_active === 0) {
          return res.status(404).json({ error: 'Loadout not found or inactive' });
        }

        if (Number(loadout.location_id) !== Number(from_location_id)) {
          return res.status(400).json({
            error: 'Selected loadout must be at the transfer origin location'
          });
        }

        if (
          sourceBlueprintId &&
          loadout.blueprint_id &&
          Number(sourceBlueprintId) !== Number(loadout.blueprint_id)
        ) {
          return res.status(400).json({
            error: 'Selected loadout blueprint does not match provided blueprint_id'
          });
        }

        sourceLoadoutId = loadout.loadout_id;
        sourceBlueprintId = loadout.blueprint_id || sourceBlueprintId;
      }

      await connection.beginTransaction();

      const transfer_order_number = await generateTransferOrderNumber(company_id);

      const [result] = await connection.query(
        `INSERT INTO transfer_orders (
          transfer_order_number,
          from_location_id,
          to_location_id,
          destination_type,
          destination_loadout_id,
          loadout_id,
          blueprint_id,
          transfer_reason,
          status,
          priority,
          requested_date,
          notes,
          created_by,
          company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?)`,
        [
          transfer_order_number,
          Number(from_location_id),
          Number(to_location_id),
          destination_type,
          destination_loadout_id ? Number(destination_loadout_id) : null,
          sourceLoadoutId,
          sourceBlueprintId,
          transfer_reason || null,
          priority,
          parseDateOrNull(requested_date),
          notes || null,
          user_id,
          company_id
        ]
      );

      const transfer_order_id = result.insertId;

      if (Array.isArray(items) && items.length > 0) {
        const orderStub = {
          transfer_order_id,
          loadout_id: sourceLoadoutId || null,
          transfer_order_number,
          from_location_id: Number(from_location_id)
        };

        for (const item of items) {
          const qty = Number(item.quantity) || 0;
          if (!qty || qty <= 0) continue;

          if (item.inventory_id) {
            const [[inventoryRow]] = await connection.query(
              `SELECT * FROM inventory WHERE inventory_id = ? AND company_id = ?`,
              [item.inventory_id, company_id]
            );

            if (!inventoryRow) {
              throw new Error(`Inventory ${item.inventory_id} not found for this company.`);
            }

            if (
              orderStub.from_location_id &&
              inventoryRow.location_id &&
              Number(inventoryRow.location_id) !== Number(orderStub.from_location_id)
            ) {
              await connection.rollback();
              return res.status(400).json({
                error: 'Inventory must be pulled from the transfer origin location.',
                inventory_id: item.inventory_id
              });
            }

            await assignInventoryToOrder({
              connection,
              company_id,
              order: orderStub,
              blueprintItem: null,
              inventoryRow,
              quantity: qty,
              note: item.notes || null
            });
            continue;
          }

          await connection.query(
            `INSERT INTO transfer_order_items (
              transfer_order_id,
              loadout_id,
              inventory_id,
              picked_inventory_id,
              part_id,
              lot_id,
              quantity,
              unit_of_measure,
              serial_number,
              expiration_date,
              notes,
              company_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              transfer_order_id,
              sourceLoadoutId || null,
              item.inventory_id || null,
              item.inventory_id || null,
              item.part_id || null,
              item.lot_id || null,
              qty,
              item.unit_of_measure || item.part?.unit_of_measure || 'EA',
              item.serial_number || null,
              parseDateOrNull(item.expiration_date),
              item.notes || null,
              company_id
            ]
          );
        }
      }

      // Validate items against destination loadout blueprint if restock type
      if (destination_type === 'loadout_restock' && destination_loadout_id) {
        // Get blueprint_id from destination loadout
        const [[destLoadout]] = await connection.query(
          `SELECT blueprint_id FROM container_loadouts
           WHERE loadout_id = ? AND company_id = ?`,
          [destination_loadout_id, company_id]
        );

        if (destLoadout && destLoadout.blueprint_id) {
          // Fetch all items for this transfer order
          const [orderItems] = await connection.query(
            `SELECT part_id FROM transfer_order_items
             WHERE transfer_order_id = ? AND company_id = ?`,
            [transfer_order_id, company_id]
          );

          if (orderItems.length > 0) {
            // Validate items
            const validation = await validateItemsAgainstBlueprint(
              orderItems,
              destLoadout.blueprint_id,
              company_id,
              connection
            );

            if (!validation.valid) {
              await connection.rollback();
              return res.status(400).json({
                error: 'Some items are not defined in the destination loadout blueprint',
                invalidItems: validation.invalidItems.map(item => ({
                  part_id: item.part_id
                })),
                message: 'When restocking a loadout, only items defined in its blueprint can be sent'
              });
            }
          }
        }
      }

      await connection.commit();

      const order = await getOrderWithItems(company_id, transfer_order_id);
      return res.status(201).json(order);
    } catch (error) {
      await connection.rollback();
      console.error('Error creating transfer order:', error);
      return res.status(500).json({ error: 'Failed to create transfer order' });
    } finally {
      connection.release();
    }
  }

  async update(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const user_id = req.user?.user_id;
      const id = Number(req.params.id);
      if (!company_id || !user_id) return res.status(401).json({ error: 'Missing user context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      await connection.beginTransaction();

      // Handle status-specific inventory operations
      const newStatus = req.body?.status;

      if (newStatus === 'Picked') {
        // PICKED: Decrement inventory at source location
        // Validate that we have items to pick; fall back to ordered qty when no scanned qty exists
        const [items] = await connection.query(
          `SELECT transfer_order_item_id, picked_inventory_id, inventory_id, quantity, quantity_picked
           FROM transfer_order_items
           WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        const totalToPick = items.reduce((sum, item) => {
          const picked = Number(item.quantity_picked) || 0;
          const ordered = Number(item.quantity) || 0;
          return sum + (picked > 0 ? picked : ordered);
        }, 0);

        if (!totalToPick || totalToPick <= 0) {
          await connection.rollback();
          return res.status(400).json({
            error: 'Cannot mark as Picked: No quantities are assigned to pick for this order.'
          });
        }

        for (const item of items) {
          const sourceInventoryId = item.picked_inventory_id || item.inventory_id;
          if (!sourceInventoryId) continue;

          const remaining =
            (Number(item.quantity) || 0) - (Number(item.quantity_picked) || 0);
          if (remaining <= 0) continue;

          // Check available inventory before decrementing (prevent negative inventory)
          const [[inv]] = await connection.query(
            `SELECT quantity_on_hand, quantity_reserved
             FROM inventory
             WHERE inventory_id = ? AND company_id = ?`,
            [sourceInventoryId, company_id]
          );

          if (!inv) {
            throw new Error(`Inventory record not found for item ${item.transfer_order_item_id}`);
          }

          if (inv.quantity_on_hand < remaining) {
            throw new Error(
              `Insufficient inventory: Item ${item.transfer_order_item_id} requires ${remaining} but only ${inv.quantity_on_hand} available on hand`
            );
          }

          if (inv.quantity_reserved < remaining) {
            throw new Error(
              `Insufficient reserved inventory: Item ${item.transfer_order_item_id} requires ${remaining} but only ${inv.quantity_reserved} reserved`
            );
          }

          // Decrement source inventory (both on_hand and reserved)
          await connection.query(
            `UPDATE inventory
             SET quantity_on_hand  = quantity_on_hand  - ?,
                 quantity_reserved = quantity_reserved - ?
             WHERE inventory_id = ? AND company_id = ?`,
            [remaining, remaining, sourceInventoryId, company_id]
          );

          // Update item picked fields
          await connection.query(
            `UPDATE transfer_order_items
             SET quantity_picked = quantity_picked + ?,
                 picked_by       = ?,
                 picked_at       = NOW()
             WHERE transfer_order_item_id = ? AND company_id = ?`,
            [remaining, user_id, item.transfer_order_item_id, company_id]
          );

          // Record PICK movement
          await recordPickMovement({
            connection: connection,
            companyId: company_id,
            transferOrderId: id,
            transferOrderItemId: item.transfer_order_item_id,
            sourceInventoryId,
            quantity: remaining,
            userId: user_id
          });
        }

        // Update order status
        await connection.query(
          `UPDATE transfer_orders
           SET status = 'Picked',
               picked_date = NOW(),
               picked_by   = ?
           WHERE transfer_order_id = ? AND company_id = ?`,
          [user_id, id, company_id]
        );

      } else if (newStatus === 'Shipped') {
        // SHIPPED: Log in-transit movements (no inventory changes)
        // Validate that items were picked before shipping
        const [[pickedCheck]] = await connection.query(
          `SELECT SUM(quantity_picked) as total_picked
           FROM transfer_order_items
           WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        if (!pickedCheck || !pickedCheck.total_picked || pickedCheck.total_picked === 0) {
          await connection.rollback();
          return res.status(400).json({
            error: 'Cannot ship order with no picked items. Please pick items first.'
          });
        }

        // Release any unpicked reserved quantities so they do not remain locked indefinitely.
        await releaseUnpickedReservationsForOrder({
          connection,
          company_id,
          transfer_order_id: id
        });

        await recordShipMovementsForOrder({
          connection: connection,
          transferOrderId: id,
          userId: user_id
        });

        await connection.query(
          `UPDATE transfer_orders
           SET status = 'Shipped',
               ship_date = CURDATE(),
               shipped_by = ?
           WHERE transfer_order_id = ? AND company_id = ?`,
          [user_id, id, company_id]
        );

      } else if (newStatus === 'Received') {
        // RECEIVED: Create/increment inventory at destination location
        // Validate that order was shipped before receiving
        const [[currentOrder]] = await connection.query(
          `SELECT status FROM transfer_orders WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        if (currentOrder.status !== 'Shipped') {
          await connection.rollback();
          return res.status(400).json({
            error: `Order must be shipped before it can be received. Current status: ${currentOrder.status}`
          });
        }

        // Validate that items were actually picked
        const [[receiveCheck]] = await connection.query(
          `SELECT SUM(quantity_picked) as total_picked
           FROM transfer_order_items
           WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        if (!receiveCheck || !receiveCheck.total_picked || receiveCheck.total_picked === 0) {
          await connection.rollback();
          return res.status(400).json({
            error: 'Cannot receive order: No items were picked. Nothing to receive.'
          });
        }
        const [items] = await connection.query(
          `SELECT transfer_order_item_id, part_id, lot_id, quantity_picked, picked_inventory_id
           FROM transfer_order_items
           WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        const [[order]] = await connection.query(
          `SELECT company_id, to_location_id, destination_type, destination_loadout_id, transfer_order_number, loadout_id
           FROM transfer_orders
           WHERE transfer_order_id = ? AND company_id = ?`,
          [id, company_id]
        );

        for (const item of items) {
          if (item.quantity_picked <= 0) continue;

          // Get supplier_id from source inventory (to preserve supplier tracking)
          let sourceSupplier = null;
          if (item.picked_inventory_id) {
            const [[sourceInv]] = await connection.query(
              `SELECT supplier_id FROM inventory WHERE inventory_id = ? AND company_id = ?`,
              [item.picked_inventory_id, company_id]
            );
            sourceSupplier = sourceInv?.supplier_id || null;
          }

          // Find existing destination inventory (match any bin at location)
          const [rows] = await connection.query(
            `SELECT inventory_id
             FROM inventory
             WHERE company_id  = ?
               AND part_id     = ?
               AND (lot_id     <=> ?)
               AND location_id = ?
             LIMIT 1`,
            [
              order.company_id,
              item.part_id,
              item.lot_id,
              order.to_location_id
            ]
          );

          let destInventoryId;

          if (rows.length === 0) {
            // Create new destination inventory with supplier_id from source
            const [result] = await connection.query(
              `INSERT INTO inventory (
                 company_id,
                 part_id,
                 lot_id,
                 supplier_id,
                 location_id,
                 bin_id,
                 quantity_on_hand,
                 quantity_available,
                 quantity_reserved,
                 quantity_on_order,
                 received_date,
                 is_active
               ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, CURDATE(), 1)`,
              [
                order.company_id,
                item.part_id,
                item.lot_id,
                sourceSupplier,
                order.to_location_id,
                item.quantity_picked,
                item.quantity_picked
              ]
            );
            destInventoryId = result.insertId;
          } else {
            // Increment existing destination inventory
            destInventoryId = rows[0].inventory_id;

            await connection.query(
              `UPDATE inventory
               SET quantity_on_hand   = quantity_on_hand   + ?,
                   quantity_available = quantity_available + ?
               WHERE inventory_id = ? AND company_id = ?`,
              [item.quantity_picked, item.quantity_picked, destInventoryId, order.company_id]
            );
          }

          // If destination is loadout restock, add inventory to destination loadout
          if (order.destination_type === 'loadout_restock' && order.destination_loadout_id) {
            // Get product_id for the part
            const [[partInfo]] = await connection.query(
              `SELECT product_id FROM products WHERE part_id = ? AND company_id = ? LIMIT 1`,
              [item.part_id, order.company_id]
            );

            if (partInfo) {
              // Upsert into container_loadout_lots using app-level logic
              // (ON DUPLICATE KEY UPDATE does not work reliably when lot_id is NULL)
              const [existingLots] = await connection.query(
                `SELECT loadout_lot_id, quantity_used
                 FROM container_loadout_lots
                 WHERE loadout_id = ? AND product_id = ? AND (lot_id <=> ?)`,
                [order.destination_loadout_id, partInfo.product_id, item.lot_id]
              );

              if (existingLots.length > 0) {
                await connection.query(
                  `UPDATE container_loadout_lots
                   SET quantity_used = quantity_used + ?
                   WHERE loadout_lot_id = ?`,
                  [item.quantity_picked, existingLots[0].loadout_lot_id]
                );
              } else {
                await connection.query(
                  `INSERT INTO container_loadout_lots
                    (loadout_id, product_id, lot_id, quantity_used, notes)
                   VALUES (?, ?, ?, ?, ?)`,
                  [
                    order.destination_loadout_id,
                    partInfo.product_id,
                    item.lot_id,
                    item.quantity_picked,
                    `Received from transfer order ${order.transfer_order_number}`
                  ]
                );
              }

              // Update destination inventory to reference the loadout
              await connection.query(
                `UPDATE inventory
                 SET loadout_id = ?
                 WHERE inventory_id = ? AND company_id = ?`,
                [order.destination_loadout_id, destInventoryId, order.company_id]
              );
            }
          }

          // Record RECEIVE movement
          await recordReceiveMovement({
            connection: connection,
            transferOrderItemId: item.transfer_order_item_id,
            destinationInventoryId: destInventoryId,
            toBinId: null,
            userId: user_id
          });
        }

        // Move source loadout to destination location after receipt.
        if (order.loadout_id && order.to_location_id) {
          await connection.query(
            `UPDATE container_loadouts
             SET location_id = ?
             WHERE loadout_id = ? AND company_id = ?`,
            [order.to_location_id, order.loadout_id, company_id]
          );
        }

        await connection.query(
          `UPDATE transfer_orders
           SET status        = 'Received',
               received_date = CURDATE(),
               received_by   = ?
           WHERE transfer_order_id = ? AND company_id = ?`,
          [user_id, id, company_id]
        );

      } else {
        // For other status changes or non-status updates, use the old logic
        const allowedFields = [
          'status',
          'priority',
          'transfer_reason',
          'notes',
          'requested_date',
          'approved_date',
          'picked_date',
          'packed_date',
          'ship_date',
          'expected_arrival_date',
          'received_date',
          'completed_date',
          'carrier',
          'tracking_number',
          'freight_cost',
          'temperature_control_required'
        ];

        const patch = pick(req.body || {}, allowedFields);

        if (patch.requested_date) patch.requested_date = parseDateOrNull(patch.requested_date);
        if (patch.ship_date) patch.ship_date = parseDateOrNull(patch.ship_date);
        if (patch.expected_arrival_date) patch.expected_arrival_date = parseDateOrNull(patch.expected_arrival_date);
        if (patch.received_date) patch.received_date = parseDateOrNull(patch.received_date);
        if (patch.completed_date) patch.completed_date = parseDateOrNull(patch.completed_date);
        if (patch.approved_date) patch.approved_date = parseDateOrNull(patch.approved_date);
        if (patch.picked_date) patch.picked_date = parseDateOrNull(patch.picked_date);
        if (patch.packed_date) patch.packed_date = parseDateOrNull(patch.packed_date);

        if (req.body?.status) {
          // Block critical workflow statuses from being set via this path
          const workflowStatuses = ['Picked', 'Shipped', 'Received'];
          if (workflowStatuses.includes(req.body.status)) {
            await connection.rollback();
            return res.status(400).json({
              error: `Status "${req.body.status}" must be set through the proper workflow with inventory movement tracking.`
            });
          }

          const [[currentOrder]] = await connection.query(
            `SELECT status FROM transfer_orders WHERE transfer_order_id = ? AND company_id = ?`,
            [id, company_id]
          );

          if (!currentOrder) {
            await connection.rollback();
            return res.status(404).json({ error: 'Transfer order not found' });
          }

          // Block "Completed" unless order was received
          if (req.body.status === 'Completed') {
            if (currentOrder.status !== 'Received') {
              await connection.rollback();
              return res.status(400).json({
                error: `Cannot mark as Completed: Order must be Received first. Current status: ${currentOrder.status}`
              });
            }
          }

          patch.status = req.body.status;
          const now = new Date();
          switch (req.body.status) {
            case 'Approved':
              patch.approved_date = now;
              patch.approved_by = user_id;
              break;
            case 'Packed':
              patch.packed_date = now;
              patch.packed_by = user_id;
              break;
            case 'Completed':
              patch.completed_date = now;
              break;
            case 'Cancelled':
              if (!EDITABLE_ORDER_STATUSES.has(currentOrder.status)) {
                await connection.rollback();
                return res.status(400).json({
                  error: `Cannot cancel order in ${currentOrder.status} status.`
                });
              }

              await releaseUnpickedReservationsForOrder({
                connection,
                company_id,
                transfer_order_id: id
              });
              break;
            default:
              break;
          }
        }

        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        const setClauses = Object.keys(patch).map((field) => `${field} = ?`);
        const values = [...Object.values(patch), id, company_id];

        const [result] = await connection.query(
          `UPDATE transfer_orders
           SET ${setClauses.join(', ')}, updated_at = NOW()
           WHERE transfer_order_id = ? AND company_id = ?`,
          values
        );

        if (!result.affectedRows) {
          await connection.rollback();
          return res.status(404).json({ error: 'Transfer order not found' });
        }
      }

      await connection.commit();

      const updated = await getOrderWithItems(company_id, id);
      return res.json(updated);
    } catch (error) {
      await connection.rollback();
      console.error('Error updating transfer order:', error);
      return res.status(500).json({ error: 'Failed to update transfer order' });
    } finally {
      connection.release();
    }
  }

  async addItem(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      const order = await fetchOrder(company_id, id);
      if (!order) return res.status(404).json({ error: 'Transfer order not found' });
      if (!EDITABLE_ORDER_STATUSES.has(order.status)) {
        return res.status(400).json({
          error: `Items can only be added when order status is Pending or Approved. Current status: ${order.status}`
        });
      }

      const {
        inventory_id,
        part_id,
        lot_id,
        quantity,
        unit_of_measure,
        serial_number,
        expiration_date,
        notes
      } = req.body || {};

      const qty = Number(quantity) || 0;
      if (!qty || qty <= 0) {
        return res.status(400).json({ error: 'Quantity is required' });
      }

      await connection.beginTransaction();
      let insertedItemId = null;

      if (inventory_id) {
        const [[inventoryRow]] = await connection.query(
          `SELECT * FROM inventory WHERE inventory_id = ? AND company_id = ?`,
          [inventory_id, company_id]
        );

        if (!inventoryRow) {
          await connection.rollback();
          return res.status(404).json({ error: 'Inventory record not found' });
        }

        if (
          order.from_location_id &&
          inventoryRow.location_id &&
          Number(inventoryRow.location_id) !== Number(order.from_location_id)
        ) {
          await connection.rollback();
          return res.status(400).json({
            error: 'Inventory must be pulled from the transfer origin location.'
          });
        }

        const assignment = await assignInventoryToOrder({
          connection,
          company_id,
          order,
          blueprintItem: null,
          inventoryRow,
          quantity: qty,
          note: notes || 'Manually added from transfer order'
        });
        insertedItemId = assignment?.transfer_order_item_id || null;
      } else {
        const [result] = await connection.query(
          `INSERT INTO transfer_order_items (
            transfer_order_id,
            loadout_id,
            inventory_id,
            picked_inventory_id,
            part_id,
            lot_id,
            quantity,
            unit_of_measure,
            serial_number,
            expiration_date,
            notes,
            company_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            order.loadout_id || null,
            null,
            null,
            part_id || null,
            lot_id || null,
            qty,
            unit_of_measure || 'EA',
            serial_number || null,
            parseDateOrNull(expiration_date),
            notes || null,
            company_id
          ]
        );

        insertedItemId = result.insertId;
      }

      await connection.commit();

      const items = await fetchOrderItems(company_id, id);
      let newItem = items.find((itm) => itm.transfer_order_item_id === insertedItemId);
      if (!newItem && items.length) {
        newItem = items[items.length - 1];
      }

      return res.status(201).json(newItem || null);
    } catch (error) {
      await connection.rollback();
      console.error('Error adding transfer order item:', error);
      return res.status(500).json({ error: 'Failed to add item' });
    } finally {
      connection.release();
    }
  }

  async autoAssignBlueprintItem(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const orderId = Number(req.params.id);
      const blueprintItemId = Number(req.params.blueprintItemId);

      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(orderId) || !Number.isInteger(blueprintItemId)) {
        return res.status(400).json({ error: 'Invalid identifiers' });
      }

      const order = await fetchOrder(company_id, orderId);
      if (!order) return res.status(404).json({ error: 'Transfer order not found' });
      if (!order.loadout_id || !order.blueprint_id) {
        return res.status(400).json({ error: 'Auto-assignment requires a blueprint-linked loadout' });
      }

      const blueprintItem = await fetchBlueprintItemById(
        connection,
        blueprintItemId,
        company_id,
        order.blueprint_id
      );

      if (!blueprintItem) {
        return res.status(404).json({ error: 'Blueprint item not found' });
      }

      const assignedQty = await getAssignedQuantity(
        connection,
        orderId,
        blueprintItem.part_id
      );
      const requiredQty = Number(blueprintItem.required_quantity) || 0;
      const remainingNeeded = Math.max(requiredQty - assignedQty, 0);

      if (remainingNeeded <= 0) {
        return res.status(200).json({ success: true, message: 'Requirement already satisfied.' });
      }

      await connection.beginTransaction();

      await autoAssignBlueprintInventory({
        connection,
        company_id,
        blueprint_id: order.blueprint_id,
        loadout_id: order.loadout_id,
        transfer_order_id: orderId,
        from_location_id: order.from_location_id,
        transfer_order_number: order.transfer_order_number,
        targetBlueprintItemId: blueprintItemId,
        assignedQuantities: { [blueprintItem.part_id]: assignedQty }
      });

      await connection.commit();

      const updated = await getOrderWithItems(company_id, orderId);
      return res.json({ success: true, order: updated });
    } catch (error) {
      await connection.rollback();
      console.error('Error auto assigning blueprint inventory:', error);
      return res.status(500).json({ error: error.message || 'Failed to auto assign inventory' });
    } finally {
      connection.release();
    }
  }

  async manualAssignInventory(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const orderId = Number(req.params.id);
      const { blueprint_item_id, inventory_id, quantity } = req.body || {};

      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid transfer order id' });

      if (!Number.isInteger(Number(blueprint_item_id)) || !Number.isInteger(Number(inventory_id))) {
        return res.status(400).json({ error: 'Blueprint item and inventory identifiers are required.' });
      }

      const requestedQty = Number(quantity) || 0;
      if (requestedQty <= 0) {
        return res.status(400).json({ error: 'Quantity must be greater than zero.' });
      }

      const order = await fetchOrder(company_id, orderId);
      if (!order) return res.status(404).json({ error: 'Transfer order not found' });

      const blueprintItem = await fetchBlueprintItemById(
        connection,
        Number(blueprint_item_id),
        company_id,
        order.blueprint_id
      );

      if (!blueprintItem) {
        return res.status(404).json({ error: 'Blueprint item not found' });
      }

      const assignedQty = await getAssignedQuantity(
        connection,
        orderId,
        blueprintItem.part_id
      );
      const requiredQty = Number(blueprintItem.required_quantity) || 0;
      const remainingNeeded = Math.max(requiredQty - assignedQty, 0);

      if (remainingNeeded <= 0) {
        return res.status(400).json({ error: 'This requirement is already satisfied.' });
      }

      const [[inventoryRow]] = await exec(
        connection,
        `SELECT
          inv.*,
          l.expiration_date,
          b.aisle,
          b.rack,
          b.shelf,
          b.bin,
          b.zone
         FROM inventory inv
         LEFT JOIN lots l ON inv.lot_id = l.lot_id
         LEFT JOIN bins b ON inv.bin_id = b.bin_id AND b.company_id = inv.company_id
         WHERE inv.inventory_id = ? AND inv.company_id = ?`,
        [Number(inventory_id), company_id]
      );

      if (!inventoryRow) {
        return res.status(404).json({ error: 'Inventory record not found' });
      }

      const availableQty = Number(inventoryRow.quantity_available) || 0;
      if (availableQty <= 0) {
        return res.status(400).json({ error: 'Selected inventory has no available quantity.' });
      }

      const qtyToApply = Math.min(requestedQty, remainingNeeded, availableQty);
      if (qtyToApply <= 0) {
        return res.status(400).json({ error: 'Quantity exceeds remaining requirement or availability.' });
      }

      await connection.beginTransaction();

      await assignInventoryToOrder({
        connection,
        company_id,
        order,
        blueprintItem,
        inventoryRow,
        quantity: qtyToApply,
        note: 'Manually assigned from transfer order details'
      });

      await connection.commit();

      const updated = await getOrderWithItems(company_id, orderId);
      return res.json({ success: true, order: updated });
    } catch (error) {
      await connection.rollback();
      console.error('Error manually assigning inventory:', error);
      return res.status(500).json({ error: error.message || 'Failed to assign inventory' });
    } finally {
      connection.release();
    }
  }

  async assignLoadout(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const orderId = Number(req.params.id);
      const loadoutId = Number(req.body?.loadout_id);

      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'Invalid transfer order id' });
      if (!Number.isInteger(loadoutId)) return res.status(400).json({ error: 'loadout_id is required' });

      const order = await fetchOrder(company_id, orderId);
      if (!order) {
        return res.status(404).json({ error: 'Transfer order not found' });
      }

      const loadout = await ContainerLoadoutsModel.getById(loadoutId, company_id);
      if (!loadout) {
        return res.status(404).json({ error: 'Loadout not found or access denied' });
      }

      if (
        order.blueprint_id &&
        loadout.blueprint_id &&
        Number(order.blueprint_id) !== Number(loadout.blueprint_id)
      ) {
        return res.status(400).json({
          error: 'Selected loadout does not match the transfer order blueprint.'
        });
      }

      // Verify loadout is at the source location
      if (Number(loadout.location_id) !== Number(order.from_location_id)) {
        return res.status(400).json({
          error: 'Selected loadout must be at the transfer origin location'
        });
      }

      await connection.beginTransaction();

      // Update transfer order with loadout and blueprint
      await connection.query(
        `UPDATE transfer_orders
         SET loadout_id = ?, blueprint_id = COALESCE(blueprint_id, ?), updated_at = NOW()
         WHERE transfer_order_id = ? AND company_id = ?`,
        [loadoutId, loadout.blueprint_id || null, orderId, company_id]
      );

      // If loadout has a blueprint, auto-assign inventory from the blueprint
      if (loadout.blueprint_id) {
        // Get current assigned quantities
        const [existingItems] = await connection.query(
          `SELECT part_id, SUM(quantity) as total
           FROM transfer_order_items
           WHERE transfer_order_id = ? AND company_id = ?
           GROUP BY part_id`,
          [orderId, company_id]
        );

        const assignedQuantities = {};
        existingItems.forEach(item => {
          if (item.part_id) {
            assignedQuantities[item.part_id] = Number(item.total) || 0;
          }
        });

        // Auto-assign blueprint inventory
        await autoAssignBlueprintInventory({
          connection,
          company_id,
          blueprint_id: loadout.blueprint_id,
          loadout_id: loadoutId,
          transfer_order_id: orderId,
          from_location_id: order.from_location_id,
          transfer_order_number: order.transfer_order_number,
          targetBlueprintItemId: null, // Assign all blueprint items
          assignedQuantities
        });
      }

      await connection.commit();

      const updated = await getOrderWithItems(company_id, orderId);
      return res.json({ success: true, order: updated });
    } catch (error) {
      await connection.rollback();
      console.error('Error assigning loadout to transfer order:', error);
      return res.status(500).json({ error: error.message || 'Failed to assign loadout' });
    } finally {
      connection.release();
    }
  }

  async deleteItem(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id) || !Number.isInteger(itemId)) {
        return res.status(400).json({ error: 'Invalid identifiers' });
      }

      await connection.beginTransaction();

      const [[order]] = await connection.query(
        `SELECT status FROM transfer_orders
         WHERE transfer_order_id = ? AND company_id = ?`,
        [id, company_id]
      );

      if (!order) {
        await connection.rollback();
        return res.status(404).json({ error: 'Transfer order not found' });
      }

      if (TERMINAL_OR_IN_PROGRESS_STATUSES.has(order.status)) {
        await connection.rollback();
        return res.status(400).json({
          error: `Cannot delete items when order status is ${order.status}.`
        });
      }

      const [[item]] = await connection.query(
        `SELECT transfer_order_item_id, inventory_id, picked_inventory_id, quantity, quantity_picked
         FROM transfer_order_items
         WHERE transfer_order_item_id = ? AND transfer_order_id = ? AND company_id = ?`,
        [itemId, id, company_id]
      );

      if (!item) {
        await connection.rollback();
        return res.status(404).json({ error: 'Item not found' });
      }

      const sourceInventoryId = item.picked_inventory_id || item.inventory_id;
      const unpickedQty = Math.max((Number(item.quantity) || 0) - (Number(item.quantity_picked) || 0), 0);
      if (sourceInventoryId && unpickedQty > 0) {
        await releaseReservation({
          connection,
          company_id,
          inventory_id: sourceInventoryId,
          quantity: unpickedQty
        });
      }

      await connection.query(
        `DELETE FROM transfer_order_items
         WHERE transfer_order_item_id = ? AND transfer_order_id = ? AND company_id = ?`,
        [itemId, id, company_id]
      );

      await connection.commit();

      return res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      console.error('Error deleting transfer order item:', error);
      return res.status(500).json({ error: 'Failed to delete item' });
    } finally {
      connection.release();
    }
  }

  async delete(req, res) {
    const connection = await pool.getConnection();
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      await connection.beginTransaction();

      const [[order]] = await connection.query(
        `SELECT status FROM transfer_orders
         WHERE transfer_order_id = ? AND company_id = ?`,
        [id, company_id]
      );

      if (!order) {
        await connection.rollback();
        return res.status(404).json({ error: 'Transfer order not found' });
      }

      if (TERMINAL_OR_IN_PROGRESS_STATUSES.has(order.status)) {
        await connection.rollback();
        return res.status(400).json({
          error: `Cannot delete order in ${order.status} status.`
        });
      }

      await releaseUnpickedReservationsForOrder({
        connection,
        company_id,
        transfer_order_id: id
      });

      await connection.query(
        `DELETE FROM transfer_order_items WHERE transfer_order_id = ? AND company_id = ?`,
        [id, company_id]
      );

      const [result] = await connection.query(
        `DELETE FROM transfer_orders WHERE transfer_order_id = ? AND company_id = ?`,
        [id, company_id]
      );

      if (!result.affectedRows) {
        await connection.rollback();
        return res.status(404).json({ error: 'Transfer order not found' });
      }

      await connection.commit();
      return res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      console.error('Error deleting transfer order:', error);
      return res.status(500).json({ error: 'Failed to delete transfer order' });
    } finally {
      connection.release();
    }
  }
}

export default new TransferOrdersController();
