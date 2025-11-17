import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  PlusCircle,
  RefreshCw,
  MapPin,
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

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_BASE}/api/inventory/transfer-orders`, {
        params: statusFilter ? { status: statusFilter } : undefined
      });
      setOrders(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      console.error('Failed to load transfer orders', err);
      setOrders([]);
      setError('Unable to load transfer orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
            <p>Loading transfer orders…</p>
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

export default TransferOrders;

const AssignLoadoutModal = ({ order, onClose, onAssigned }) => {
  const [loadouts, setLoadouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
          `${API_BASE}/api/inventory/container-loadouts/search`,
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
      setAssigningId(loadoutId);
      await axios.post(
        `${API_BASE}/api/inventory/transfer-orders/${order.transfer_order_id}/assign-loadout`,
        { loadout_id: loadoutId }
      );
      if (onAssigned) onAssigned();
    } catch (err) {
      console.error('Failed to assign loadout', err);
      alert(err.response?.data?.error || 'Failed to assign loadout');
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
