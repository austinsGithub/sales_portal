// backend/controllers/procurement/receivingController.mjs
// Pure ESM, no validators, clean error surfacing, all handlers defined.

import * as ReceivingModelNS from '../../models/procurement/ReceivingModel.mjs';
const ReceivingModel =
  ReceivingModelNS.ReceivingModel || ReceivingModelNS.default || ReceivingModelNS;

import * as PurchaseOrdersNS from '../../models/procurement/PurchaseOrders.mjs';
const { recomputeLineReceipts, recomputePOStatus } = PurchaseOrdersNS;

// ---- helpers ----
const mapSqlError = (err) => {
  const code = err?.code || err?.errno || err?.sqlState || 'E_UNKNOWN';
  const msg  = err?.sqlMessage || err?.message || 'Unknown error';
  const friendly =
    code === 'ER_DUP_ENTRY'             ? `Duplicate: ${msg}` :
    code === 'ER_NO_REFERENCED_ROW_2'   ? 'Foreign key mismatch (purchase_order_id / po_line_id / part_id).' :
    code === 'ER_BAD_NULL_ERROR'        ? 'Missing required field.' :
    code === 'ER_TRUNCATED_WRONG_VALUE' ||
    code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'
                                         ? 'Bad type/format (quantity/date).' :
    msg;
  return { status: 400, message: friendly, debug: { code, msg } };
};
const toInt = (v) => (v === null || v === undefined || v === '' ? null : Number.parseInt(v, 10));
const toNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));


