// controllers/procurement/purchaseOrdersController.mjs
import * as PurchaseOrders from '../../models/procurement/PurchaseOrders.mjs';
import * as PurchaseOrderLines from '../../models/procurement/PurchaseOrderLines.mjs';
import { getLatestPartCostForSupplier } from '../../models/procurement/PartCosts.mjs';

/**
 * Convert JavaScript Date to MySQL DATETIME format
 * @param {Date} date - JavaScript Date object
 * @returns {string} MySQL DATETIME string (YYYY-MM-DD HH:mm:ss)
 */
function toMySQLDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseStatusFilter(rawStatus) {
  if (!rawStatus) return null;
  const raw = Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(',');
  const normalized = raw
    .map((value) => (typeof value === 'string' ? value.trim() : String(value).trim()))
    .filter((value) => value.length > 0 && value.toLowerCase() !== 'all');
  return normalized.length ? normalized : null;
}

/**
 * List all purchase orders (with optional filters)
 */
export async function list(req, res) {
  try {
    const { company_id } = req.user;
    const { q, status, supplier_id, limit, offset, includeInactive } = req.query;
    const statusFilter = parseStatusFilter(status);
    const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 250);
    const offsetNum = Math.max(Number(offset) || 0, 0);

    const rows = await PurchaseOrders.getPurchaseOrders({
      company_id,
      q,
      status: statusFilter,
      supplier_id,
      limit: limitNum,
      offset: offsetNum,
      includeInactive: includeInactive === 'true',
    });

    const total = await PurchaseOrders.countPurchaseOrders({
      company_id,
      q,
      status: statusFilter,
      supplier_id,
      includeInactive: includeInactive === 'true',
    });

    const hasMore = offsetNum + rows.length < total;

    res.json({
      data: rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore,
      },
    });
  } catch (err) {
    console.error('Error listing purchase orders:', err);
    res.status(500).json({ error: 'Failed to list purchase orders' });
  }
}

/**
 * Get a single purchase order (optionally with lines)
 */
export async function getOne(req, res) {
  try {
    const { company_id } = req.user;
    const { id } = req.params;

    const order = await PurchaseOrders.getPurchaseOrderById(company_id, id);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });

    const lines = await PurchaseOrderLines.getLinesByPurchaseOrderId(company_id, id);

    res.json({ order, lines });
  } catch (err) {
    console.error('Error fetching purchase order:', err);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
}

/**
 * Create a new purchase order
 */
