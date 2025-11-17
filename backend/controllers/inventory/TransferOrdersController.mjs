import pool from '../../db/pool.mjs';
import { ContainerLoadoutsModel } from '../../models/inventory/ContainerLoadouts.mjs';

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

async function getOrCreateLoadout({ company_id, blueprint_id, location_id, created_by }) {
  if (!blueprint_id || !location_id) return null;

  const [existing] = await pool.query(
    `SELECT loadout_id
     FROM container_loadouts
     WHERE company_id = ? AND blueprint_id = ? AND location_id = ? AND is_active = 1
     ORDER BY loadout_id DESC
     LIMIT 1`,
    [company_id, blueprint_id, location_id]
  );

  if (existing.length) {
    return existing[0].loadout_id;
  }

  const [[lastSuffix]] = await pool.query(
    `SELECT serial_suffix
     FROM container_loadouts
     WHERE company_id = ?
     ORDER BY loadout_id DESC
     LIMIT 1`,
    [company_id]
  );

  let suffix = '001';
  const lastValue = lastSuffix?.serial_suffix;
  if (lastValue) {
    const numeric = parseInt(lastValue, 10);
    if (!Number.isNaN(numeric)) {
      suffix = String(numeric + 1).padStart(3, '0');
    }
  }

  const loadout = await ContainerLoadoutsModel.create({
    blueprint_id,
    company_id,
    location_id,
    serial_suffix: suffix,
    created_by,
    notes: 'Auto-created for transfer order'
  });

  return loadout?.loadout_id || null;
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
    await exec(
      connection,
      `INSERT INTO container_loadout_lots
        (loadout_id, product_id, lot_id, quantity_used, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        order.loadout_id,
        blueprintItem?.product_id || null,
        inventoryRow.lot_id || null,
        qty,
        note || `Manual assignment for transfer order ${order.transfer_order_number}`
      ]
    );
  }

  await exec(
    connection,
    `INSERT INTO transfer_order_items (
      transfer_order_id,
      loadout_id,
      inventory_id,
      part_id,
      lot_id,
      quantity,
      unit_of_measure,
      serial_number,
      expiration_date,
      notes,
      company_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.transfer_order_id,
      order.loadout_id || null,
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

  return qty;
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
        l.expiration_date
       FROM inventory inv
       LEFT JOIN lots l ON inv.lot_id = l.lot_id
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
      tl.location_name AS to_location_name,
      tl.location_type AS to_location_type,
      cl.loadout_id,
      cl.blueprint_id,
      cl.serial_suffix AS loadout_serial_suffix,
      cb.blueprint_name,
      creator.first_name AS created_by_first_name,
      creator.last_name AS created_by_last_name,
      approver.first_name AS approved_by_first_name,
      approver.last_name AS approved_by_last_name,
      shipper.first_name AS shipped_by_first_name,
      shipper.last_name AS shipped_by_last_name,
      receiver.first_name AS received_by_first_name,
      receiver.last_name AS received_by_last_name,
      COUNT(items.transfer_order_item_id) AS item_count
    FROM transfer_orders o
    LEFT JOIN locations fl ON o.from_location_id = fl.location_id
    LEFT JOIN locations tl ON o.to_location_id = tl.location_id
    LEFT JOIN container_loadouts cl ON o.loadout_id = cl.loadout_id
    LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
    LEFT JOIN users creator ON o.created_by = creator.user_id
    LEFT JOIN users approver ON o.approved_by = approver.user_id
    LEFT JOIN users shipper ON o.shipped_by = shipper.user_id
    LEFT JOIN users receiver ON o.received_by = receiver.user_id
    LEFT JOIN transfer_order_items items ON o.transfer_order_id = items.transfer_order_id
    WHERE o.company_id = ? AND o.transfer_order_id = ?
    GROUP BY o.transfer_order_id`,
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
      loc.location_name AS inventory_location
    FROM transfer_order_items toi
    LEFT JOIN inventory inv ON toi.inventory_id = inv.inventory_id
    LEFT JOIN parts p ON p.part_id = COALESCE(toi.part_id, inv.part_id)
    LEFT JOIN lots l ON l.lot_id = COALESCE(toi.lot_id, inv.lot_id)
    LEFT JOIN locations loc ON inv.location_id = loc.location_id
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

      params.push(safeLimit, safeOffset);

      const [rows] = await pool.query(
        `SELECT 
          o.*,
          fl.location_name AS from_location_name,
          tl.location_name AS to_location_name,
          cl.serial_suffix AS loadout_serial_suffix,
          cb.blueprint_name,
          creator.first_name AS created_by_first_name,
          creator.last_name AS created_by_last_name,
          COUNT(items.transfer_order_item_id) AS item_count
        FROM transfer_orders o
        LEFT JOIN locations fl ON o.from_location_id = fl.location_id
        LEFT JOIN locations tl ON o.to_location_id = tl.location_id
        LEFT JOIN container_loadouts cl ON o.loadout_id = cl.loadout_id
        LEFT JOIN container_blueprints cb ON cl.blueprint_id = cb.blueprint_id
        LEFT JOIN users creator ON o.created_by = creator.user_id
        LEFT JOIN transfer_order_items items ON o.transfer_order_id = items.transfer_order_id
        ${where}
        GROUP BY o.transfer_order_id
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`,
        params
      );

      return res.json(rows);
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

      await connection.beginTransaction();

      const transfer_order_number = await generateTransferOrderNumber(company_id);

      const [result] = await connection.query(
        `INSERT INTO transfer_orders (
          transfer_order_number,
          from_location_id,
          to_location_id,
          transfer_reason,
          status,
          priority,
          requested_date,
          notes,
          created_by,
          company_id
        ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?)`,
        [
          transfer_order_number,
          Number(from_location_id),
          Number(to_location_id),
          transfer_reason || null,
          priority,
          parseDateOrNull(requested_date),
          notes || null,
          user_id,
          company_id
        ]
      );

      const transfer_order_id = result.insertId;

      let loadoutId = null;
      if (blueprint_id) {
        loadoutId = await getOrCreateLoadout({
          company_id,
          blueprint_id: Number(blueprint_id),
          location_id: Number(from_location_id),
          created_by: user_id
        });

        if (loadoutId) {
          await connection.query(
            `UPDATE transfer_orders SET loadout_id = ? WHERE transfer_order_id = ?`,
            [loadoutId, transfer_order_id]
          );

          await autoAssignBlueprintInventory({
            connection,
            company_id,
            blueprint_id: Number(blueprint_id),
            loadout_id: loadoutId,
            transfer_order_id,
            from_location_id: Number(from_location_id),
            transfer_order_number
          });
        }
      }

      if (Array.isArray(items) && items.length > 0) {
        const insertValues = items.map((item) => [
          transfer_order_id,
          null,
          item.inventory_id || null,
          item.part_id || null,
          item.lot_id || null,
          Number(item.quantity) || 0,
          item.unit_of_measure || item.part?.unit_of_measure || 'EA',
          item.serial_number || null,
          parseDateOrNull(item.expiration_date),
          item.notes || null,
          company_id
        ]);

        await connection.query(
          `INSERT INTO transfer_order_items (
            transfer_order_id,
            loadout_id,
            inventory_id,
            part_id,
            lot_id,
            quantity,
            unit_of_measure,
            serial_number,
            expiration_date,
            notes,
            company_id
          ) VALUES ?`,
          [insertValues]
        );
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
    try {
      const company_id = req.user?.company_id;
      const user_id = req.user?.user_id;
      const id = Number(req.params.id);
      if (!company_id || !user_id) return res.status(401).json({ error: 'Missing user context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      const allowedFields = [
        'status',
        'priority',
        'transfer_reason',
        'notes',
        'requested_date',
        'approved_date',
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

      if (req.body?.status) {
        patch.status = req.body.status;
        const now = new Date();
        switch (req.body.status) {
          case 'Approved':
            patch.approved_date = now;
            patch.approved_by = user_id;
            break;
          case 'Shipped':
            patch.ship_date = now;
            patch.shipped_by = user_id;
            break;
          case 'Received':
            patch.received_date = now;
            patch.received_by = user_id;
            break;
          case 'Completed':
            patch.completed_date = now;
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

      const [result] = await pool.query(
        `UPDATE transfer_orders
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE transfer_order_id = ? AND company_id = ?`,
        values
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: 'Transfer order not found' });
      }

      const updated = await getOrderWithItems(company_id, id);
      return res.json(updated);
    } catch (error) {
      console.error('Error updating transfer order:', error);
      return res.status(500).json({ error: 'Failed to update transfer order' });
    }
  }

  async addItem(req, res) {
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid transfer order id' });

      const order = await fetchOrder(company_id, id);
      if (!order) return res.status(404).json({ error: 'Transfer order not found' });

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

      if (!quantity) {
        return res.status(400).json({ error: 'Quantity is required' });
      }

      const [result] = await pool.query(
        `INSERT INTO transfer_order_items (
          transfer_order_id,
          loadout_id,
          inventory_id,
          part_id,
          lot_id,
          quantity,
          unit_of_measure,
          serial_number,
          expiration_date,
          notes,
          company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          order.loadout_id || null,
          inventory_id || null,
          part_id || null,
          lot_id || null,
          Number(quantity) || 0,
          unit_of_measure || 'EA',
          serial_number || null,
          parseDateOrNull(expiration_date),
          notes || null,
          company_id
        ]
      );

      const items = await fetchOrderItems(company_id, id);
      const newItem = items.find((itm) => itm.transfer_order_item_id === result.insertId);
      return res.status(201).json(newItem || null);
    } catch (error) {
      console.error('Error adding transfer order item:', error);
      return res.status(500).json({ error: 'Failed to add item' });
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
          l.expiration_date
         FROM inventory inv
         LEFT JOIN lots l ON inv.lot_id = l.lot_id
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

      await pool.query(
        `UPDATE transfer_orders
         SET loadout_id = ?, blueprint_id = COALESCE(blueprint_id, ?), updated_at = NOW()
         WHERE transfer_order_id = ? AND company_id = ?`,
        [loadoutId, loadout.blueprint_id || null, orderId, company_id]
      );

      const updated = await getOrderWithItems(company_id, orderId);
      return res.json({ success: true, order: updated });
    } catch (error) {
      console.error('Error assigning loadout to transfer order:', error);
      return res.status(500).json({ error: 'Failed to assign loadout' });
    }
  }

  async deleteItem(req, res) {
    try {
      const company_id = req.user?.company_id;
      const id = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!company_id) return res.status(401).json({ error: 'Missing company context' });
      if (!Number.isInteger(id) || !Number.isInteger(itemId)) {
        return res.status(400).json({ error: 'Invalid identifiers' });
      }

      const [result] = await pool.query(
        `DELETE FROM transfer_order_items
         WHERE transfer_order_item_id = ? AND transfer_order_id = ? AND company_id = ?`,
        [itemId, id, company_id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ error: 'Item not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting transfer order item:', error);
      return res.status(500).json({ error: 'Failed to delete item' });
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
