import React, { useState, useEffect, useRef } from 'react';
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
  X,
  Scan
} from 'lucide-react';
import axios from 'axios';
import TransferOrderScanner from './TransferOrderScanner';

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
  const [loadoutLotsByProduct, setLoadoutLotsByProduct] = useState({});
  const [lotSelections, setLotSelections] = useState({});
  const [lotsLoading, setLotsLoading] = useState({});
  const [manualAssigningId, setManualAssigningId] = useState(null);
  const [manualPage, setManualPage] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const autoAssignAttempted = useRef({});
  const loadoutLotsLoadedFor = useRef(null);

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
      setLoadoutLotsByProduct({});
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

  useEffect(() => {
    const loadoutId = order?.loadout_details?.loadout_id;
    if (!loadoutId || loadoutLotsLoadedFor.current === loadoutId) return;

    const loadLots = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/inventory/container_loadouts/${loadoutId}/lots`);
        const lots = Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data)
          ? res.data
          : [];

        const byProduct = lots.reduce((acc, lot) => {
          const productId = Number(lot.product_id || lot.part_id);
          if (!productId) return acc;
          acc[productId] = acc[productId] || [];
          acc[productId].push(lot);
          return acc;
        }, {});

        setLoadoutLotsByProduct(byProduct);
        loadoutLotsLoadedFor.current = loadoutId;
      } catch (e) {
        console.error('Failed to load loadout lots', e);
      }
    };

    loadLots();
  }, [order?.loadout_details?.loadout_id]);

  useEffect(() => {
    setManualPage(0);
  }, [orderId, order?.items?.length]);

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

  useEffect(() => {
    autoAssignFromLoadout();
  }, [order?.loadout_details?.loadout_id, order?.from_location_id]);

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
    const partId = blueprintItem?.part_id || blueprintItem?.product_id;
    if (!order?.from_location_id || !partId) return [];
    setLotsLoading((prev) => ({
      ...prev,
      [blueprintItem.blueprint_item_id]: true
    }));
    try {
      const response = await axios.get(`${API_BASE}/api/inventory/items`, {
        params: {
          limit: 100,
          partId,
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
      const mergedLots = list.length
        ? list
        : loadoutLotsByProduct[Number(partId)] || [];

      const normalized = mergedLots.map((lot) => ({
        // treat lot_id as inventory handle if real inventory_id is missing
        inventory_id: lot.inventory_id || lot.lot_id || null,
        lot_id: lot.lot_id || lot.inventory_id || null,
        lot_number: lot.lot_number,
        quantity_available: lot.quantity_available ?? lot.quantity_used ?? lot.quantity ?? 0,
        location_id: lot.location_id,
        aisle: lot.aisle,
        rack: lot.rack,
        shelf: lot.shelf,
        bin: lot.bin,
        zone: lot.zone,
        // allow selection even if location metadata is missing/mismatched
        sourceAvailable: true,
        original: lot
      }));

      setLotOptions((prev) => ({
        ...prev,
        [blueprintItem.blueprint_item_id]: normalized
      }));
      return normalized;
    } catch (err) {
      console.error('Failed to load available lots:', err);
      return [];
    } finally {
      setLotsLoading((prev) => ({
        ...prev,
        [blueprintItem.blueprint_item_id]: false
      }));
    }
  };

  const findMatchingInventory = (lotDef, availableLots = []) => {
    const targetLotId = Number(lotDef?.lot_id || lotDef?.inventory_id || lotDef?.inventoryId || 0);
    const targetLotNumber = lotDef?.lot_number || lotDef?.lotNumber;

    return availableLots.find((lot) => {
      const lotId = Number(lot.lot_id || lot.inventory_id);
      if (targetLotId && lotId && targetLotId === lotId) return true;
      if (targetLotNumber && lot.lot_number && targetLotNumber === lot.lot_number) return true;
      return false;
    });
  };

  const autoAssignFromLoadout = async () => {
    const loadoutId = order?.loadout_details?.loadout_id;
    const blueprintItems = order?.loadout_details?.blueprint_items || [];
    if (!loadoutId || blueprintItems.length === 0) return;

    // Avoid re-running for the same loadout and skip if anything is already assigned
    if (autoAssignAttempted.current[loadoutId]) return;
    const hasExistingLines = blueprintItems.some((bp) => (bp.lines || []).length > 0);
    const hasRemaining = blueprintItems.some((bp) => getRemainingQuantity(bp) > 0);
    if (hasExistingLines || !hasRemaining) return;
    
    try {
      const lotsRes = await axios.get(`${API_BASE}/api/inventory/container_loadouts/${loadoutId}/lots`);
      const loadoutLots = Array.isArray(lotsRes.data?.data)
        ? lotsRes.data.data
        : Array.isArray(lotsRes.data)
        ? lotsRes.data
        : [];

      if (!loadoutLots.length) return;

      const lotsByProduct = loadoutLots.reduce((acc, lot) => {
        const productId = Number(lot.product_id || lot.part_id);
        if (!productId) return acc;
        acc[productId] = acc[productId] || [];
        acc[productId].push(lot);
        return acc;
      }, {});

      let assignedSomething = false;

      for (const bp of blueprintItems) {
        let remaining = getRemainingQuantity(bp);
        if (remaining <= 0) continue;

        const productId = Number(bp.part_id || bp.product_id);
        const candidateLots = lotsByProduct[productId] || [];
        if (!productId || candidateLots.length === 0) continue;

        let availableLots = lotOptions[bp.blueprint_item_id];
        if (!availableLots || availableLots.length === 0) {
          availableLots = await fetchAvailableLots(bp);
        }
        // If still no inventory lots, skip this item but allow other items to try
        if (!availableLots || availableLots.length === 0) {
          // Try using loadout lots directly if present
          const productLots = loadoutLotsByProduct[productId];
          if (productLots && productLots.length > 0) {
            availableLots = productLots.map((lot) => ({
              inventory_id: lot.inventory_id || lot.lot_id || null,
              lot_id: lot.lot_id || lot.inventory_id || null,
              lot_number: lot.lot_number,
              quantity_available: lot.quantity_available ?? lot.quantity_used ?? lot.quantity ?? 0,
              location_id: lot.location_id,
              sourceAvailable: true,
              original: lot
            }));
          } else {
            continue;
          }
        }

        let itemAssigned = false;

        // Try matching loadout lots first (accept lot_id if inventory_id missing)
        for (const lotDef of candidateLots) {
          if (remaining <= 0) break;
          const match = findMatchingInventory(lotDef, availableLots);
          if (!match || !(match.inventory_id || match.lot_id)) continue;

          const desiredQty = Math.min(
            remaining,
            Number(lotDef.quantity_used || lotDef.quantity || lotDef.required_quantity) || remaining,
            Number(match.quantity_available) || remaining
          );

          if (!desiredQty || desiredQty <= 0) continue;

          await axios.post(`${API_BASE}/api/inventory/transfer-orders/${orderId}/assignments`, {
            blueprint_item_id: bp.blueprint_item_id,
            inventory_id: match.inventory_id || match.lot_id,
            quantity: desiredQty
          });

          remaining -= desiredQty;
          itemAssigned = true;
          assignedSomething = true;
        }

        // If no matches from the loadout lots but inventory exists, fall back to first available lot
        if (remaining > 0 && !itemAssigned) {
          const fallback = availableLots[0];
          if (fallback) {
            const desiredQty = Math.min(
              remaining,
              Number(fallback.quantity_available || fallback.quantity_used) || remaining
            );
            await axios.post(`${API_BASE}/api/inventory/transfer-orders/${orderId}/assignments`, {
              blueprint_item_id: bp.blueprint_item_id,
              inventory_id: fallback.inventory_id || fallback.lot_id,
              quantity: desiredQty
            });
            itemAssigned = true;
            assignedSomething = true;
          }
        }
      }

      if (assignedSomething) {
        await fetchOrderDetails();
      }
    } catch (err) {
      console.error('Auto-assign from loadout failed:', err);
    } finally {
      autoAssignAttempted.current[loadoutId] = true;
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

  const handleLoadoutRequest = () => {
    if (typeof onRequestLoadoutChange === 'function') {
      onRequestLoadoutChange(order);
    }
  };

  if (!order) {
    return null;
  }

  const loadoutDetails = order.loadout_details || null;
  const manualItems = (order.items || []).filter((item) => !item.loadout_id);
  const MANUAL_PAGE_SIZE = 5;
  const manualTotalPages = Math.max(1, Math.ceil((manualItems.length || 0) / MANUAL_PAGE_SIZE));
  const manualSliceStart = manualPage * MANUAL_PAGE_SIZE;
  const manualItemsPage = manualItems.slice(manualSliceStart, manualSliceStart + MANUAL_PAGE_SIZE);
  const creatorName =
    (order.created_by_first_name || order.created_by_last_name)
      ? `${order.created_by_first_name || ''} ${order.created_by_last_name || ''}`.trim()
      : 'N/A';
  const approverUser = order.approved_by_first_name
    ? { first_name: order.approved_by_first_name, last_name: order.approved_by_last_name }
    : null;
  const pickerUser = order.picked_by_first_name
    ? { first_name: order.picked_by_first_name, last_name: order.picked_by_last_name }
    : null;
  const packerUser = order.packed_by_first_name
    ? { first_name: order.packed_by_first_name, last_name: order.packed_by_last_name }
    : null;
  const shipperUser = order.shipped_by_first_name
    ? { first_name: order.shipped_by_first_name, last_name: order.shipped_by_last_name }
    : null;
  const receiverUser = order.received_by_first_name
    ? { first_name: order.received_by_first_name, last_name: order.received_by_last_name }
    : null;

  const renderLoadoutContent = () => {
    const isExpiredDate = (dateString) => {
      if (!dateString) return false;
      const dt = new Date(dateString);
      if (Number.isNaN(dt.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dt.setHours(0, 0, 0, 0);
      return dt < today;
    };

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
            const lotList =
              lotOptions[bp.blueprint_item_id] ||
              loadoutLotsByProduct[Number(bp.part_id || bp.product_id)] ||
              [];
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
            const hasExpiredLine = lines.some((line) => isExpiredDate(line.expiration_date));

            return (
              <div key={bp.blueprint_item_id} className={`loadout-table-row ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="row-main"
                  onClick={() => toggleBlueprintItem(bp.blueprint_item_id)}
                >
                  <div className="row-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <p>{bp.product_name || bp.part_product_name || 'Blueprint Item'}</p>
                      <span>{bp.part_sku || bp.part_gtin || 'No SKU'}</span>
                    </div>
                    {hasExpiredLine && (
                      <span className="expired-indicator">
                        <span className="expired-dot" aria-hidden="true" />
                        Expired
                      </span>
                    )}
                    {order.picked_date && lines.length > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        background: '#d1fae5',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#065f46'
                      }}>
                        <CheckCircle size={14} />
                        <span>Picked</span>
                      </div>
                    )}
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
                          {isExpiredDate(line.expiration_date) && (
                            <span className="expired-dot-label">
                              <span className="expired-dot" aria-hidden="true" />
                              Expired
                            </span>
                          )}
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
                        onClick={handleLoadoutRequest}
                      >
                        Search loadouts
                      </button>
                      <div className="row-form">
                        {lotsLoading[bp.blueprint_item_id] ? (
                          <span className="blueprint-lot-list-empty">Loading lots...</span>
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
                                    (lot) =>
                                      Number(lot.inventory_id || lot.lot_id) === Number(lotId)
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
                                {lotList.map((lot) => {
                                  const binLocation = [lot.aisle, lot.rack, lot.shelf, lot.bin]
                                    .filter(Boolean)
                                    .join('-') || lot.zone || 'No bin';
                                  return (
                                    <option
                                      key={lot.inventory_id || lot.lot_id}
                                      value={lot.inventory_id || lot.lot_id}
                                      disabled={!lot.inventory_id || !lot.sourceAvailable}
                                    >
                                      {lot.lot_number || `Lot #${lot.lot_id || lot.inventory_id}`} | {binLocation} | {lot.quantity_available ?? lot.quantity_used ?? '?'} available {(!lot.inventory_id || !lot.sourceAvailable) ? '(not at source)' : ''}
                                    </option>
                                  );
                                })}
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
                                    (lot) =>
                                      Number(lot.inventory_id || lot.lot_id) ===
                                      Number(selection.inventory_id)
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
                                disabled={!selection.inventory_id}
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
                              {manualAssigningId === bp.blueprint_item_id ? 'Assigning...' : 'Assign Lot'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
            {selection.inventory_id && lotList.length > 0 && (() => {
                      const selectedLot = lotList.find(l => Number(l.inventory_id || l.lot_id) === Number(selection.inventory_id));
                      const binLocation = selectedLot
                        ? [selectedLot.aisle, selectedLot.rack, selectedLot.shelf, selectedLot.bin]
                            .filter(Boolean)
                            .join('-') || selectedLot.zone || 'No bin assigned'
                        : '';
                      return binLocation ? (
                        <p className="lot-location-hint" style={{ fontWeight: 600, color: '#2563eb' }}>
                          Bin Location: {binLocation} at {order.from_location_name || 'origin location'}
                        </p>
                      ) : null;
                    })()}
                    {!selection.inventory_id && (
                      <p className="lot-location-hint">
                        Inventory sourced from {order.from_location_name || 'origin location'}
                      </p>
                    )}
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
                                showPickStatus={order.picked_date !== null}
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
        <section style={{
          padding: '2rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          background: '#fafafa',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '2rem',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            marginBottom: showAddresses ? '1.5rem' : '0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</span>
                <strong style={{ fontSize: '1rem', color: '#111827' }}>{order.from_location_name}</strong>
              </div>
              <ChevronRight size={20} style={{ color: '#9ca3af', marginTop: '0.5rem' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                <strong style={{ fontSize: '1rem', color: '#111827' }}>{order.to_location_name}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Priority</span>
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: order.priority === 'High' ? '#dc2626' : order.priority === 'Low' ? '#16a34a' : '#6b7280'
                }}>
                  {order.priority}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Requested</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}>
                  {new Date(order.requested_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Toggle to show addresses */}
          <button
            onClick={() => setShowAddresses(!showAddresses)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              color: '#6b7280',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginTop: '1rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            <MapPin size={14} />
            {showAddresses ? 'Hide' : 'Show'} Full Addresses
            {showAddresses ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Expandable address details */}
          {showAddresses && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem',
              marginTop: '1.5rem',
              padding: '1.5rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={16} style={{ color: '#3b82f6' }} />
                  From Location
                </h4>
                <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: '1.6' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, fontSize: '0.9375rem' }}>{order.from_location_name}</p>
                  {order.from_address ? (
                    <>
                      <p style={{ margin: '0 0 0.25rem 0' }}>{order.from_address}</p>
                      {(order.from_city || order.from_state || order.from_postal_code) && (
                        <p style={{ margin: '0 0 0.25rem 0' }}>
                          {[order.from_city, order.from_state, order.from_postal_code].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {order.from_country && <p style={{ margin: 0 }}>{order.from_country}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0, color: '#9ca3af', fontStyle: 'italic', fontSize: '0.8125rem' }}>
                      No address on file
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={16} style={{ color: '#10b981' }} />
                  To Location
                </h4>
                <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: '1.6' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, fontSize: '0.9375rem' }}>{order.to_location_name}</p>
                  {order.to_address ? (
                    <>
                      <p style={{ margin: '0 0 0.25rem 0' }}>{order.to_address}</p>
                      {(order.to_city || order.to_state || order.to_postal_code) && (
                        <p style={{ margin: '0 0 0.25rem 0' }}>
                          {[order.to_city, order.to_state, order.to_postal_code].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {order.to_country && <p style={{ margin: 0 }}>{order.to_country}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0, color: '#9ca3af', fontStyle: 'italic', fontSize: '0.8125rem' }}>
                      No address on file
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
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
              label="Picked"
              date={order.picked_date}
              user={pickerUser}
              active={order.picked_date !== null}
            />
            <StatusTimelineItem
              label="Packed"
              date={order.packed_date}
              user={packerUser}
              active={order.packed_date !== null}
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

        {/* Picking Summary */}
        {order.picked_date && (
          <div className="details-section">
            <div className="details-section-header">
              <div>
                <p className="section-label">Picking Summary</p>
                <h3>Items picked from {order.from_location_name}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#059669', margin: 0 }}>
                    Picked by {pickerUser ? `${pickerUser.first_name} ${pickerUser.last_name}` : 'N/A'}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {formatDate(order.picked_date)}
                  </span>
                </div>
              </div>
            </div>
            <div style={{
              background: '#f0fdf4',
              border: '2px solid #86efac',
              borderRadius: '12px',
              padding: '1.5rem',
              marginTop: '1rem'
            }}>
              <div style={{
                display: 'grid',
                gap: '1rem'
              }}>
                {/* Loadout Items */}
                {loadoutDetails?.blueprint_items?.map((bp) => {
                  const lines = bp.lines || [];
                  return lines.map((line) => {
                    const binLocation = [line.aisle, line.rack, line.shelf, line.bin]
                      .filter(Boolean)
                      .join('-') || line.zone || 'Bin not assigned';
                    return (
                      <div
                        key={`picked-${line.transfer_order_item_id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '1rem',
                          background: 'white',
                          border: '1px solid #d1fae5',
                          borderRadius: '8px'
                        }}
                      >
                        <CheckCircle className="w-5 h-5" style={{ color: '#10b981', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>
                            {bp.product_name || bp.part_product_name}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                            {bp.part_sku || bp.part_gtin} | Lot: {line.lot_number || 'N/A'} | Qty: {line.quantity}
                          </p>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
                          border: '1px solid #3b82f6',
                          borderRadius: '6px'
                        }}>
                          <MapPin className="w-4 h-4" style={{ color: '#3b82f6', flexShrink: 0 }} />
                          <span style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: '#1e40af',
                            fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace"
                          }}>
                            {binLocation}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })}

                {/* Manual Items */}
                {manualItems.map((item) => {
                  const binLocation = [item.aisle, item.rack, item.shelf, item.bin]
                    .filter(Boolean)
                    .join('-') || item.zone || 'Bin not assigned';
                  return (
                    <div
                      key={`picked-manual-${item.transfer_order_item_id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        background: 'white',
                        border: '1px solid #d1fae5',
                        borderRadius: '8px'
                      }}
                    >
                      <CheckCircle className="w-5 h-5" style={{ color: '#10b981', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>
                          {item.product_name || item.part_product_name}
                        </p>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                          {item.sku || item.part_sku || item.part_gtin} | Lot: {item.lot_number || 'N/A'} | Qty: {item.quantity}
                        </p>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px'
                      }}>
                        <MapPin className="w-4 h-4" style={{ color: '#3b82f6', flexShrink: 0 }} />
                        <span style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: '#1e40af',
                          fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace"
                        }}>
                          {binLocation}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* If no items */}
                {(!loadoutDetails?.blueprint_items || loadoutDetails.blueprint_items.every(bp => !bp.lines || bp.lines.length === 0)) &&
                 manualItems.length === 0 && (
                  <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '0.875rem'
                  }}>
                    No items were assigned to this order
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
              <h3>What&apos;s moving</h3>
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
                    {manualItemsPage.map((item) => (
                      <ItemRow
                        key={`manual-${item.transfer_order_item_id}`}
                        item={item}
                        showPickStatus={order.picked_date !== null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {manualTotalPages > 1 && (
                <div className="details-pagination">
                  <button
                    type="button"
                    onClick={() => setManualPage((p) => Math.max(0, p - 1))}
                    disabled={manualPage === 0}
                  >
                    Prev
                  </button>
                  <span>
                    Page {manualPage + 1} of {manualTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualPage((p) => Math.min(manualTotalPages - 1, p + 1))}
                    disabled={manualPage >= manualTotalPages - 1}
                  >
                    Next
                  </button>
                </div>
              )}
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
            <>
              <button
                onClick={() => setScannerOpen(true)}
                className="primary-action"
              >
                <Scan className="w-4 h-4" />
                <span>
                  {(() => {
                    const saved = localStorage.getItem(`picked_items_${order.transfer_order_id}`);
                    if (saved) {
                      const pickedItems = JSON.parse(saved);
                      const pickedCount = Object.keys(pickedItems).length;
                      const totalItems = (order?.loadout_details?.blueprint_items?.length || 0) +
                                        (order?.items?.filter(item => !item.loadout_id)?.length || 0);
                      return pickedCount > 0 ? `Resume Picking (${pickedCount}/${totalItems})` : 'Start Picking';
                    }
                    return 'Start Picking';
                  })()}
                </span>
              </button>
              <button
                onClick={() => handleStatusChange('Picked')}
                className="secondary-action"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Mark as Picked (Skip Scanner)</span>
              </button>
            </>
          )}
          {order.status === 'Picked' && (
            <>
              <button
                onClick={() => setScannerOpen(true)}
                className="primary-action"
              >
                <Package className="w-4 h-4" />
                <span>Start Packing</span>
              </button>
              <button
                onClick={() => handleStatusChange('Packed')}
                className="secondary-action"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Mark as Packed (Skip Scanner)</span>
              </button>
            </>
          )}
          {order.status === 'Packed' && (
            <>
              <button
                onClick={() => setScannerOpen(true)}
                className="primary-action"
              >
                <Truck className="w-4 h-4" />
                <span>Enter Shipping Info</span>
              </button>
              <button
                onClick={() => handleStatusChange('Shipped')}
                className="secondary-action"
              >
                <Truck className="w-4 h-4" />
                <span>Mark as Shipped (Skip Scanner)</span>
              </button>
            </>
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

      {scannerOpen && (
        <TransferOrderScanner
          order={order}
          onClose={() => setScannerOpen(false)}
          onUpdate={() => {
            fetchOrderDetails();
            onUpdate();
          }}
        />
      )}
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

const ItemRow = ({ item, isLoadoutItem = false, showPickStatus = false }) => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="row-item-name">{productName}</span>
          {showPickStatus && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: '#d1fae5',
              borderRadius: '4px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: '#065f46'
            }}>
              <CheckCircle size={12} />
              <span>Picked</span>
            </div>
          )}
        </div>
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
