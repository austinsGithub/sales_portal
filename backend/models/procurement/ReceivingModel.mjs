import pool from '../../db/pool.mjs';

const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const ReceivingModel = {
  /**
   * Retrieves a list of receiving records for a given company, with optional search and pagination.
   * @param {number} company_id - The ID of the company to filter by.
   * @param {object} options
   * @param {number} [options.limit] - The maximum number of results to return.
   * @param {number} [options.offset] - The number of results to skip.
   * @param {string} [options.q] - Search query.
   * @param {string} [options.status] - Filter by status (pending, completed).
   * @returns {Promise<Array<object>>} - The list of receiving records.
   */
  async getAll({ company_id, limit, offset, q, status }) {
    let sql = `
      SELECT 
        r.*,
        s.supplier_name,
        s.supplier_code,
        u.username as received_by_name,
        po.purchase_order_id,
        (SELECT COUNT(*) FROM receiving_items WHERE receiving_id = r.receiving_id) as item_count,
        (SELECT SUM(quantity_received) FROM receiving_items WHERE receiving_id = r.receiving_id) as total_quantity
      FROM receiving r
      LEFT JOIN suppliers s ON r.supplier_id = s.supplier_id
      LEFT JOIN users u ON r.received_by = u.user_id
      LEFT JOIN purchase_orders po 
        ON po.company_id = r.company_id
       AND r.po_number IS NOT NULL
       AND po.po_number COLLATE utf8mb4_unicode_ci = r.po_number COLLATE utf8mb4_unicode_ci
      WHERE r.company_id = ?
    `;
    const params = [company_id];

    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }

    if (q) {
      sql += ` AND (
        r.reference_number LIKE ? OR 
        r.po_number LIKE ? OR
        s.supplier_name LIKE ? OR
        s.supplier_code LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard, qWildcard);
    }

    sql += ` ORDER BY r.created_at DESC`;

    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /**
   * Counts the total number of receiving records matching the query for a company.
   * @param {number} company_id - The ID of the company.
   * @param {string} [q] - Search query.
   * @param {string} [status] - Filter by status.
   * @returns {Promise<number>} - The total count.
   */
  async countAll(company_id, q, status) {
    let sql = `
      SELECT COUNT(r.receiving_id) AS total
      FROM receiving r
      LEFT JOIN suppliers s ON r.supplier_id = s.supplier_id
      WHERE r.company_id = ?
    `;
    const params = [company_id];

    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }

    if (q) {
      sql += ` AND (
        r.reference_number LIKE ? OR 
        r.po_number LIKE ? OR
        s.supplier_name LIKE ? OR
        s.supplier_code LIKE ?
      )`;
      const qWildcard = `%${q}%`;
      params.push(qWildcard, qWildcard, qWildcard, qWildcard);
    }

    const [[{ total }]] = await pool.query(sql, params);
    return total;
  },

  /**
   * Retrieves a single receiving record by ID with all items.
   * @param {number} id - The receiving ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object|null>} - The receiving object with items or null if not found.
   */
  async getById(id, company_id) {
    const sql = `
      SELECT 
        r.*,
        s.supplier_name,
        s.supplier_code,
        u.username as received_by_name,
        po.purchase_order_id
      FROM receiving r
      LEFT JOIN suppliers s ON r.supplier_id = s.supplier_id
      LEFT JOIN users u ON r.received_by = u.user_id
      LEFT JOIN purchase_orders po 
        ON po.company_id = r.company_id
       AND r.po_number IS NOT NULL
       AND po.po_number COLLATE utf8mb4_unicode_ci = r.po_number COLLATE utf8mb4_unicode_ci
      WHERE r.receiving_id = ? AND r.company_id = ?
    `;
    const [[row]] = await pool.query(sql, [id, company_id]);
    
    if (!row) return null;

    // Get all items for this receiving
    row.items = await this.getItemsByReceivingId(id, company_id);
    
    return row;
  },

  /**
   * Retrieves the most recent receiving record that matches a given purchase order ID.
   * Falls back to matching on PO number to stay compatible with databases that
   * do not yet have a receiving.purchase_order_id column.
   */
  async getByPurchaseOrderId(poId, company_id) {
    const sql = `
      SELECT 
        r.*,
        s.supplier_name,
        s.supplier_code,
        u.username as received_by_name,
        po.purchase_order_id
      FROM receiving r
      JOIN purchase_orders po
        ON po.company_id = r.company_id
       AND r.po_number IS NOT NULL
       AND po.po_number COLLATE utf8mb4_unicode_ci = r.po_number COLLATE utf8mb4_unicode_ci
      LEFT JOIN suppliers s ON r.supplier_id = s.supplier_id
      LEFT JOIN users u ON r.received_by = u.user_id
      WHERE po.purchase_order_id = ? AND r.company_id = ?
      ORDER BY r.received_at DESC
      LIMIT 1
    `;
    const [[row]] = await pool.query(sql, [poId, company_id]);

    if (!row) return null;

    row.items = await this.getItemsByReceivingId(row.receiving_id, company_id);
    return row;
  },

  /**
   * Creates a new receiving record.
   * @param {object} data - Receiving data. Must include company_id.
   * @returns {Promise<object>} - The newly created receiving object.
   */
  async create(data) {
    const { 
      company_id, supplier_id, po_number, reference_number, 
      notes, received_by, purchase_order_id
    } = data;
    
    let actualPoNumber = po_number;
    let actualSupplierId = supplier_id;
    
    // If purchase_order_id is provided, look up the PO number and supplier
    if (purchase_order_id) {
      const [[po]] = await pool.query(
        `SELECT po_number, supplier_id FROM purchase_orders 
         WHERE purchase_order_id = ? AND company_id = ?`,
        [purchase_order_id, company_id]
      );
      
      if (po) {
        actualPoNumber = po.po_number;
        if (!actualSupplierId) {
          actualSupplierId = po.supplier_id;
        }
      }
    }
    
    const [result] = await pool.query(
      `INSERT INTO receiving (
        company_id,
        supplier_id,
        po_number,
        reference_number,
        status,
        notes,
        received_by,
        received_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())`,
      [
        company_id,
        actualSupplierId || null,
        actualPoNumber || null,
        reference_number || null,
        notes || null,
        received_by
      ]
    );
    
    const receiving = await this.getById(result.insertId, company_id);
    
    // Add purchase_order_id to the returned object for frontend convenience
    if (purchase_order_id) {
      receiving.purchase_order_id = purchase_order_id;
    }
    
    return receiving;
  },

  /**
   * Updates a receiving record.
   * @param {number} id - The receiving ID.
   * @param {object} patch - The fields to update.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - The updated receiving object.
   */
  async update(id, patch, company_id) {
    const { company_id: _, receiving_id: __, created_at: ___, ...safePatch } = patch;
    
    const fields = Object.keys(safePatch)
      .filter(key => safePatch[key] !== undefined)
      .map(key => `${key} = ?`)
      .join(', ');
      
    const values = Object.values(safePatch).filter(v => v !== undefined);

    if (fields.length === 0) {
      return this.getById(id, company_id);
    }
    
    const [result] = await pool.query(
      `UPDATE receiving 
       SET ${fields} 
       WHERE receiving_id = ? AND company_id = ?`,
      [...values, id, company_id]
    );
    
    if (result.affectedRows === 0) {
      const existing = await this.getById(id, company_id);
      if (!existing) {
        throw new Error('Receiving record not found or access denied');
      }
    }
    
    return this.getById(id, company_id);
  },

  /**
   * Retrieves all items for a specific receiving record.
   * @param {number} receiving_id - The receiving ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<Array<object>>} - The list of receiving items.
   */
  async getItemsByReceivingId(receiving_id, company_id) {
    console.log(`getItemsByReceivingId called with receiving_id: ${receiving_id}, company_id: ${company_id}`);
    const sql = `
      SELECT 
        ri.*,
        l.expiration_date AS expiration_date,
        p.product_name AS part_name,
        p.sku,
        s.supplier_name,
        s.supplier_code,
        COALESCE(l.lot_number, ri.lot_number) AS lot_number,
        COALESCE(sr.serial_number, ri.serial_number) AS serial_number,
        loc.location_name
      FROM receiving_items ri
      JOIN receiving r ON ri.receiving_id = r.receiving_id
      LEFT JOIN parts p ON ri.part_id = p.part_id
      LEFT JOIN suppliers s ON ri.supplier_id = s.supplier_id
      LEFT JOIN lots l ON ri.lot_id = l.lot_id
      LEFT JOIN serials sr ON ri.serial_id = sr.serial_id
      LEFT JOIN locations loc ON ri.location_id = loc.location_id
      WHERE ri.receiving_id = ? AND r.company_id = ?
      ORDER BY ri.created_at ASC
    `;
    const [rows] = await pool.query(sql, [receiving_id, company_id]);
    console.log(`Retrieved ${rows.length} items for receiving_id ${receiving_id}`);
    return rows;
  },

  /**
   * Adds an item to a receiving record.
   * @param {number} receiving_id - The receiving ID.
   * @param {number} company_id - The company ID for security.
   * @param {object} itemData - The item data.
   * @returns {Promise<object>} - The newly created receiving item.
   */
  async addItem(receiving_id, company_id, itemData) {
    console.log('addItem called with:', { receiving_id, company_id, itemData });
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verify the receiving record belongs to the company and is pending
      const [[receiving]] = await connection.query(
        `SELECT 
           r.receiving_id, 
           r.status, 
           r.po_number,
           po.purchase_order_id
         FROM receiving r
         LEFT JOIN purchase_orders po
           ON po.company_id = r.company_id
          AND r.po_number IS NOT NULL
          AND po.po_number COLLATE utf8mb4_unicode_ci = r.po_number COLLATE utf8mb4_unicode_ci
         WHERE r.receiving_id = ? AND r.company_id = ?
         FOR UPDATE`,
        [receiving_id, company_id]
      );
      
      if (!receiving) {
        throw new Error('Receiving record not found or access denied');
      }

      if (receiving.status === 'completed') {
        throw new Error('Cannot add items to completed receiving record');
      }

      // Extract all inputs with destructuring and default values
      const {
        part_id, supplier_id, location_id, quantity_received,
        lot_number, serial_number, gtin, sku,
        expiry_date: legacyExpiryDate,
        expiration_date,
        notes,
        po_line_id, // Trust the PO Line ID from the frontend
        purchase_order_id = receiving.purchase_order_id  // Fallback to receiving's PO
      } = itemData;
      const lotExpirationDate = parseDateOrNull(expiration_date ?? legacyExpiryDate);

      // 0) Verify the provided PO line, PO, and Part match
      // The frontend requires all these fields, so we validate them.
      if (po_line_id) {
        if (!purchase_order_id || !part_id) {
          throw new Error('PO Line, Purchase Order, and Part are all required.');
        }

        const [[line]] = await connection.query(
          `SELECT po_line_id, quantity_ordered, quantity_received, purchase_order_id, part_id
           FROM purchase_order_lines
           WHERE po_line_id = ?
           FOR UPDATE`,
          [po_line_id]
        );

        if (!line) {
          throw new Error(`PO Line ID ${po_line_id} not found.`);
        }
        if (line.purchase_order_id !== purchase_order_id) {
          throw new Error(`PO Line ${po_line_id} does not belong to PO ${purchase_order_id}.`);
        }
        if (line.part_id !== part_id) {
          throw new Error(`PO Line ${po_line_id} (for Part ${line.part_id}) does not match selected Part ${part_id}.`);
        }
      }

      // 1) Ensure LOT (company + part + lot_number)
      let lotId = null;
      const effectiveLot = lot_number || (serial_number ? `SER-${serial_number.slice(0,16)}` : null);
      
      if (effectiveLot && part_id) {
        // Check for existing lot
        const [lotRows] = await connection.query(
          `SELECT lot_id, expiration_date FROM lots 
           WHERE company_id = ? AND part_id = ? AND lot_number = ? 
           LIMIT 1
           FOR UPDATE`,
          [company_id, part_id, effectiveLot]
        );
        
        if (lotRows.length > 0) {
          lotId = lotRows[0].lot_id;
          console.log('Using existing lot ID:', lotId);
          if (lotExpirationDate) {
            const existingExpiration = lotRows[0].expiration_date
              ? new Date(lotRows[0].expiration_date)
              : null;
            if (!existingExpiration) {
              await connection.query(
                `UPDATE lots SET expiration_date = ? WHERE lot_id = ?`,
                [lotExpirationDate, lotId]
              );
            } else if (existingExpiration.getTime() !== lotExpirationDate.getTime()) {
              console.warn('Expiration mismatch for lot', {
                lotId,
                provided: lotExpirationDate,
                existing: existingExpiration
              });
            }
          }
        } else {
          // Create new lot (legacy schema compatibility: no created_at/updated_at columns)
          const [insLot] = await connection.query(
            `INSERT INTO lots (
              company_id, part_id, lot_number, 
              received_date, supplier_id, location_id, expiration_date
            ) VALUES (?, ?, ?, CURDATE(), ?, ?, ?)`,
            [
              company_id,
              part_id,
              effectiveLot,
              supplier_id || null,
              location_id || null,
              lotExpirationDate
            ]
          );
          lotId = insLot.insertId;
          console.log('Created new lot with ID:', lotId);
        }
      } else if (lotExpirationDate) {
        console.warn('Expiration provided without a lot; value ignored', {
          receiving_id,
          part_id,
          lot_number: effectiveLot
        });
      }

      // 2) Ensure SERIAL (company + part + serial_number)
      let serialId = null;
      if (serial_number && part_id) {
        // Check for existing serial
        const [srRows] = await connection.query(
          `SELECT serial_id FROM serials
           WHERE company_id = ? AND part_id = ? AND serial_number = ?
           LIMIT 1
           FOR UPDATE`,
          [company_id, part_id, serial_number]
        );
        
        if (srRows.length > 0) {
          serialId = srRows[0].serial_id;
          console.log('Using existing serial ID:', serialId);
        } else {
          // Create new serial (legacy schema compatibility)
          const [insSr] = await connection.query(
            `INSERT INTO serials (
              company_id, part_id, serial_number, 
              lot_id, status
            ) VALUES (?, ?, ?, ?, 'in_stock')`,
            [company_id, part_id, serial_number, lotId || null]
          );
          serialId = insSr.insertId;
          console.log('Created new serial with ID:', serialId);
        }
      }

      // 3) Insert receiving item (FK-safe; keeps legacy fields as fallback)
      const [result] = await connection.query(
        `INSERT INTO receiving_items (
          receiving_id, part_id, supplier_id, lot_id, serial_id, location_id,
          purchase_order_id, po_line_id,
          lot_number, serial_number, quantity_received,
          scanned_data, gtin, sku, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          receiving_id, part_id, supplier_id || null, lotId, serialId, location_id || null,
          purchase_order_id || null, po_line_id,
          effectiveLot, serial_number || null, quantity_received,
          null, gtin || null, sku || null, 
          notes || null
        ]
      );
      
      const receivingItemId = result.insertId;
      console.log('Added receiving item with ID:', receivingItemId, { lotId, serialId });
      
      await connection.commit();

      // Return the full item with all joins
      const [[created]] = await connection.query(
        `SELECT 
          ri.*,
          l.expiration_date AS expiration_date,
          p.product_name as part_name,
          p.sku,
          s.supplier_name,
          s.supplier_code,
          COALESCE(l.lot_number, ri.lot_number) as lot_number,
          COALESCE(sr.serial_number, ri.serial_number) as serial_number,
          loc.location_name
         FROM receiving_items ri
         LEFT JOIN parts p ON ri.part_id = p.part_id
         LEFT JOIN suppliers s ON ri.supplier_id = s.supplier_id
         LEFT JOIN lots l ON ri.lot_id = l.lot_id
         LEFT JOIN serials sr ON ri.serial_id = sr.serial_id
         LEFT JOIN locations loc ON ri.location_id = loc.location_id
         WHERE ri.receiving_item_id = ?`,
        [receivingItemId]
      );

      return created;
    } catch (error) {
      await connection.rollback();
      console.error('Error in addItem:', { 
        error: error.message, 
        stack: error.stack,
        itemData,
        receiving_id,
        company_id
      });
      throw error; // Re-throw for controller to handle
    } finally {
      connection.release();
    }
  },

  /**
   * Updates a receiving item.
   * @param {number} receiving_id - The receiving ID.
   * @param {number} item_id - The receiving item ID.
   * @param {object} patch - Fields to update.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - The updated item.
   */
  async updateItem(receiving_id, item_id, patch, company_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verify access
      const [[item]] = await connection.query(
        `SELECT ri.receiving_item_id, r.status, ri.lot_id
         FROM receiving_items ri
         JOIN receiving r ON ri.receiving_id = r.receiving_id
         WHERE ri.receiving_item_id = ? AND ri.receiving_id = ? AND r.company_id = ?`,
        [item_id, receiving_id, company_id]
      );

      if (!item) {
        throw new Error('Receiving item not found or access denied');
      }

      if (item.status === 'completed') {
        throw new Error('Cannot update items in completed receiving record');
      }

      const { receiving_item_id: _, created_at: __, ...safePatch } = patch;
      const patchExpiration = parseDateOrNull(
        patch.expiration_date ?? patch.expiry_date ?? null
      );
      delete safePatch.expiry_date;
      delete safePatch.expiration_date;
      
      const fields = Object.keys(safePatch)
        .filter(key => safePatch[key] !== undefined)
        .map(key => `${key} = ?`)
        .join(', ');
        
      const values = Object.values(safePatch).filter(v => v !== undefined);

      if (fields.length > 0) {
        await connection.query(
          `UPDATE receiving_items 
           SET ${fields} 
           WHERE receiving_item_id = ?`,
          [...values, item_id]
        );
      }

      if (patchExpiration && item.lot_id) {
        await connection.query(
          `UPDATE lots SET expiration_date = ? WHERE lot_id = ?`,
          [patchExpiration, item.lot_id]
        );
      }

      await connection.commit();

      const [[updated]] = await pool.query(
        `SELECT 
          ri.*,
          l.expiration_date AS expiration_date,
          p.product_name as part_name,
          p.sku,
          s.supplier_name,
          s.supplier_code,
          l.lot_number,
          loc.location_name
         FROM receiving_items ri
         LEFT JOIN parts p ON ri.part_id = p.part_id
         LEFT JOIN suppliers s ON ri.supplier_id = s.supplier_id
         LEFT JOIN lots l ON ri.lot_id = l.lot_id
         LEFT JOIN locations loc ON ri.location_id = loc.location_id
         WHERE ri.receiving_item_id = ?`,
        [item_id]
      );

      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Removes an item from a receiving record.
   * @param {number} receiving_id - The receiving ID.
   * @param {number} item_id - The receiving item ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - Success status.
   */
  /**
   * Updates the received quantity for a purchase order line
   * @param {object} connection - The database connection
   * @param {number} po_line_id - The purchase order line ID
   */
  async updatePOLineQuantities(connection, po_line_id) {
    await connection.query(
      `UPDATE purchase_order_lines pol
       SET quantity_received = (
         SELECT COALESCE(SUM(ri.quantity_received), 0)
         FROM receiving_items ri
         WHERE ri.po_line_id = pol.po_line_id
       )
       WHERE pol.po_line_id = ?`,
      [po_line_id]
    );
  },

  /**
   * Updates the status of a purchase order based on received quantities
   * @param {object} connection - The database connection
   * @param {number} purchase_order_id - The purchase order ID
   */
  async updatePOStatus(connection, purchase_order_id) {
    // First update all line items' received quantities
    await connection.query(
      `UPDATE purchase_order_lines pol
       SET quantity_received = (
         SELECT COALESCE(SUM(ri.quantity_received), 0)
         FROM receiving_items ri
         WHERE ri.po_line_id = pol.po_line_id
       )
       WHERE pol.purchase_order_id = ?`,
      [purchase_order_id]
    );

    // Then update the PO status based on line items
    await connection.query(
      `UPDATE purchase_orders po
       JOIN (
         SELECT 
           COUNT(*) as total_lines,
           SUM(CASE WHEN quantity_received >= quantity_ordered THEN 1 ELSE 0 END) as completed_lines,
           SUM(CASE WHEN quantity_received > 0 AND quantity_received < quantity_ordered THEN 1 ELSE 0 END) as partial_lines
         FROM purchase_order_lines
         WHERE purchase_order_id = ?
       ) t
       SET po.status = CASE
         WHEN t.completed_lines = t.total_lines THEN 'received'
         WHEN t.completed_lines > 0 OR t.partial_lines > 0 THEN 'partial'
         ELSE po.status
       END
       WHERE po.purchase_order_id = ?`,
      [purchase_order_id, purchase_order_id]
    );
  },

  /**
   * Removes an item from a receiving record
   * @param {number} receiving_id - The receiving ID
   * @param {number} item_id - The receiving item ID to remove
   * @param {number} company_id - The company ID for security
   * @returns {Promise<object>} - Success status
   */
  async removeItem(receiving_id, item_id, company_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // First, get the item details along with PO information
      const [[item]] = await connection.query(
        `SELECT 
          ri.receiving_item_id, 
          ri.po_line_id, 
          ri.purchase_order_id,
          ri.quantity_received, 
          r.status,
          pol.purchase_order_id as actual_po_id
        FROM receiving_items ri
        JOIN receiving r ON ri.receiving_id = r.receiving_id
        LEFT JOIN purchase_order_lines pol ON ri.po_line_id = pol.po_line_id
        WHERE ri.receiving_item_id = ? 
          AND r.company_id = ? 
          AND ri.receiving_id = ?
        FOR UPDATE`,
        [item_id, company_id, receiving_id]
      );

      if (!item) {
        throw new Error('Item not found or access denied');
      }

      if (item.status === 'completed') {
        throw new Error('Cannot remove item from completed receiving');
      }

      // Store PO info before deleting
      const po_line_id = item.po_line_id;
      const purchase_order_id = item.purchase_order_id || item.actual_po_id;

      // Delete the item
      await connection.query(
        'DELETE FROM receiving_items WHERE receiving_item_id = ?',
        [item_id]
      );

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error('Error removing item:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Completes a receiving record and updates inventory.
   * Creates lots and inventory records for all items.
   * Determines if PO should be 'partial' or 'received' based on quantities.
   * @param {number} receiving_id - The receiving ID.
   * @param {number} company_id - The company ID for security.
   * @returns {Promise<object>} - The completed receiving record.
   */
  async complete(receiving_id, company_id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verify access and status
      const [[receiving]] = await connection.query(
        `SELECT 
           r.receiving_id, 
           r.status, 
           r.po_number, 
           po.purchase_order_id
         FROM receiving r
         LEFT JOIN purchase_orders po
           ON po.company_id = r.company_id
          AND r.po_number IS NOT NULL
          AND po.po_number COLLATE utf8mb4_unicode_ci = r.po_number COLLATE utf8mb4_unicode_ci
         WHERE r.receiving_id = ? AND r.company_id = ?`,
        [receiving_id, company_id]
      );
      
      if (!receiving) {
        throw new Error('Receiving record not found or access denied');
      }

      if (receiving.status === 'completed') {
        throw new Error('Receiving record already completed');
      }

      // Get all items for this receiving
      const [items] = await connection.query(
        `SELECT 
           ri.*,
           l.expiration_date AS expiration_date
         FROM receiving_items ri
         LEFT JOIN lots l ON ri.lot_id = l.lot_id
         WHERE ri.receiving_id = ?`,
        [receiving_id]
      );

      if (items.length === 0) {
        throw new Error('Cannot complete receiving with no items');
      }

      // Process each item and update inventory
      for (const item of items) {
        // If lot_id is not set, create a new lot
        let lotId = item.lot_id;
        
        if (!lotId) {
          // Generate lot number if needed
          const lotNumber = item.lot_number || `LOT-${Date.now()}-${item.part_id}`;
          
          const [lotResult] = await connection.query(
            `INSERT INTO lots (
              company_id,
              part_id,
              lot_number, 
              supplier_id,
              location_id,
              received_date,
              expiration_date
            ) VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
            [
              company_id,
              item.part_id,
              lotNumber, 
              item.supplier_id, 
              item.location_id,
              item.expiration_date || null
            ]
          );
          
          lotId = lotResult.insertId;
          
          // Update the receiving item with the new lot_id
          await connection.query(
            `UPDATE receiving_items SET lot_id = ? WHERE receiving_item_id = ?`,
            [lotId, item.receiving_item_id]
          );
        }

        // Check if inventory record exists
        const [[existing]] = await connection.query(
          `SELECT inventory_id, quantity_available 
           FROM inventory 
           WHERE lot_id = ? AND part_id = ? AND company_id = ?`,
          [lotId, item.part_id, company_id]
        );

        if (existing) {
          // Update existing inventory - increment both on_hand and available
          await connection.query(
            `UPDATE inventory 
             SET quantity_on_hand = quantity_on_hand + ?,
                 quantity_available = quantity_available + ?
             WHERE inventory_id = ?`,
            [item.quantity_received, item.quantity_received, existing.inventory_id]
          );
        } else {
          // Create new inventory record
          await connection.query(
            `INSERT INTO inventory (
              company_id,
              part_id,
              lot_id,
              supplier_id,
              location_id,
              quantity_on_hand,
              quantity_available,
              quantity_reserved,
              quantity_on_order,
              serial_number,
              received_date,
              is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NOW(), 1)`,
            [
              company_id, 
              item.part_id, 
              lotId, 
              item.supplier_id || null,
              item.location_id || null,
              item.quantity_received,  // quantity_on_hand
              item.quantity_received,  // quantity_available
              item.serial_number || null
            ]
          );
        }

        // Update PO line quantity_received if po_line_id exists
        if (item.po_line_id) {
          await connection.query(
            `UPDATE purchase_order_lines 
             SET quantity_received = COALESCE(quantity_received, 0) + ?
             WHERE po_line_id = ?`,
            [item.quantity_received, item.po_line_id]
          );
        }
      }

      // Mark receiving as completed
      await connection.query(
        `UPDATE receiving 
         SET status = 'completed', completed_at = NOW() 
         WHERE receiving_id = ?`,
        [receiving_id]
      );

      // Calculate PO status based on received quantities
      if (receiving.purchase_order_id || receiving.po_number) {
        // Get purchase order ID
        let poId = receiving.purchase_order_id;
        
        if (!poId && receiving.po_number) {
          const [[po]] = await connection.query(
            `SELECT purchase_order_id FROM purchase_orders 
             WHERE po_number = ? AND company_id = ?`,
            [receiving.po_number, company_id]
          );
          poId = po?.purchase_order_id;
        }

        if (poId) {
          // Calculate total quantities per PO line
          const [lineQuantities] = await connection.query(
            `SELECT 
               po_line_id,
               quantity_ordered,
               COALESCE(quantity_received, 0) as quantity_received
             FROM purchase_order_lines
             WHERE purchase_order_id = ?`,
            [poId]
          );

          // Determine if ALL lines are fully received
          let allLinesFullyReceived = lineQuantities.length > 0;
          let anyLinesPartiallyReceived = false;

          for (const line of lineQuantities) {
            const received = Number(line.quantity_received || 0);
            const ordered = Number(line.quantity_ordered || 0);
            
            if (received < ordered) {
              allLinesFullyReceived = false;
            }
            if (received > 0 && received < ordered) {
              anyLinesPartiallyReceived = true;
            }
          }

          // Set PO status based on received quantities
          let poStatus;
          if (allLinesFullyReceived) {
            poStatus = 'received'; // Fully received
          } else if (anyLinesPartiallyReceived || lineQuantities.some(l => l.quantity_received > 0)) {
            poStatus = 'partial'; // Partially received
          } else {
            poStatus = 'approved'; // No items received (shouldn't happen, but safe)
          }

          // Update purchase order status
          await connection.query(
            `UPDATE purchase_orders 
             SET status = ?, updated_at = NOW()
             WHERE purchase_order_id = ? AND company_id = ?`,
            [poStatus, poId, company_id]
          );
        }
      }

      await connection.commit();
      
      return this.getById(receiving_id, company_id);
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Parses a data matrix scan and extracts structured data.
   * Supports multiple formats: GS1, HIBC, custom formats.
   * 
   * GS1 Format (most common):
   * - (01) = GTIN (14 digits)
   * - (10) = Batch/Lot number
   * - (17) = Expiration date (YYMMDD)
   * - (21) = Serial number
   * - (30) = Quantity
   * - (240) = Additional product identification
   * 
   * @param {string} scannedData - The raw scanned data from data matrix.
   * @returns {object} - Parsed data with fields: gtin, lot, serial, quantity, expiry, expiration_date, raw, format.
   */
  parseScan(scannedData) {
    const result = {
      raw: scannedData,
      format: 'unknown',
      gtin: null,
      lot: null,
      serial: null,
      quantity: null,
      expiry: null,
      expiration_date: null,
      supplier_code: null,
      manufacturer: null,
      sku: null,
    };

    if (!scannedData || typeof scannedData !== 'string') {
      return result;
    }

    // Try GS1 format first (most common in supply chain)
    // GS1 uses Application Identifiers (AI) in parentheses
    const gs1Pattern = /\((\d{2,4})\)([^\(]+)/g;
    const gs1Matches = [...scannedData.matchAll(gs1Pattern)];
    
    if (gs1Matches.length > 0) {
      result.format = 'GS1';
      
      gs1Matches.forEach(([, ai, value]) => {
        switch (ai) {
          case '01':
            result.gtin = value.trim();
            break;
          case '10':
            result.lot = value.trim();
            break;
          case '21':
            result.serial = value.trim();
            break;
          case '30':
          case '37':
            result.quantity = parseInt(value.trim(), 10);
            break;
          case '17':
            // YYMMDD format
            result.expiration_date = this.parseGS1Date(value.trim());
            result.expiry = result.expiration_date; // legacy alias
            break;
          case '240':
            // AI 240 = Additional product identification (often manufacturer/supplier)
            result.manufacturer = value.trim();
            result.sku = value.trim(); // Keep for backwards compatibility
            break;
        }
      });
      
      return result;
    }

    // Try HIBC format (common in healthcare)
    if (scannedData.startsWith('+') || scannedData.startsWith('=')) {
      result.format = 'HIBC';
      
      // HIBC Primary: +[LIC][Product Code][Unit of Measure]
      // HIBC Secondary: +[Unit of Measure][Lot][Expiry][Quantity]
      const hibcParts = scannedData.substring(1).split('/');
      
      if (hibcParts.length >= 1) {
        // Simple extraction - adjust based on actual HIBC format used
        const primary = hibcParts[0];
        if (primary.length > 4) {
          result.sku = primary.substring(3);
        }
        
        if (hibcParts.length > 1) {
          const secondary = hibcParts[1];
          // Extract lot (positions vary by format)
          result.lot = secondary.substring(1, 14).trim();
        }
      }
      
      return result;
    }

    // Try simple delimited format (pipe, comma, semicolon)
    const delimiters = ['|', ',', ';', '\t'];
    
    for (const delimiter of delimiters) {
      if (scannedData.includes(delimiter)) {
        result.format = `delimited-${delimiter}`;
        const parts = scannedData.split(delimiter).map(p => p.trim());
        
        // Try to intelligently assign parts
        // Common patterns: SKU|LOT|QTY or GTIN|LOT|SERIAL|QTY
        parts.forEach((part, index) => {
          // If it looks like a number and we haven't set quantity
          if (/^\d+$/.test(part) && !result.quantity && index > 0) {
            result.quantity = parseInt(part, 10);
          }
          // If it looks like a GTIN (14 digits)
          else if (/^\d{14}$/.test(part) && !result.gtin) {
            result.gtin = part;
          }
          // If it looks like a SKU (alphanumeric, first or second position)
          else if (index <= 1 && !result.sku) {
            result.sku = part;
          }
          // Everything else might be lot or serial
          else if (!result.lot) {
            result.lot = part;
          } else if (!result.serial) {
            result.serial = part;
          }
        });
        
        return result;
      }
    }

    // If no format detected, treat entire string as lot/identifier
    result.format = 'raw';
    result.lot = scannedData.trim();
    
    return result;
  },

  /**
   * Helper to parse GS1 date format (YYMMDD).
   * @param {string} dateStr - Date string in YYMMDD format.
   * @returns {string|null} - ISO date string or null.
   */
  parseGS1Date(dateStr) {
    if (!dateStr || dateStr.length !== 6) return null;
    
    try {
      const yy = parseInt(dateStr.substring(0, 2), 10);
      const mm = parseInt(dateStr.substring(2, 4), 10);
      const dd = parseInt(dateStr.substring(4, 6), 10);
      
      // Assume 20xx for years 00-49, 19xx for 50-99
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      
      const date = new Date(year, mm - 1, dd);
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  },

  /**
   * Attempts to match parsed scan data to existing parts, suppliers, and lots.
   * Returns potential matches for user to select from.
   * @param {number} company_id - The company ID.
   * @param {object} parsedData - The parsed scan data from parseScan().
   * @returns {Promise<object>} - Matched parts, suppliers, lots, and suggestions.
   */
  async matchScannedData(company_id, parsedData) {
    const connection = await pool.getConnection();
    
    try {
      const matches = {
        parts: [],
        suppliers: [],
        lots: [],
        suggestions: {
          part_id: null,
          supplier_id: null,
          lot_id: null,
          quantity: parsedData.quantity || 1,
        }
      };

      // Try to match part by GTIN, SKU, or partial match
      if (parsedData.gtin || parsedData.sku) {
        const searchTerm = parsedData.gtin || parsedData.sku;
        
        const [parts] = await connection.query(
          `SELECT 
            part_id, product_name as part_name, sku, gtin, default_supplier_id as supplier_id
           FROM parts
           WHERE company_id = ? 
             AND is_active = 1
             AND (
               gtin = ? OR 
               sku = ? OR 
               sku LIKE ? OR
               product_name LIKE ?
             )
           LIMIT 10`,
          [company_id, searchTerm, searchTerm, `%${searchTerm}%`, `%${searchTerm}%`]
        );
        
        matches.parts = parts;
        
        if (parts.length === 1) {
          matches.suggestions.part_id = parts[0].part_id;
          
          // If part has a default supplier, suggest it
          if (parts[0].supplier_id) {
            matches.suggestions.supplier_id = parts[0].supplier_id;
          }
        }
      }

      // Try to match supplier by any available data
      // Check all parsed fields that might contain supplier info
      const supplierSearchTerms = [
        parsedData.supplier_code,
        parsedData.manufacturer,
        parsedData.vendor,
        parsedData.gtin, // Sometimes GTIN includes supplier info
        parsedData.sku,
        parsedData.lot,
        parsedData.serial
      ].filter(Boolean);

      if (supplierSearchTerms.length > 0) {
        // Build dynamic WHERE clause to search all fields
        const conditions = [];
        const params = [company_id];
        
        supplierSearchTerms.forEach(term => {
          conditions.push(`(
            supplier_code LIKE ? OR 
            supplier_name LIKE ? OR
            REPLACE(REPLACE(LOWER(supplier_name), ' ', ''), '-', '') LIKE ?
          )`);
          params.push(`%${term}%`, `%${term}%`, `%${term.toLowerCase().replace(/[\s-]/g, '')}%`);
        });

        const [suppliers] = await connection.query(
          `SELECT 
            supplier_id, supplier_name, supplier_code
           FROM suppliers
           WHERE company_id = ? 
             AND is_active = 1
             AND (${conditions.join(' OR ')})
           LIMIT 5`,
          params
        );
        
        matches.suppliers = suppliers;
        
        if (suppliers.length === 1) {
          matches.suggestions.supplier_id = suppliers[0].supplier_id;
        } else if (suppliers.length > 1) {
          // If multiple matches, try exact name match first
          const exactMatch = suppliers.find(s => 
            supplierSearchTerms.some(term => 
              s.supplier_name.toLowerCase().replace(/[\s-]/g, '') === term.toLowerCase().replace(/[\s-]/g, '')
            )
          );
          if (exactMatch) {
            matches.suggestions.supplier_id = exactMatch.supplier_id;
          }
        }
      }

      // Try to match existing lot by lot number
      if (parsedData.lot) {
        const [lots] = await connection.query(
          `SELECT 
            l.lot_id, l.lot_number, l.supplier_id,
            s.supplier_name, s.supplier_code
           FROM lots l
           LEFT JOIN suppliers s ON l.supplier_id = s.supplier_id
           WHERE l.company_id = ? 
             AND l.lot_number = ?
           LIMIT 5`,
          [company_id, parsedData.lot]
        );
        
        matches.lots = lots;
        
        if (lots.length === 1) {
          matches.suggestions.lot_id = lots[0].lot_id;
          
          if (!matches.suggestions.supplier_id && lots[0].supplier_id) {
            matches.suggestions.supplier_id = lots[0].supplier_id;
          }
        }
      }

      return {
        parsed: parsedData,
        matches,
      };
      
    } finally {
      connection.release();
    }
  },

  /**
   * Gets a purchase order by ID or PO number with line items and received quantities
   * @param {number|string} identifier - PO ID or PO number
   * @param {number} company_id - Company ID for security
   * @returns {Promise<object|null>} - PO with lines or null
   */
  async getPurchaseOrderWithLines(identifier, company_id) {
    const connection = await pool.getConnection();
    
    try {
      // Determine if identifier is ID or PO number
      const isId = typeof identifier === 'number' || /^\d+$/.test(identifier);
      
      const [pos] = await connection.query(
        `SELECT 
          po.*,
          s.supplier_name,
          s.supplier_code
         FROM purchase_orders po
         LEFT JOIN suppliers s ON po.supplier_id = s.supplier_id
         WHERE ${isId ? 'po.purchase_order_id' : 'po.po_number'} = ? 
           AND po.company_id = ?`,
        [identifier, company_id]
      );
      
      if (pos.length === 0) return null;
      
      const po = pos[0];
      
      // Get line items with received quantities
      const [lines] = await connection.query(
        `SELECT 
          pol.*,
          p.product_name,
          p.part_name,
          p.sku,
          p.gtin,
          COALESCE(pol.quantity_received, 0) as quantity_received
         FROM purchase_order_lines pol
         LEFT JOIN parts p ON pol.part_id = p.part_id
         WHERE pol.purchase_order_id = ?
         ORDER BY pol.po_line_id`,
        [po.purchase_order_id]
      );
      
      po.lines = lines;
      
      return po;
      
    } finally {
      connection.release();
    }
  },
};