// ---- implemented handlers (core flow) ----
export const listItems = async (req, res) => {
  try {
    const receivingId = toInt(req.params.id);
    const company_id = req.user.company_id;
    const rows = await ReceivingModel.getItemsByReceivingId(receivingId, company_id);
    res.json(rows);
  } catch (err) {
    console.error('List receiving items failed:', err);
    const out = mapSqlError(err); 
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const addItem = async (req, res) => {
  try {
    const receivingId = toInt(req.params.id);
    const company_id = req.user.company_id;
    const body = { ...req.body };
    
    // Convert numeric fields
    body.part_id            = toInt(body.part_id);
    body.purchase_order_id  = toInt(body.purchase_order_id);
    body.po_line_id         = toInt(body.po_line_id);
    body.supplier_id        = toInt(body.supplier_id);
    body.location_id        = toInt(body.location_id);
    body.quantity_received  = toNum(body.quantity_received);

    // Call model with correct signature: addItem(receiving_id, company_id, itemData)
    const created = await ReceivingModel.addItem(receivingId, company_id, body);

    const poId = created?.purchase_order_id || body.purchase_order_id || null;
    if (poId) {
      await recomputeLineReceipts(poId);
      await recomputePOStatus(poId);
    }
    res.status(201).json(created);
  } catch (err) {
    console.error('Add receiving item failed:', err);
    const out = mapSqlError(err); 
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const updateItem = async (req, res) => {
  try {
    const receivingId = toInt(req.params.id);
    const itemId = toInt(req.params.item_id);
    const company_id = req.user.company_id;
    const body = { ...req.body };
    
    if ('quantity_received' in body) {
      body.quantity_received = toNum(body.quantity_received);
    }

    // Call model with correct signature: updateItem(receiving_id, item_id, patch, company_id)
    const updated = await ReceivingModel.updateItem(receivingId, itemId, body, company_id);

    const poId = updated?.purchase_order_id || body?.purchase_order_id || null;
    if (poId) {
      await recomputeLineReceipts(poId);
      await recomputePOStatus(poId);
    }
    res.json(updated);
  } catch (err) {
    console.error('Update receiving item failed:', err);
    const out = mapSqlError(err); 
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const removeItem = async (req, res) => {
  try {
    const receivingId = toInt(req.params.id);
    const itemId = toInt(req.params.item_id);
    const company_id = req.user.company_id;

    // First get the item to retrieve PO info before deletion
    const items = await ReceivingModel.getItemsByReceivingId(receivingId, company_id);
    const item = items.find(i => i.receiving_item_id === itemId);

    // Call model with correct signature: removeItem(receiving_id, item_id, company_id)
    await ReceivingModel.removeItem(receivingId, itemId, company_id);

    // Update PO status if item was linked to a PO
    const poId = item?.purchase_order_id || null;
    if (poId) {
      await recomputeLineReceipts(poId);
      await recomputePOStatus(poId);
    }
    
    res.json({ deleted: true, item_id: itemId });
  } catch (err) {
    console.error('Remove receiving item failed:', err);
    const out = mapSqlError(err); 
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const complete = async (req, res) => {
  try {
    const receivingId = toInt(req.params.id);
    const company_id = req.user.company_id;
    const result = await ReceivingModel.complete(receivingId, company_id);
    res.json(result);
  } catch (err) {
    console.error('Complete receiving failed:', err);
    const out = mapSqlError(err); 
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

// ---- additional handlers ----
export const list = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const limit = toInt(req.query.limit) || 50;
    const offset = toInt(req.query.offset) || 0;
    const q = req.query.q || '';
    const status = req.query.status || '';

    const [data, total] = await Promise.all([
      ReceivingModel.getAll({ company_id, limit, offset, q, status }),
      ReceivingModel.countAll(company_id, q, status)
    ]);

    res.json({ data, total });
  } catch (err) {
    console.error('List receiving failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const search = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const q = req.query.q || '';
    
    const data = await ReceivingModel.getAll({ 
      company_id, 
      limit: 20, 
      offset: 0, 
      q,
      status: '' 
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error('Search receiving failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const create = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const user_id = req.user.user_id;
    const body = { ...req.body };
    
    // Convert numeric fields
    body.purchase_order_id = toInt(body.purchase_order_id);
    body.supplier_id = toInt(body.supplier_id);
    body.received_by = user_id;
    body.company_id = company_id;

    const created = await ReceivingModel.create(body);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create receiving failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const getOne = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const company_id = req.user.company_id;
    
    const receiving = await ReceivingModel.getById(id, company_id);
    
    if (!receiving) {
      return res.status(404).json({ message: 'Receiving record not found' });
    }
    
    res.json(receiving);
  } catch (err) {
    console.error('Get receiving failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const patch = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const company_id = req.user.company_id;
    const body = { ...req.body };
    
    const updated = await ReceivingModel.update(id, body, company_id);
    res.json(updated);
  } catch (err) {
    console.error('Update receiving failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const parseScan = async (req, res) => {
  try {
    const { scannedData } = req.body;
    
    if (!scannedData) {
      return res.status(400).json({ message: 'No scan data provided' });
    }
    
    const parsed = ReceivingModel.parseScan(scannedData);
    res.json({ parsed });
  } catch (err) {
    console.error('Parse scan failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const matchScannedData = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { parsedData } = req.body;
    
    if (!parsedData) {
      return res.status(400).json({ message: 'No parsed data provided' });
    }
    
    const matches = await ReceivingModel.matchScannedData(company_id, parsedData);
    res.json(matches);
  } catch (err) {
    console.error('Match scanned data failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

export const getByPO = async (req, res) => {
  try {
    const poId = toInt(req.params.poId);
    const company_id = req.user.company_id;
    
    if (isNaN(poId)) {
      return res.status(400).json({ message: 'Valid PO ID is required' });
    }
    
    const receiving = await ReceivingModel.getByPurchaseOrderId(poId, company_id);
    if (!receiving) {
      return res.status(404).json({ message: 'No receiving record found for this purchase order' });
    }

    res.json(receiving);
  } catch (err) {
    console.error('Get receiving by PO failed:', err);
    const out = mapSqlError(err);
    res.status(out.status || 500).json({ 
      message: out.message || 'Failed to get receiving record', 
      debug: process.env.NODE_ENV === 'development' ? out.debug : undefined 
    });
  }
};

export const getPurchaseOrder = async (req, res) => {
  try {
    const poNumber = req.params.poNumber;
    const company_id = req.user.company_id;
    
    if (!poNumber) {
      return res.status(400).json({ message: 'PO number is required' });
    }
    
    // Use the model to get the PO with lines
    const po = await ReceivingModel.getPurchaseOrderWithLines(poNumber, company_id);
    
    if (!po) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    res.json(po);
  } catch (err) {
    console.error('Get PO failed:', err);
    const out = mapSqlError(err);
    res.status(out.status).json({ message: out.message, debug: out.debug });
  }
};

// ---- default export object (what routes use) ----
const ReceivingController = {
  // stubs first (your routes might register these early)
  list, search, parseScan, matchScannedData, getPurchaseOrder, getByPO,
  create, getOne, patch,
  // core implemented handlers
  listItems, addItem, updateItem, removeItem, complete
};
export default ReceivingController;
