import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  PlusCircle,
  RefreshCw,
  Package,
  Search,
  Layers,
  ChevronRight
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

const PAGE_SIZE = 25;

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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * PAGE_SIZE;
      const { data } = await axios.get(`${API_BASE}/api/inventory/transfer-orders`, {
        params: {
          ...(statusFilter ? { status: statusFilter } : {}),
          limit: PAGE_SIZE,
          offset
        }
      });

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
  }, [statusFilter, currentPage]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [
        order.transfer_order_number,
        order.from_location_name,
        order.to_location_name,
        order.blueprint_name,
        order.loadout_serial_suffix,
        order.priority,
        order.status
      ].some((value) => (value || '').toString().toLowerCase().includes(term))
    );
  }, [orders, searchTerm]);

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

  const handleSelectOrder = (orderId) => {
    setSelectedOrderId(orderId);
  };

  const totalPages = Math.ceil(totalOrders / PAGE_SIZE);
  const isSearching = searchTerm.trim().length > 0;
  const pageStart = totalOrders ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, totalOrders);

  return (
    <div className="to-page">
      {/* Page Header */}
      <div className="to-page-header">
        <div>
          <h1>Transfer Orders</h1>
          <p className="to-subtitle">Move inventory between locations</p>
        </div>
        <div className="to-header-actions">
          <button className="to-btn to-btn-ghost" onClick={fetchOrders} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="to-btn to-btn-primary" onClick={() => setShowCreateModal(true)}>
            <PlusCircle size={18} /> New Order
          </button>
        </div>
      </div>

      {/* Main Content - List & Pane */}
      <div className="to-content">
        {/* Left Panel - Orders List */}
        <div className="to-list-panel">
          <div className="to-panel-header">
            <h2>Orders</h2>
            <span className="to-panel-count">{filteredOrders.length} results</span>
          </div>

          {/* Search */}
          <div className="to-search-area">
            <div className="to-search-box">
              <Search size={16} />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search order #, location..."
              />
              {searchTerm && (
                <button className="to-search-clear" onClick={() => setSearchTerm('')}>
                  &times;
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              className="to-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.id || 'all'} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Orders List */}
          <div className="to-list">
            {loading ? (
              <div className="to-list-empty">
                <div className="to-spinner" />
                <p>Loading...</p>
              </div>
            ) : error ? (
              <div className="to-list-empty">
                <p style={{ color: '#b91c1c' }}>{error}</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="to-list-empty">
                <Layers size={40} style={{ opacity: 0.4 }} />
                {isSearching ? (
                  <p>No matches found</p>
                ) : (
                  <p>No transfer orders</p>
                )}
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = selectedOrderId === order.transfer_order_id;
                return (
                  <div
                    key={order.transfer_order_id}
                    className={`to-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOrder(order.transfer_order_id)}
                  >
                    <div className="to-list-item-top">
                      <span className="to-list-item-number">
                        {order.transfer_order_number}
                      </span>
                      <span className={statusClasses[order.status] || 'status-pill'}>
                        {order.status}
                      </span>
                    </div>
                    <div className="to-list-item-route">
                      <span>{order.from_location_name || '—'}</span>
                      <ChevronRight size={12} />
                      <span>{order.to_location_name || '—'}</span>
                    </div>
                    <div className="to-list-item-meta">
                      {order.blueprint_name && (
                        <span className="to-meta-chip">{order.blueprint_name}</span>
                      )}
                      {order.loadout_serial_suffix && (
                        <span className="to-meta-chip to-meta-chip-loadout">
                          <Package size={12} />
                          {order.loadout_serial_suffix}
                        </span>
                      )}
                      <span className="to-list-item-date">
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!isSearching && totalPages > 0 && (
            <div className="to-pagination">
              <div className="to-pagination-info">
                {totalOrders > 0
                  ? `${pageStart}-${pageEnd} of ${totalOrders}`
                  : '0 results'}
              </div>
              <div className="to-pagination-controls">
                <button
                  className="to-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  Prev
                </button>
                <span className="to-pagination-page">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  className="to-pagination-btn"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage >= totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Detail Pane */}
        <div className="to-detail-panel">
          {!selectedOrderId ? (
            <div className="to-detail-empty">
              <Package size={56} style={{ color: '#9ca3af', opacity: 0.5 }} />
              <h3>Select a Transfer Order</h3>
              <p>Choose an order from the list to view details and manage the workflow</p>
            </div>
          ) : (
            <TransferOrderDetails
              orderId={selectedOrderId}
              refreshToken={detailRefreshToken}
              onUpdate={handleDetailUpdated}
              onClose={() => setSelectedOrderId(null)}
              onRequestLoadoutChange={(detailOrder) => {
                const row = orders.find(
                  (o) => o.transfer_order_id === detailOrder.transfer_order_id
                );
                const base = row || {};
                setAssigningOrder({ ...base, ...detailOrder });
              }}
            />
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTransferOrder
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleOrderCreated}
        />
      )}

      {/* Assign Loadout Modal */}
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
            &times;
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
                placeholder="Search loadout ID, container, or location..."
              />
            </div>

            {error && <div className="inline-alert error compact">{error}</div>}
            {success && <div className="inline-alert success compact">{success}</div>}

            {loading ? (
              <div className="assign-loadout-loading">
                <div className="spinner" />
                <p>Loading loadouts...</p>
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
                      {assigningId === loadout.loadout_id ? 'Assigning...' : 'Assign'}
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
