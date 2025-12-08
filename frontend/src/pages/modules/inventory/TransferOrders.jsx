import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  PlusCircle,
  RefreshCw,
  MapPin,
  Package,
  Search,
  Layers,
  ChevronRight,
  X
} from 'lucide-react';
import CreateTransferOrder from './CreateTransferOrder.jsx';
import TransferOrderDetails from './TransferOrderDetails.jsx';
import './TransferOrders.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const statusClasses = {
  Pending: 'status-pill status-pill-pending',
  Approved: 'status-pill status-pill-approved',
  Picked: 'status-pill status-pill-picked',
  Packed: 'status-pill status-pill-packed',
  Shipped: 'status-pill status-pill-shipped',
  Received: 'status-pill status-pill-received',
  Completed: 'status-pill status-pill-completed',
  Cancelled: 'status-pill status-pill-cancelled'
};

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Approved', label: 'Approved' },
  { id: 'Picked', label: 'Picked' },
  { id: 'Packed', label: 'Packed' },
  { id: 'Shipped', label: 'Shipped' },
  { id: 'Received', label: 'Received' },
  { id: 'Completed', label: 'Completed' },
  { id: 'Cancelled', label: 'Cancelled' }
];

const TransferOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const { data } = await axios.get(`${API_BASE}/api/inventory/transfer-orders`, {
        params: {
          ...(statusFilter ? { status: statusFilter } : {}),
          limit: pageSize,
          offset: offset
        }
      });

      // Handle both old format (array) and new format (object with data and pagination)
      if (Array.isArray(data)) {
        setOrders(data);
        setTotalOrders(data.length);
      } else {
        setOrders(Array.isArray(data.data) ? data.data : []);
        setTotalOrders(data.pagination?.total || 0);
      }
      setError('');
    } catch (err) {
      console.error('Failed to load transfer orders', err);
      setOrders([]);
      setTotalOrders(0);
      setError('Unable to load transfer orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!isDetailOpen) return;
    if (!selectedOrderId) {
      setIsDetailOpen(false);
      return;
    }

    const exists = orders.some((o) => o.transfer_order_id === selectedOrderId);
    if (!exists) {
      if (orders.length > 0) {
        setSelectedOrderId(orders[0].transfer_order_id);
      } else {
        setIsDetailOpen(false);
        setSelectedOrderId(null);
      }
    }
  }, [orders, isDetailOpen, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter ? order.status === statusFilter : true;
      const matchesTerm = term
        ? [
            order.transfer_order_number,
            order.from_location_name,
            order.to_location_name,
            order.blueprint_name,
            order.loadout_serial_suffix,
            order.priority,
            order.status
          ].some((value) => (value || '').toString().toLowerCase().includes(term))
        : true;
      return matchesStatus && matchesTerm;
    });
  }, [orders, searchTerm, statusFilter]);

  const handleOrderCreated = () => {
    setShowCreateModal(false);
    fetchOrders();
  };

  const handleDetailUpdated = () => {
    fetchOrders();
    setDetailRefreshToken((token) => token + 1);
  };

  const handleAssignModalClose = () => {
    setAssigningOrder(null);
  };

  const handleAssignSuccess = () => {
    handleAssignModalClose();
    fetchOrders();
    setDetailRefreshToken((token) => token + 1);
  };

  const openDetails = (orderId) => {
    setSelectedOrderId(orderId);
    setIsDetailOpen(true);
  };

  const closeDetails = () => {
    setIsDetailOpen(false);
  };

  const isSearching = searchTerm.trim().length > 0;
  const isFiltering = Boolean(statusFilter);
  const listIsEmpty = !loading && filteredOrders.length === 0;

  return (
    <div className="transfer-orders-page modern">
      <header className="orders-list-header">
        <div>
          <p className="eyebrow">Inventory Moves</p>
          <h1>Transfer Orders</h1>
        </div>
        <div className="orders-header-actions">
          <button className="ghost-btn" onClick={fetchOrders} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
            <PlusCircle size={18} /> New Order
          </button>
        </div>
      </header>

      <div className="orders-toolbar">
        <div className="search-input-wrapper">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order #, location, blueprint…"
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <div className="toolbar-count">{filteredOrders.length} results</div>
      </div>

      <div className="orders-status-filter">
        {STATUS_FILTERS.map((status) => {
          const active = statusFilter === status.id;
          const count = status.id
            ? orders.filter((order) => order.status === status.id).length
            : orders.length;
          return (
            <button
              key={status.id || 'all'}
              className={`status-filter-pill ${active ? 'active' : ''}`}
              onClick={() => setStatusFilter(status.id)}
            >
              <span>{status.label}</span>
              <span className="count">{count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="inline-alert error compact">{error}</div>
      )}

      <div className="orders-table-card">
        {loading ? (
          <div className="orders-placeholder">
            <div className="spinner" />
            <p>Loading transfer orders...</p>
          </div>
        ) : listIsEmpty ? (
          <div className="orders-placeholder">
            <Layers size={32} />
            {isSearching || isFiltering ? (
              <>
                <h3>No matches</h3>
                <p>Try adjusting your search or status filters.</p>
              </>
            ) : (
              <>
                <h3>No transfer orders</h3>
                <p>Use the New Order button to move inventory between locations.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="orders-table-wrapper">
              <table className="orders-table">
            <thead>
              <tr>
                <th>Transfer Order</th>
                <th>Route</th>
                <th>Blueprint</th>
                <th>Loadout</th>
                <th>Total Items</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                  <tr
                    key={order.transfer_order_id}
                    onClick={() => openDetails(order.transfer_order_id)}
                  >
                    <td>
                      <div className="order-col-main">
                        <strong>{order.transfer_order_number}</strong>
                        <span>Priority {order.priority || 'Medium'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="order-route">
                        <span>{order.from_location_name || '—'}</span>
                        <ChevronRight size={12} />
                        <span>{order.to_location_name || '—'}</span>
                      </div>
                    </td>
                    <td>{order.blueprint_name || '—'}</td>
                    <td>
                      <span className={`loadout-chip ${order.loadout_serial_suffix ? '' : 'empty'}`}>
                        <Package size={14} />
                        {order.loadout_serial_suffix || 'Unassigned'}
                      </span>
                    </td>
                    <td>{order.total_items ?? '—'}</td>
                    <td>
                      {new Date(order.created_at).toLocaleDateString()}<br />
                      <small>
                        {[order.created_by_first_name, order.created_by_last_name].filter(Boolean).join(' ') || 'User'}
                      </small>
                    </td>
                    <td>
                      <span className={statusClasses[order.status] || 'status-pill'}>
                        {order.status || 'Pending'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetails(order.transfer_order_id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={totalOrders}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>
      {showCreateModal && (
        <CreateTransferOrder
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleOrderCreated}
        />
      )}

      {isDetailOpen && selectedOrderId && (
        <div
          className="transfer-order-details-overlay"
          role="presentation"
          onClick={closeDetails}
        >
          <div
            className="transfer-order-details-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mobile-details-close"
              type="button"
              aria-label="Close details"
              onClick={closeDetails}
            >
              <X size={18} />
            </button>
            <TransferOrderDetails
              orderId={selectedOrderId}
              refreshToken={detailRefreshToken}
              onUpdate={handleDetailUpdated}
              onClose={closeDetails}
              onRequestLoadoutChange={(detailOrder) => {
                const row = orders.find((o) => o.transfer_order_id === detailOrder.transfer_order_id);
                const base = row || {};
                setAssigningOrder({ ...base, ...detailOrder });
              }}
            />
          </div>
        </div>
      )}

      {assigningOrder && (
        <AssignLoadoutModal
          order={assigningOrder}
          onClose={handleAssignModalClose}
          onAssigned={handleAssignSuccess}
        />
      )}
    </div>
  );
};

const Pagination = ({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.ceil(totalItems / pageSize);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="orders-pagination">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalItems} orders
      </div>

      <div className="pagination-controls">
        <button
          className="pagination-button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          Previous
        </button>

        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
          ) : (
            <button
              key={page}
              className={`pagination-button ${currentPage === page ? 'active' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          )
        ))}

        <button
          className="pagination-button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          aria-label="Next page"
        >
          Next
        </button>
      </div>

      <div className="pagination-page-size">
        <label htmlFor="page-size">Per page:</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </div>
  );
};

export default TransferOrders;

const AssignLoadoutModal = ({ order, onClose, onAssigned }) => {
  const [loadouts, setLoadouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assigningId, setAssigningId] = useState(null);

  const fetchLoadouts = useCallback(
    async (term = '') => {
      if (!order?.blueprint_id) {
        setLoadouts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data } = await axios.get(
          `${API_BASE}/api/inventory/container_loadouts/search`,
          {
            params: {
              limit: 25,
              q: term || undefined,
              blueprintId: order.blueprint_id,
              locationId: order.from_location_id
            }
          }
        );
        setLoadouts(Array.isArray(data) ? data : []);
        setError('');
      } catch (err) {
        console.error('Failed to load loadouts', err);
        setLoadouts([]);
        setError('Unable to load loadouts. Try again.');
      } finally {
        setLoading(false);
      }
    },
    [order]
  );

  useEffect(() => {
    fetchLoadouts('');
    setSearchInput('');
  }, [fetchLoadouts]);

  useEffect(() => {
    if (!order?.blueprint_id) return;
    const debounce = setTimeout(() => {
      fetchLoadouts(searchInput);
    }, 250);
    return () => clearTimeout(debounce);
  }, [fetchLoadouts, searchInput, order]);

  const handleAssign = async (loadoutId) => {
    try {
      setError('');
      setSuccess('');
      setAssigningId(loadoutId);
      const parsedId = Number(loadoutId);
      if (!parsedId || Number.isNaN(parsedId)) {
        setError('Invalid loadout id');
        setAssigningId(null);
        return;
      }
      await axios.post(
        `${API_BASE}/api/inventory/transfer-orders/${order.transfer_order_id}/assign-loadout`,
        {
          loadout_id: parsedId,
          blueprint_id: order?.blueprint_id,
          from_location_id: order?.from_location_id
        }
      );
      setSuccess('Loadout assigned');
      // brief delay so user sees confirmation
      setTimeout(() => {
        if (onAssigned) onAssigned();
        if (onClose) onClose();
      }, 200);
    } catch (err) {
      console.error('Failed to assign loadout', err);
      const apiMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        (typeof err.response?.data === 'string' ? err.response.data : '') ||
        err.message ||
        'Failed to assign loadout';
      setError(typeof apiMessage === 'string' ? apiMessage : 'Failed to assign loadout');
      if (typeof apiMessage === 'string' && apiMessage) {
        alert(`Assign failed: ${apiMessage}`);
      }
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="assign-loadout-overlay">
      <div className="assign-loadout-modal">
        <div className="assign-loadout-header">
          <div>
            <p className="assign-loadout-label">Container Loadouts</p>
            <h3>{order?.loadout_serial_suffix ? 'Change loadout' : 'Assign loadout'}</h3>
            <p className="assign-loadout-hint">
              {order?.blueprint_name
                ? `Blueprint: ${order.blueprint_name}`
                : 'Select a loadout that matches this transfer order.'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!order?.blueprint_id ? (
          <div className="assign-loadout-empty">
            <p>This transfer order is not linked to a blueprint yet.</p>
            <p>Assign a blueprint inside the order details before selecting a loadout.</p>
          </div>
        ) : (
          <>
            <div className="assign-loadout-search">
              <Search size={16} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search loadout ID, container, or location…"
              />
            </div>

            {error && <div className="inline-alert error compact">{error}</div>}
            {success && <div className="inline-alert success compact">{success}</div>}

            {loading ? (
              <div className="assign-loadout-loading">
                <div className="spinner" />
                <p>Loading loadouts…</p>
              </div>
            ) : loadouts.length === 0 ? (
              <div className="assign-loadout-empty">
                <p>No loadouts found for this blueprint.</p>
                <p>Try a different search or build a new loadout.</p>
              </div>
            ) : (
              <div className="loadout-list">
                {loadouts.map((loadout) => (
                  <div className="loadout-option" key={loadout.loadout_id}>
                    <div className="loadout-info">
                      <div className="loadout-title">
                        {loadout.blueprint_name || 'Untitled Blueprint'}
                      </div>
                      <div className="loadout-meta">
                        <span>Container: {loadout.full_serial || loadout.serial_suffix || '—'}</span>
                        <span>Location: {loadout.location_name || '—'}</span>
                      </div>
                      {loadout.notes && <div className="loadout-notes">{loadout.notes}</div>}
                    </div>
                    <button
                      className="assign-loadout-btn primary-btn"
                      onClick={() => handleAssign(loadout.loadout_id)}
                      disabled={assigningId === loadout.loadout_id}
                    >
                      {assigningId === loadout.loadout_id ? 'Assigning…' : 'Assign'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
