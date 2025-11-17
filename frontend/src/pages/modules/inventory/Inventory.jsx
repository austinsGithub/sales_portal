import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Inventory.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const EXPORT_LIMIT = 5000;
const getStoredToken = () =>
  localStorage.getItem('token') ||
  localStorage.getItem('auth_token') ||
  '';

const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString();
};

const formatQuantity = (qty) =>
  qty !== null && qty !== undefined ? Number(qty).toLocaleString() : '0';

const resolveStatus = (item) => {
  if (item?.status) return item.status;
  if (!item?.expiration_date) return 'Active';
  const expiration = new Date(item.expiration_date);
  const now = new Date();
  if (expiration < now) return 'Expired';
  const soon = new Date(now);
  soon.setDate(now.getDate() + 30);
  if (expiration <= soon) return 'Expiring Soon';
  return 'Active';
};

const getStatusClass = (status) => {
  if (status === 'Expired') return 'status-badge-expired';
  if (status === 'Expiring Soon') return 'status-badge-hold';
  return 'status-badge-active';
};

export default function InventorySearch({ authToken }) {
  const location = useLocation();
  const effectiveToken = useMemo(() => authToken || getStoredToken(), [authToken]);
  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parts, setParts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [exporting, setExporting] = useState(false);
  const itemsPerPage = 50;

  // Sync searchTerm with query param when navigating from global search
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('q')) {
      const qParam = params.get('q') || '';
      if (qParam !== searchTerm) setSearchTerm(qParam);
    }
  }, [location.search, searchTerm]);

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [suppliersRes, partsRes, locationsRes] = await Promise.all([
          fetch(`${API_BASE}/api/procurement/suppliers?limit=250`, {
            headers: { 
              'Authorization': `Bearer ${effectiveToken}`,
              'Content-Type': 'application/json'
            },
          }),
          fetch(`${API_BASE}/api/inventory/parts?limit=500`, {
            headers: { 
              'Authorization': `Bearer ${effectiveToken}`,
              'Content-Type': 'application/json'
            },
          }),
          fetch(`${API_BASE}/api/inventory/locations?limit=500`, {
            headers: { 
              'Authorization': `Bearer ${effectiveToken}`,
              'Content-Type': 'application/json'
            },
          })
        ]);

        if (suppliersRes.ok) {
          const data = await suppliersRes.json();
          setSuppliers(Array.isArray(data) ? data : data.data || []);
        }
        
        if (partsRes.ok) {
          const data = await partsRes.json();
          setParts(Array.isArray(data) ? data : data.data || []);
        }
        
        if (locationsRes.ok) {
          const data = await locationsRes.json();
          setLocations(Array.isArray(data) ? data : data.data || []);
        }
      } catch (err) {
        console.error('Error loading filter options:', err);
      }
    };

    if (effectiveToken) {
      fetchFilterOptions();
    }
  }, [effectiveToken]);

  const buildInventoryParams = useCallback(
    (limitValue = itemsPerPage, offsetValue = (currentPage - 1) * itemsPerPage) => {
      const params = new URLSearchParams();
      params.append('limit', limitValue);
      params.append('offset', offsetValue);

      const trimmedSearch = searchTerm.trim();
      if (trimmedSearch) params.append('q', trimmedSearch);
      if (selectedSupplier) params.append('supplierId', selectedSupplier);
      if (selectedPart) params.append('partId', selectedPart);
      if (selectedLocation) params.append('locationId', selectedLocation);
      if (selectedStatus) params.append('status', selectedStatus);

      return params;
    },
    [currentPage, itemsPerPage, searchTerm, selectedSupplier, selectedPart, selectedLocation, selectedStatus]
  );

  const loadInventory = useCallback(async () => {
    if (!effectiveToken) return;
    setLoading(true);
    setError('');

    try {
      const params = buildInventoryParams();
      const res = await fetch(`${API_BASE}/api/inventory/items?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json'
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setInventory(data.items || []);
      setTotalItems(data.total || 0);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading inventory:', err);
      setInventory([]);
      setTotalItems(0);
      setError(err.message || 'Failed to load inventory data.');
    } finally {
      setLoading(false);
    }
  }, [buildInventoryParams, effectiveToken]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleExport = useCallback(async () => {
    if (!effectiveToken) return;
    setExporting(true);

    try {
      const exportLimit = totalItems > 0 ? Math.min(totalItems, EXPORT_LIMIT) : EXPORT_LIMIT;
      const params = buildInventoryParams(exportLimit, 0);
      const res = await fetch(`${API_BASE}/api/inventory/items?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json'
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const rows = data.items || [];
      if (!rows.length) {
        alert('No inventory records match the current filters.');
        return;
      }

      const headers = [
        'Part',
        'SKU',
        'GTIN',
        'Supplier',
        'Lot Number',
        'Location',
        'Warehouse',
        'On Hand',
        'Available',
        'Reserved',
        'On Order',
        'Serial Number',
        'Received Date',
        'Manufacture Date',
        'Expiration Date',
        'Status'
      ];

      const toCsvValue = (value) => {
        if (value === null || value === undefined) return '""';
        const normalized = String(value).replace(/"/g, '""');
        return `"${normalized}"`;
      };

      const csvRows = rows.map((row) => {
        const status = resolveStatus(row);
        return [
          row.product_name || '',
          row.sku || '',
          row.gtin || '',
          row.supplier_name || '',
          row.lot_number || '',
          row.location_name || '',
          row.warehouse_name || '',
          row.quantity_on_hand ?? '',
          row.quantity_available ?? '',
          row.quantity_reserved ?? '',
          row.quantity_on_order ?? '',
          row.serial_number || '',
          row.received_date || '',
          row.manufacture_date || '',
          row.expiration_date || '',
          status
        ].map(toCsvValue).join(',');
      });

      const csvContent = [
        headers.map(toCsvValue).join(','),
        ...csvRows
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `inventory-export-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting inventory:', err);
      alert(err.message || 'Failed to export inventory.');
    } finally {
      setExporting(false);
    }
  }, [buildInventoryParams, effectiveToken, totalItems]);

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(now.getDate() + 30);
    
    let totalQty = 0,
        availableQty = 0,
        expiring = 0,
        expired = 0,
        uniqueParts = new Set(),
        uniqueSuppliers = new Set(),
        uniqueLots = new Set();

    for (const item of inventory) {
      const qty = Number(item.quantity_on_hand || 0);
      const available = Number(item.quantity_available || 0);
      totalQty += qty;
      availableQty += available;
      
      if (item.part_id) uniqueParts.add(item.part_id);
      if (item.supplier_id) uniqueSuppliers.add(item.supplier_id);
      if (item.lot_id) uniqueLots.add(item.lot_id);
      
      if (item.expiration_date) {
        const exp = new Date(item.expiration_date);
        if (exp < now) expired += qty;
        else if (exp < soon) expiring += qty;
      }
    }
    
    return { 
      totalQty, 
      availableQty, 
      expiring, 
      expired,
      uniqueParts: uniqueParts.size,
      uniqueSuppliers: uniqueSuppliers.size,
      uniqueLots: uniqueLots.size
    };
  }, [inventory]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedSupplier('');
    setSelectedPart('');
    setSelectedLocation('');
    setSelectedStatus('');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const resultsStart = inventory.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const resultsEnd = inventory.length > 0 ? Math.min(currentPage * itemsPerPage, totalItems) : 0;
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading && inventory.length === 0) {
    return (
      <div className="inventory-search loading">
        <p>Loading inventory...</p>
      </div>
    );
  }

  return (
    <div className="inventory-search">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Inventory Management</h1>
          <p className="page-subtitle">
            Track all inventory across suppliers, lots, and locations
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={loadInventory}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || !totalItems}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Total Quantity</div>
          <div className="value">{formatQuantity(stats.totalQty)}</div>
          <div className="sublabel">{formatQuantity(stats.availableQty)} available</div>
        </div>
        <div className="summary-card">
          <div className="label">Unique Parts</div>
          <div className="value">{stats.uniqueParts}</div>
          <div className="sublabel">{stats.uniqueLots} lots</div>
        </div>
        <div className="summary-card">
          <div className="label">Suppliers</div>
          <div className="value">{stats.uniqueSuppliers}</div>
        </div>
        <div className="summary-card">
          <div className="label">Expiring Soon</div>
          <div className="value warning">{formatQuantity(stats.expiring)}</div>
          <div className="sublabel">Within 30 days</div>
        </div>
        <div className="summary-card">
          <div className="label">Expired</div>
          <div className="value danger">{formatQuantity(stats.expired)}</div>
          <div className="sublabel">Action required</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-container">
        <div className="filters-row">
          <div className="filter-group">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="text"
              placeholder="Part name, SKU, lot #, serial #..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label htmlFor="supplier">Supplier</label>
            <select
              id="supplier"
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="part">Part</label>
            <select
              id="part"
              value={selectedPart}
              onChange={(e) => {
                setSelectedPart(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Parts</option>
              {parts.map((p) => (
                <option key={p.part_id} value={p.part_id}>
                  {p.product_name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="location">Location</label>
            <select
              id="location"
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l.location_id} value={l.location_id}>
                  {l.location_name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Expired">Expired</option>
            </select>
          </div>

          <button onClick={handleClearFilters} className="btn-clear-filters">
            Clear Filters
          </button>
        </div>
      </div>

      {/* Results Info */}
      <div className="results-info">
        <p>
          Showing {resultsStart} to {resultsEnd} of {totalItems} items
        </p>
        <div className="results-meta">
          {loading && inventory.length > 0 && (
            <span className="loading-inline">Refreshing…</span>
          )}
          {lastUpdatedLabel && (
            <span className="last-updated">Updated {lastUpdatedLabel}</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="inventory-table-container">
        {error ? (
          <div className="error-state">
            <h3>Error Loading Inventory</h3>
            <p>{error}</p>
          </div>
        ) : inventory.length === 0 ? (
          <div className="empty-state">
            <h3>No Inventory Found</h3>
            <p>Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>SKU / GTIN</th>
                  <th>Supplier</th>
                  <th>Lot #</th>
                  <th>Location</th>
                  <th>Warehouse / Group</th>
                  <th className="align-right">On Hand</th>
                  <th className="align-right">Available</th>
                  <th className="align-right">Reserved</th>
                  <th>Serial #</th>
                  <th>Received</th>
                  <th>Mfg Date</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const expirationDate = item.expiration_date;
                  const status = resolveStatus(item);
                  const expired = status === 'Expired';
                  const expiringSoon = status === 'Expiring Soon';
                  const statusClass = getStatusClass(status);

                  return (
                    <tr
                      key={item.inventory_id}
                      className={`${expired ? 'row-expired' : ''} ${
                        expiringSoon ? 'row-expiring' : ''
                      }`}
                    >
                      <td>
                        <div className="part-cell">
                          <div className="part-name">{item.product_name || '—'}</div>
                        </div>
                      </td>
                      <td>
                        <div className="sku-cell">
                          {item.sku && <div className="sku">{item.sku}</div>}
                          {item.gtin && <div className="gtin">{item.gtin}</div>}
                          {!item.sku && !item.gtin && '—'}
                        </div>
                      </td>
                      <td>{item.supplier_name || '—'}</td>
                      <td>
                        <span className="lot-badge">{item.lot_number || '—'}</span>
                      </td>
                      <td>{item.location_name || '—'}</td>
                      <td>{item.warehouse_name || item.location_name || '—'}</td>
                      <td className="align-right">
                        <strong>{formatQuantity(item.quantity_on_hand)}</strong>
                      </td>
                      <td className="align-right">
                        {formatQuantity(item.quantity_available)}
                      </td>
                      <td className="align-right">
                        {formatQuantity(item.quantity_reserved)}
                      </td>
                      <td>
                        <code className="serial">{item.serial_number || '—'}</code>
                      </td>
                      <td>{formatDate(item.received_date)}</td>
                      <td>{formatDate(item.manufacture_date)}</td>
                      <td>{formatDate(expirationDate)}</td>
                      <td>
                        <span
                          className={`status-badge ${statusClass}`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            Previous
          </button>
          
          <div className="pagination-info">
            Page {currentPage} of {totalPages}
          </div>
          
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
