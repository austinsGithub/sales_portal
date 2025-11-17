import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Package, 
  Calendar,
  MapPin,
  User,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Edit,
  Save,
  X
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const TransferOrderDetails = ({
  orderId,
  onClose,
  onUpdate,
  refreshToken = 0,
  onRequestLoadoutChange = () => {}
}) => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedLoadouts, setExpandedLoadouts] = useState({});
  const [expandedBlueprintItems, setExpandedBlueprintItems] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [lotOptions, setLotOptions] = useState({});
  const [lotSelections, setLotSelections] = useState({});
  const [lotsLoading, setLotsLoading] = useState({});
  const [autoAssigningId, setAutoAssigningId] = useState(null);
  const [manualAssigningId, setManualAssigningId] = useState(null);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId, refreshToken]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/inventory/transfer-orders/${orderId}`);
      setOrder(response.data);
      setLotOptions({});
      setLotSelections({});
      setLotsLoading({});
      setFormData({
        status: response.data.status,
        priority: response.data.priority,
        notes: response.data.notes || '',
        carrier: response.data.carrier || '',
        tracking_number: response.data.tracking_number || ''
      });
      if (response.data?.loadout_details?.loadout_id) {
        setExpandedLoadouts({
          [response.data.loadout_details.loadout_id]: true
        });
      } else {
        setExpandedLoadouts({});
      }
      setExpandedBlueprintItems({});
      setError(null);
    } catch (err) {
      setError('Failed to load transfer order details');
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order?.loadout_details?.blueprint_items) return;
    order.loadout_details.blueprint_items.forEach((bp) => {
      if (
        expandedBlueprintItems[bp.blueprint_item_id] &&
        lotOptions[bp.blueprint_item_id] &&
        lotOptions[bp.blueprint_item_id].length > 0 &&
        !lotSelections[bp.blueprint_item_id]
      ) {
        const lots = lotOptions[bp.blueprint_item_id];
        const remaining = getRemainingQuantity(bp) || 1;
        const firstLot = lots[0];
        const maxAssignable = Math.min(
          remaining,
          Number(firstLot.quantity_available) || remaining || 1
        );
        setLotSelections((prev) => ({
          ...prev,
          [bp.blueprint_item_id]: {
            inventory_id: firstLot.inventory_id,
            quantity: maxAssignable
          }
        }));
      }
    });
  }, [order, lotOptions, expandedBlueprintItems, lotSelections]);

  const toggleLoadout = (loadoutId) => {
    setExpandedLoadouts(prev => ({
      ...prev,
      [loadoutId]: !prev[loadoutId]
    }));
  };

  const toggleBlueprintItem = (item) => {
    const itemId = typeof item === 'object' ? item.blueprint_item_id : item;
    const currentlyExpanded = !!expandedBlueprintItems[itemId];
    setExpandedBlueprintItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
    if (!currentlyExpanded && typeof item === 'object') {
      fetchAvailableLots(item);
    }
  };

  const handleUpdate = async () => {
    try {
      await axios.put(`${API_BASE}/api/inventory/transfer-orders/${orderId}`, formData);
      await fetchOrderDetails();
      setEditMode(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Failed to update transfer order');
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await axios.put(`${API_BASE}/api/inventory/transfer-orders/${orderId}`, { status: newStatus });
      await fetchOrderDetails();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    }
  };

  const getRemainingQuantity = (bp) => {
    const required = Number(bp.required_quantity) || 0;
    const assigned = Number(bp.assigned_quantity) || 0;
    return Math.max(required - assigned, 0);
  };

  const fetchAvailableLots = async (blueprintItem) => {
    if (!order?.from_location_id || !blueprintItem?.part_id) return;
    setLotsLoading((prev) => ({
      ...prev,
      [blueprintItem.blueprint_item_id]: true
    }));
    try {
      const response = await axios.get(`${API_BASE}/api/inventory/items`, {
        params: {
          limit: 100,
          partId: blueprintItem.part_id,
          locationId: order.from_location_id
        }
      });
      const list = Array.isArray(response.data?.items)
        ? response.data.items
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];
      setLotOptions((prev) => ({
        ...prev,
        [blueprintItem.blueprint_item_id]: list
      }));
    } catch (err) {
      console.error('Failed to load available lots:', err);
    } finally {
      setLotsLoading((prev) => ({
        ...prev,
        [blueprintItem.blueprint_item_id]: false
      }));
    }
  };

  const handleAutoAssign = async (blueprintItem) => {
    if (!blueprintItem?.blueprint_item_id) return;
    setAutoAssigningId(blueprintItem.blueprint_item_id);
    try {
      await axios.post(
        `${API_BASE}/api/inventory/transfer-orders/${orderId}/blueprint-items/${blueprintItem.blueprint_item_id}/auto-assign`
      );
      await fetchOrderDetails();
      await fetchAvailableLots(blueprintItem);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error auto assigning lot:', err);
      alert(err.response?.data?.error || 'Failed to auto assign inventory.');
    } finally {
      setAutoAssigningId(null);
    }
  };

  const handleManualAssign = async (blueprintItem) => {
    const selection = lotSelections[blueprintItem.blueprint_item_id];
    if (!selection?.inventory_id) {
      alert('Select a lot before assigning.');
      return;
    }
    setManualAssigningId(blueprintItem.blueprint_item_id);
    try {
      await axios.post(`${API_BASE}/api/inventory/transfer-orders/${orderId}/assignments`, {
        blueprint_item_id: blueprintItem.blueprint_item_id,
        inventory_id: selection.inventory_id,
        quantity: Number(selection.quantity) || 0
      });
      await fetchOrderDetails();
      await fetchAvailableLots(blueprintItem);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error assigning lot:', err);
      alert(err.response?.data?.error || 'Failed to assign inventory.');
    } finally {
      setManualAssigningId(null);
    }
  };

  const updateLotSelection = (blueprintItemId, field, value) => {
    setLotSelections((prev) => ({
      ...prev,
      [blueprintItemId]: {
        ...(prev[blueprintItemId] || { inventory_id: '', quantity: 1 }),
        [field]: value
      }
    }));
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-blue-100 text-blue-800',
      'Shipped': 'bg-purple-100 text-purple-800',
      'Received': 'bg-green-100 text-green-800',
      'Completed': 'bg-gray-100 text-gray-800',
      'Cancelled': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    switch ((priority || '').toLowerCase()) {
      case 'high':
        return 'priority-chip high';
      case 'low':
        return 'priority-chip low';
      default:
        return 'priority-chip';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const handleLoadoutRequest = () => {
    if (typeof onRequestLoadoutChange === 'function') {
      onRequestLoadoutChange(order);
    }
  };

  const loadoutDetails = order.loadout_details || null;
  const manualItems = (order.items || []).filter((item) => !item.loadout_id);
  const creatorName =
    (order.created_by_first_name || order.created_by_last_name)
      ? `${order.created_by_first_name || ''} ${order.created_by_last_name || ''}`.trim()
      : 'N/A';
  const approverUser = order.approved_by_first_name
    ? { first_name: order.approved_by_first_name, last_name: order.approved_by_last_name }
    : null;
  const shipperUser = order.shipped_by_first_name
    ? { first_name: order.shipped_by_first_name, last_name: order.shipped_by_last_name }
    : null;
  const receiverUser = order.received_by_first_name
    ? { first_name: order.received_by_first_name, last_name: order.received_by_last_name }
    : null;

  const renderLoadoutContent = () => {
    if (!loadoutDetails) {
      return (
        <div className="loadout-empty">
          <div>
            <p>No loadout reserved yet</p>
            <span>Assign a container loadout to pull the correct blueprint items.</span>
          </div>
          <button className="primary-action secondary" onClick={handleLoadoutRequest}>
            Assign loadout
          </button>
        </div>
      );
    }

    const blueprintItems = loadoutDetails.blueprint_items || [];
    const totals = blueprintItems.reduce(
      (acc, bp) => {
        acc.required += Number(bp.required_quantity) || 0;
        acc.assigned += Number(bp.assigned_quantity) || 0;
        return acc;
      },
      { required: 0, assigned: 0 }
    );

    return (
      <div className="loadout-section">
        <div className="loadout-header clean">
          <div>
            <p>Loadout {loadoutDetails.serial_suffix || loadoutDetails.loadout_id}</p>
            <span>{loadoutDetails.blueprint_name || 'Blueprint'}</span>
          </div>
          <div className="loadout-summary-grid">
            <div>
              <p>Blueprint Items</p>
              <strong>{blueprintItems.length}</strong>
            </div>
            <div>
              <p>Assigned</p>
              <strong>{totals.assigned}/{totals.required}</strong>
            </div>
            <button className="ghost-action tiny" type="button" onClick={handleLoadoutRequest}>
              Change loadout
            </button>
          </div>
        </div>

        <div className="loadout-table">
          <div className="loadout-table-head">
            <span>Blueprint Item</span>
            <span>Demand</span>
            <span>Lots Assigned</span>
            <span></span>
          </div>
          {blueprintItems.map((bp) => {
            const lines = bp.lines || [];
            const assigned = Number(bp.assigned_quantity) || 0;
            const required = Number(bp.required_quantity) || 0;
            const remaining = Math.max(required - assigned, 0);
            const lotList = lotOptions[bp.blueprint_item_id] || [];
            const firstLotQty = Number(lotList[0]?.quantity_available);
            const safeInitialQty =
              lotList.length > 0
                ? Math.min(
                    remaining || 1,
                    Number.isFinite(firstLotQty) ? firstLotQty : remaining || 1
                  )
                : remaining || 1;
            const selection = lotSelections[bp.blueprint_item_id] || {
              inventory_id: lotList[0]?.inventory_id || '',
              quantity: safeInitialQty
            };
            const isOpen = !!expandedBlueprintItems[bp.blueprint_item_id];

            return (
              <div key={bp.blueprint_item_id} className={`loadout-table-row ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="row-main"
                  onClick={() => toggleBlueprintItem(bp.blueprint_item_id)}
                >
                  <div className="row-item">
                    <p>{bp.product_name || bp.part_product_name || 'Blueprint Item'}</p>
                    <span>{bp.part_sku || bp.part_gtin || 'No SKU'}</span>
                  </div>
                  <div className="row-demand">
                    <strong>{assigned}/{required}</strong>
                    <span>{remaining} remaining</span>
                  </div>
                  <div className="row-lots">
                    {lines.length > 0 ? (
                      lines.map((line) => (
                        <span key={line.transfer_order_item_id} className="lot-chip">
                          {line.lot_number || line.inventory_id}
                        </span>
                      ))
                    ) : (
                      <span className="lot-chip empty">Unassigned</span>
                    )}
                  </div>
                  <div className="row-arrow">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="row-detail">
                    <div className="row-actions">
                      <button
                        className="ghost-action tiny"
                        disabled={autoAssigningId === bp.blueprint_item_id || remaining <= 0}
                        onClick={() => handleAutoAssign(bp)}
                      >
                        {autoAssigningId === bp.blueprint_item_id ? 'Assigning…' : 'Auto-assign'}
                      </button>
                      <div className="row-form">
                        {lotsLoading[bp.blueprint_item_id] ? (
                          <span className="blueprint-lot-list-empty">Loading lots…</span>
                        ) : lotList.length === 0 ? (
                          <span className="blueprint-lot-list-empty">
                            No available inventory at the source location.
                          </span>
                        ) : (
                          <>
                            <label>
                              Lot
                              <select
                                value={selection.inventory_id || ''}
                                onChange={(e) => {
                                  const lotId = e.target.value ? Number(e.target.value) : '';
                                  const selected = lotList.find(
                                    (lot) => Number(lot.inventory_id) === Number(lotId)
                                  );
                                  const maxAssignable = Math.min(
                                    remaining || 1,
                                    Number(selected?.quantity_available) || 1
                                  );
                                  updateLotSelection(bp.blueprint_item_id, 'inventory_id', lotId);
                                  updateLotSelection(
                                    bp.blueprint_item_id,
                                    'quantity',
                                    Math.min(selection.quantity || 1, maxAssignable)
                                  );
                                }}
                              >
                                {lotList.map((lot) => (
                                  <option key={lot.inventory_id} value={lot.inventory_id}>
                                    {lot.lot_number || `Lot #${lot.lot_id || lot.inventory_id}`} •{' '}
                                    {lot.quantity_available} available
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Qty
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={selection.quantity || ''}
                                onChange={(e) => {
                                  const val = Math.max(Number(e.target.value) || 0, 0.01);
                                  const selected = lotList.find(
                                    (lot) => Number(lot.inventory_id) === Number(selection.inventory_id)
                                  );
                                  const maxAssignable = Math.min(
                                    remaining || 1,
                                    Number(selected?.quantity_available) || 1
                                  );
                                  updateLotSelection(
                                    bp.blueprint_item_id,
                                    'quantity',
                                    Math.min(val, maxAssignable)
                                  );
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleManualAssign(bp)}
                              disabled={
                                manualAssigningId === bp.blueprint_item_id ||
                                !selection.inventory_id ||
                                remaining <= 0
                              }
                            >
                              {manualAssigningId === bp.blueprint_item_id ? 'Assigning…' : 'Assign Lot'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="lot-location-hint">
                      Inventory sourced from {order.from_location_name || 'origin location'}
                    </p>
                    {lines.length > 0 && (
                      <div className="assigned-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Line</th>
                              <th>SKU</th>
                              <th>Description</th>
                              <th>Qty</th>
                              <th>Lot/Serial</th>
                              <th>Expiration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line) => (
                              <ItemRow
                                key={`loadout-item-${line.transfer_order_item_id}`}
                                item={line}
                                isLoadoutItem
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="transfer-order-details-card">
      <div className="details-hero">
        <div className="hero-title-row">
          <div className="hero-icon">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="hero-label">Transfer Order</p>
            <h2>{order.transfer_order_number}</h2>
          </div>
        </div>
        <div className="hero-actions">
          <span className={`details-status-pill status-${(order.status || 'pending').toLowerCase()}`}>
            {order.status}
          </span>
          {onClose && (
            <button className="details-close" onClick={onClose} aria-label="Close details">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="details-body">
        <section className="details-summary">
          <div className="summary-route">
            <div className="summary-location">
              <p className="summary-label-text">From</p>
              <strong>{order.from_location_name || 'N/A'}</strong>
              <span>{order.from_location_type || ''}</span>
              {(order.from_address_line1 || order.from_city) && (
                <small>
                  {[order.from_address_line1, order.from_city, order.from_state, order.from_zip]
                    .filter(Boolean)
                    .join(', ')}
                </small>
              )}
            </div>
            <div className="summary-arrow">
              <ChevronRight size={16} />
            </div>
            <div className="summary-location">
              <p className="summary-label-text">To</p>
              <strong>{order.to_location_name || 'N/A'}</strong>
              <span>{order.to_location_type || ''}</span>
              {(order.to_address_line1 || order.to_city) && (
                <small>
                  {[order.to_address_line1, order.to_city, order.to_state, order.to_zip]
                    .filter(Boolean)
                    .join(', ')}
                </small>
              )}
            </div>
          </div>
          <div className="summary-stats">
            <div>
              <p className="summary-label-text">Priority</p>
              <strong className={getPriorityColor(order.priority)}>{order.priority}</strong>
            </div>
            <div>
              <p className="summary-label-text">Created</p>
              <strong>{creatorName}</strong>
              <span>{formatDate(order.created_at)}</span>
            </div>
            <div>
              <p className="summary-label-text">Requested</p>
              <strong>{formatDate(order.requested_date)}</strong>
            </div>
            {(order.carrier || order.tracking_number) && (
              <div>
                <p className="summary-label-text">Shipping</p>
                <strong>{order.carrier || 'N/A'}</strong>
                <span>{order.tracking_number || 'No tracking'}</span>
              </div>
            )}
          </div>
        </section>

        {/* Status Timeline */}
        <div className="details-section">
          <div className="details-section-header">
            <div>
              <p className="section-label">Status Timeline</p>
              <h3>Movement progress</h3>
            </div>
          </div>
          <div className="details-timeline">
            <StatusTimelineItem 
              label="Requested" 
              date={order.requested_date} 
              active={order.requested_date !== null}
            />
            <StatusTimelineItem 
              label="Approved" 
              date={order.approved_date}
              user={approverUser}
              active={order.approved_date !== null}
            />
            <StatusTimelineItem 
              label="Shipped" 
              date={order.ship_date}
              user={shipperUser}
              active={order.ship_date !== null}
            />
            <StatusTimelineItem 
              label="Received" 
              date={order.received_date}
              user={receiverUser}
              active={order.received_date !== null}
            />
            <StatusTimelineItem 
              label="Completed" 
              date={order.completed_date}
              active={order.completed_date !== null}
            />
          </div>
        </div>

        {/* Transfer Reason */}
        {order.transfer_reason && (
          <div className="details-note-card">
            <div className="details-note-header">
              <AlertCircle size={16} />
              <span>Transfer Reason</span>
            </div>
            <p>{order.transfer_reason}</p>
          </div>
        )}

        {/* Items Section */}
        <div className="details-section">
          <div className="details-section-header">
            <div>
              <p className="section-label">Order Items</p>
              <h3>What’s moving</h3>
            </div>
            <span className="section-count">
              Total Items: {order.items?.length || 0}
            </span>
          </div>

          <div className="loadout-card">
            {renderLoadoutContent()}
          </div>

          {manualItems.length > 0 && (
            <div className="details-section-block">
              <p className="section-label">Additional Line Items</p>
              <div className="details-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Part Number</th>
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Lot/Serial</th>
                      <th>Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualItems.map((item) => (
                      <ItemRow key={`manual-${item.transfer_order_item_id}`} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.items?.length === 0 && (
            <div className="details-empty">
              No items in this transfer order
            </div>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h3 className="text-sm font-medium text-yellow-900 mb-2">Notes</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="details-actions">
          {order.status === 'Pending' && (
            <>
              <button
                onClick={() => handleStatusChange('Approved')}
                className="primary-action"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Approve Order</span>
              </button>
              <button
                onClick={() => handleStatusChange('Cancelled')}
                className="ghost-action"
              >
                Cancel Order
              </button>
            </>
          )}
          {order.status === 'Approved' && (
            <button
              onClick={() => handleStatusChange('Shipped')}
              className="primary-action secondary"
            >
              <Truck className="w-4 h-4" />
              <span>Mark as Shipped</span>
            </button>
          )}
          {order.status === 'Shipped' && (
            <button
              onClick={() => handleStatusChange('Received')}
              className="primary-action"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Mark as Received</span>
            </button>
          )}
          {order.status === 'Received' && (
            <button
              onClick={() => handleStatusChange('Completed')}
              className="primary-action secondary"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Complete Order</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const StatusTimelineItem = ({ label, date, user, active }) => (
  <div className={`timeline-item ${active ? 'active' : ''}`}>
    <div className="timeline-icon">
      {active ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
    </div>
    <span className="timeline-label">{label}</span>
    {date && (
      <span className="timeline-date">
        {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
    )}
    {user && (
      <span className="timeline-user">
        {user.first_name} {user.last_name}
      </span>
    )}
  </div>
);

const ItemRow = ({ item, isLoadoutItem = false }) => {
  const sku =
    item.sku ||
    item.part_sku ||
    item.part?.sku ||
    item.inventory?.part?.sku ||
    'N/A';

  const productName =
    item.product_name ||
    item.part_product_name ||
    item.part?.product_name ||
    'N/A';

  const lotNumber =
    item.lot_number ||
    item.lot?.lot_number ||
    item.inventory?.lot?.lot_number ||
    null;

  const serialNumber =
    item.serial_number ||
    item.inventory_serial_number ||
    item.inventory?.serial_number ||
    null;

  const expiration =
    item.expiration_date ||
    item.lot?.expiration_date ||
    item.inventory?.lot?.expiration_date ||
    null;

  return (
    <tr className={`details-row ${isLoadoutItem ? 'loadout-row' : ''}`}>
      <td className={`details-cell ${isLoadoutItem ? 'indented' : ''}`}>
        <div className="row-item-id">
          {isLoadoutItem && <span className="loadout-marker" />}
          <Package className="row-item-icon" />
          <span>#{item.transfer_order_item_id}</span>
        </div>
      </td>
      <td className="details-cell">
        <span className="row-item-sku">{sku}</span>
      </td>
      <td className="details-cell">
        <span className="row-item-name">{productName}</span>
      </td>
      <td className="details-cell quantity">
        <span className="quantity-pill">
          {item.quantity} {item.unit_of_measure || 'EA'}
        </span>
      </td>
      <td className="details-cell">
        <div className="row-item-meta">
          {lotNumber && <div>Lot: {lotNumber}</div>}
          {serialNumber && <div>S/N: {serialNumber}</div>}
          {!lotNumber && !serialNumber && <span className="muted">N/A</span>}
        </div>
      </td>
      <td className="details-cell">
        <span className="row-item-date">
          {expiration
            ? new Date(expiration).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : 'N/A'}
        </span>
      </td>
    </tr>
  );
};

export default TransferOrderDetails;
