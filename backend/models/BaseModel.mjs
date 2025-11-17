import pool from '../db/pool.mjs';

/**
 * Base model class that provides common database operations
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.pool = pool;
  }

  /**
   * Execute a query with the provided SQL and parameters
   * @param {string} sql - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} - Query results
   */
  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error(`Error executing query: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Find a single record by ID
   * @param {number|string} id - Record ID
   * @param {string} idColumn - Column name for ID (default: 'id')
   * @returns {Promise<Object|null>} - Found record or null
   */
  async findById(id, idColumn = 'id') {
    const [rows] = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE ${idColumn} = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find all records with optional filters
   * @param {Object} filters - Key-value pairs for WHERE conditions
   * @param {string} orderBy - ORDER BY clause
   * @param {number} limit - Maximum number of records to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} - Array of records
   */
  async findAll(filters = {}, orderBy = '', limit = null, offset = 0) {
    let whereClause = '';
    const params = [];
    
    const filterEntries = Object.entries(filters);
    if (filterEntries.length > 0) {
      whereClause = 'WHERE ' + filterEntries
        .map(([key]) => `${key} = ?`)
        .join(' AND ');
      params.push(...Object.values(filters));
    }

    let sql = `SELECT * FROM ${this.tableName} ${whereClause}`;
    
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    if (limit !== null) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return this.query(sql, params);
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @returns {Promise<Object>} - Created record with ID
   */
  async create(data) {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const [result] = await this.pool.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
      values
    );
    
    return this.findById(result.insertId);
  }

  /**
   * Update a record by ID
   * @param {number|string} id - Record ID
   * @param {Object} data - Fields to update
   * @param {string} idColumn - Column name for ID (default: 'id')
   * @returns {Promise<boolean>} - True if updated successfully
   */
  async update(id, data, idColumn = 'id') {
    if (Object.keys(data).length === 0) {
      throw new Error('No data provided for update');
    }
    
    const setClause = Object.keys(data)
      .map(key => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(data), id];
    
    const [result] = await this.pool.query(
      `UPDATE ${this.tableName} SET ${setClause} WHERE ${idColumn} = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  /**
   * Delete a record by ID
   * @param {number|string} id - Record ID
   * @param {string} idColumn - Column name for ID (default: 'id')
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async delete(id, idColumn = 'id') {
    const [result] = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE ${idColumn} = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default BaseModel;
