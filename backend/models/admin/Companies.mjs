import pool from '../../db/pool.mjs';

let cachedColumns = null;

async function fetchColumnsFromDb() {
  const [rows] = await pool.query('SHOW COLUMNS FROM companies');
  cachedColumns = rows.map((row) => ({
    name: row.Field,
    type: row.Type,
    nullable: row.Null === 'YES',
    key: row.Key,
    default: row.Default,
    extra: row.Extra,
  }));
  return cachedColumns;
}

async function getColumns() {
  if (cachedColumns) return cachedColumns;
  return fetchColumnsFromDb();
}

export async function refreshCompanyColumnsCache() {
  cachedColumns = null;
  return getColumns();
}

async function getIdColumnName() {
  const columns = await getColumns();
  const primary = columns.find((col) => col.key === 'PRI');
  if (primary) return primary.name;
  if (columns.some((col) => col.name === 'company_id')) return 'company_id';
  if (columns.some((col) => col.name === 'id')) return 'id';
  throw new Error('Unable to determine primary key column for companies table');
}

async function getWritableColumnNames() {
  const columns = await getColumns();
  const excluded = new Set(['created_at', 'updated_at']);
  return columns
    .filter((col) => col.extra !== 'auto_increment' && !excluded.has(col.name))
    .map((col) => col.name);
}

function normalizeBoolean(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return ['1', 'true', 'yes', 'on'].includes(trimmed.toLowerCase()) ? 1 : 0;
  }
  return value ? 1 : 0;
}

function normalizePayload(data, writableColumns) {
  const payload = {};
  for (const column of writableColumns) {
    if (data[column] === undefined) continue;
    let value = data[column];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      value = trimmed === '' ? null : trimmed;
    }

    if (column === 'is_active' || column === 'active') {
      value = normalizeBoolean(value);
    }

    payload[column] = value;
  }
  return payload;
}

function resolveNameColumn(columnNames) {
  if (columnNames.includes('company_name')) return 'company_name';
  if (columnNames.includes('name')) return 'name';
  if (columnNames.includes('legal_name')) return 'legal_name';
  return null;
}

export async function getCompanyColumnsMetadata({ refresh = false } = {}) {
  if (refresh) await refreshCompanyColumnsCache();
  const columns = await getColumns();
  return columns.map((col) => ({
    name: col.name,
    type: col.type,
    nullable: col.nullable,
    key: col.key,
    defaultValue: col.default,
    extra: col.extra,
    writable: col.extra !== 'auto_increment' && !['created_at', 'updated_at'].includes(col.name),
  }));
}

export async function getCompanies({ limit = 50, offset = 0, includeInactive = true, search = '', withTotal = false } = {}) {
  const columns = await getColumns();
  const columnNames = columns.map((col) => col.name);
  const where = [];
  const filterParams = [];

  if (!includeInactive && columnNames.includes('is_active')) {
    where.push('is_active = 1');
  }

  if (search) {
    const searchCandidates = [
      'company_name',
      'name',
      'legal_name',
      'dba_name',
      'contact_email',
      'contact_phone',
      'website',
      'city',
      'state',
      'country',
    ];
    const searchable = searchCandidates.filter((col) => columnNames.includes(col));
    if (searchable.length > 0) {
      const like = `%${search}%`;
      const clauses = searchable.map((col) => `${col} LIKE ?`);
      where.push(`(${clauses.join(' OR ')})`);
      filterParams.push(...searchable.map(() => like));
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const idColumn = await getIdColumnName();
  const orderColumn = resolveNameColumn(columnNames) || idColumn;
  const safeOrder = `\`${orderColumn}\``;

  const dataParams = [...filterParams, Number(limit), Number(offset)];

  const [rows] = await pool.query(
    `SELECT * FROM companies ${whereSql} ORDER BY ${safeOrder} ASC LIMIT ? OFFSET ?`,
    dataParams,
  );

  if (!withTotal) {
    return rows;
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM companies ${whereSql}`,
    filterParams,
  );

  const total = countRows[0]?.total ?? rows.length;
  return { rows, total };
}

export async function getCompanyById(companyId) {
  const idColumn = await getIdColumnName();
  const [rows] = await pool.query(
    `SELECT * FROM companies WHERE \`${idColumn}\` = ? LIMIT 1`,
    [companyId],
  );
  return rows[0] || null;
}

export async function createCompany(data = {}) {
  const writableColumns = await getWritableColumnNames();
  const payload = normalizePayload(data, writableColumns);
  const keys = Object.keys(payload);

  if (keys.length === 0) {
    throw new Error('No valid company fields provided');
  }

  const columns = await getColumns();
  const columnNames = columns.map((col) => col.name);
  const nameColumn = resolveNameColumn(columnNames);
  if (nameColumn && (payload[nameColumn] === undefined || payload[nameColumn] === null)) {
    throw new Error(`${nameColumn} is required`);
  }

  const columnsSql = keys.map((key) => `\`${key}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map((key) => payload[key]);

  const [result] = await pool.query(
    `INSERT INTO companies (${columnsSql}) VALUES (${placeholders})`,
    values,
  );

  const idColumn = await getIdColumnName();
  const insertedId = result.insertId || payload[idColumn];
  return insertedId ? getCompanyById(insertedId) : null;
}

export async function updateCompany(companyId, patch = {}) {
  const writableColumns = await getWritableColumnNames();
  const payload = normalizePayload(patch, writableColumns);
  delete payload.company_id;
  delete payload.id;

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    throw new Error('No updatable company fields provided');
  }

  const setSql = keys.map((key) => `\`${key}\` = ?`).join(', ');
  const values = keys.map((key) => payload[key]);
  const idColumn = await getIdColumnName();
  const columns = await getColumns();
  const hasUpdatedAt = columns.some((col) => col.name === 'updated_at');
  const updatedAtSql = hasUpdatedAt ? ', `updated_at` = NOW()' : '';

  const [result] = await pool.query(
    `UPDATE companies SET ${setSql}${updatedAtSql} WHERE \`${idColumn}\` = ?`,
    [...values, companyId],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getCompanyById(companyId);
}

export async function deactivateCompany(companyId) {
  const columns = await getColumns();
  if (!columns.some((col) => col.name === 'is_active')) {
    throw new Error('companies table does not have is_active column');
  }
  const idColumn = await getIdColumnName();
  const hasUpdatedAt = columns.some((col) => col.name === 'updated_at');
  const updatedAtSql = hasUpdatedAt ? ', `updated_at` = NOW()' : '';
  const [result] = await pool.query(
    `UPDATE companies SET is_active = 0${updatedAtSql} WHERE \`${idColumn}\` = ?`,
    [companyId],
  );
  if (result.affectedRows === 0) return null;
  return getCompanyById(companyId);
}

export async function deleteCompany(companyId) {
  const idColumn = await getIdColumnName();
  const [result] = await pool.query(
    `DELETE FROM companies WHERE \`${idColumn}\` = ? LIMIT 1`,
    [companyId],
  );
  return { deleted: result.affectedRows > 0 };
}