export async function create(req, res) {
  try {
    const { company_id } = req.user;
    const data = req.body;

    const created = await PurchaseOrders.createPurchaseOrder(company_id, data);
    res.status(201).json({ message: 'Purchase order created', data: created });
  } catch (err) {
    console.error('Error creating purchase order:', err);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
}

/**
 * Update an existing purchase order
 */
export async function update(req, res) {
  try {
    const { company_id } = req.user;
    const { id } = req.params;
    const patch = req.body;

    const updated = await PurchaseOrders.updatePurchaseOrder(company_id, id, patch);
    res.json({ message: 'Purchase order updated', data: updated });
  } catch (err) {
    console.error('Error updating purchase order:', err);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
}

/**
 * Deactivate a purchase order (soft delete)
 */
export async function deactivate(req, res) {
  try {
    const { company_id } = req.user;
    const { id } = req.params;

    await PurchaseOrders.deactivatePurchaseOrder(company_id, id);
    res.json({ message: 'Purchase order deactivated' });
  } catch (err) {
    console.error('Error deactivating purchase order:', err);
    res.status(500).json({ error: 'Failed to deactivate purchase order' });
  }
}

/**
 * Permanently delete a purchase order
 */
export async function destroy(req, res) {
  try {
    const { company_id } = req.user;
    const { id } = req.params;

    await PurchaseOrders.deletePurchaseOrder(company_id, id);
    res.json({ message: 'Purchase order deleted' });
  } catch (err) {
    console.error('Error deleting purchase order:', err);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
}

/**
 * Approve a purchase order
 */
export async function approve(req, res) {
  try {
    const { company_id, user_id } = req.user;
    const { id } = req.params;

    // Get the PO first to check its current status
    const po = await PurchaseOrders.getPurchaseOrderById(company_id, id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Check if PO is in a state that can be approved
    if (po.status !== 'draft') {
      return res.status(400).json({ 
        error: `Cannot approve a purchase order with status: ${po.status}` 
      });
    }

    // Update the status to 'approved' with proper MySQL datetime format
    const updated = await PurchaseOrders.updatePurchaseOrder(company_id, id, {
      status: 'approved',
      approved_by: user_id,
      approved_at: toMySQLDateTime() // ✅ Proper MySQL DATETIME format
    });

    // Log to console for now (add audit logs later)
    console.log(`Purchase order ${id} approved by user ${user_id} at ${toMySQLDateTime()}`);

    res.json({ 
      message: 'Purchase order approved', 
      data: updated 
    });
  } catch (err) {
    console.error('Error approving purchase order:', err);
    res.status(500).json({ error: 'Failed to approve purchase order' });
  }
}

/**
 * Reject a purchase order
 */
export async function reject(req, res) {
  try {
    const { company_id, user_id } = req.user;
    const { id } = req.params;

    const po = await PurchaseOrders.getPurchaseOrderById(company_id, id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (po.status !== 'draft') {
      return res.status(400).json({
        error: `Cannot reject a purchase order with status: ${po.status}`
      });
    }

    await PurchaseOrders.ensureStatusOption('rejected');

    const updated = await PurchaseOrders.updatePurchaseOrder(company_id, id, {
      status: 'rejected'
    });

    console.log(`Purchase order ${id} rejected by user ${user_id} at ${toMySQLDateTime()}`);

    res.json({
      message: 'Purchase order rejected',
      data: updated
    });
  } catch (err) {
    console.error('Error rejecting purchase order:', err);
    res.status(500).json({ error: 'Failed to reject purchase order' });
  }
}

/**
 * Create a new line under an existing PO
 */
export async function addLine(req, res) {
  try {
    const { company_id } = req.user;
    const { id } = req.params; // purchase_order_id
    const data = { ...req.body, purchase_order_id: id };

    // Ensure the PO exists and grab the supplier for cost lookup
    const po = await PurchaseOrders.getPurchaseOrderById(company_id, id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Normalize core fields
    const part_id = data.part_id ? Number(data.part_id) : null;
    if (!part_id) {
      return res.status(400).json({ error: 'part_id is required' });
    }
    const quantity_ordered = Number(data.quantity_ordered) || 1;

    // Prefer incoming unit_cost/unit_price; otherwise fall back to supplier-part cost
    const incomingCost = data.unit_cost ?? data.unit_price;
    let unit_cost = Number.isFinite(Number(incomingCost)) ? Number(incomingCost) : null;

    if ((!unit_cost || unit_cost <= 0) && part_id && po.supplier_id) {
      const supplierCost = await getLatestPartCostForSupplier({
        company_id,
        part_id,
        supplier_id: po.supplier_id,
      });

      if (supplierCost?.unit_cost != null) {
        unit_cost = Number(supplierCost.unit_cost);
      }
    }

    if (!Number.isFinite(unit_cost)) {
      unit_cost = 0;
    }

    const newLineId = await PurchaseOrderLines.createPurchaseOrderLine(company_id, {
      ...data,
      part_id,
      quantity_ordered,
      unit_cost,
    });
    res.status(201).json({ message: 'Purchase order line added', po_line_id: newLineId });
  } catch (err) {
    console.error('Error adding purchase order line:', err);
    res.status(500).json({ error: 'Failed to add purchase order line' });
  }
}

/**
 * Update a line under an existing PO
 */
export async function updateLine(req, res) {
  try {
    const { company_id } = req.user;
    const { line_id } = req.params;
    const patch = req.body;

    await PurchaseOrderLines.updatePurchaseOrderLine(company_id, line_id, patch);
    res.json({ message: 'Purchase order line updated' });
  } catch (err) {
    console.error('Error updating purchase order line:', err);
    res.status(500).json({ error: 'Failed to update purchase order line' });
  }
}

/**
 * Delete a line under an existing PO
 */
export async function deleteLine(req, res) {
  try {
    const { company_id } = req.user;
    const { line_id } = req.params;

    await PurchaseOrderLines.deletePurchaseOrderLine(company_id, line_id);
    res.json({ message: 'Purchase order line deleted' });
  } catch (err) {
    console.error('Error deleting purchase order line:', err);
    res.status(500).json({ error: 'Failed to delete purchase order line' });
  }
}

/**
 * Send a purchase order to supplier
 * POST /api/purchase_orders/:id/send
 */
export async function sendToSupplier(req, res) {
  try {
    console.log('sendToSupplier - Request received', {
      params: req.params,
      user: req.user,
      headers: req.headers,
      body: req.body
    });

    const { company_id, user_id } = req.user || {};
    const { id: purchase_order_id } = req.params;

    console.log('Extracted values:', { company_id, user_id, purchase_order_id });

    if (!company_id) {
      console.error('Missing company_id in user object');
      return res.status(400).json({ 
        message: 'Company ID is required',
        details: 'User authentication is missing company information'
      });
    }

    if (!user_id) {
      console.error('Missing user_id in user object');
      return res.status(401).json({ 
        message: 'User authentication failed',
        details: 'User ID not found in authentication token'
      });
    }

    const result = await PurchaseOrders.sendPurchaseOrderToSupplier(
      company_id,
      purchase_order_id,
      user_id
    );

    // Log the status change
    await PurchaseOrders.logStatusChange({
      purchase_order_id,
      status: 'sent_to_supplier',
      changed_by: user_id,
      notes: 'Sent to supplier',
      changed_at: toMySQLDateTime(new Date())
    });

    return res.status(200).json({
      message: 'Purchase order marked as sent to supplier',
      data: result
    });
  } catch (err) {
    console.error('Error sending purchase order to supplier:', {
      error: err,
      message: err.message,
      stack: err.stack,
      params: req.params,
      user: req.user
    });
    
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      error: err.message || 'Failed to send purchase order to supplier',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
