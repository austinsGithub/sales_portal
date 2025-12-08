import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Box,
  Calendar,
  ClipboardList,
  Info,
  MapPin,
  Package,
  Plus,
  Search,
  X
} from 'lucide-react';
import axios from 'axios';
import './CreateTransferOrder.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const normalizeInventoryRecord = (record = {}) => {
  const part = record.part || {
    product_name: record.product_name || record.part_name || 'Unnamed part',
    sku: record.sku || record.part_sku || record.public_sku || '',
    unit_of_measure: record.unit_of_measure || record.uom || 'EA'
  };

  const lot = record.lot || {
    lot_number: record.lot_number,
    expiration_date: record.expiration_date
  };

  return { ...record, part, lot };
};

const stepConfig = [
  {
    id: 'details',
    title: 'Route',
    description: 'Choose origin and destination plus timing.'
  },
  {
    id: 'blueprint',
    title: 'Blueprint',
    description: 'Optional container template.'
  },
  {
    id: 'items',
    title: 'Items',
    description: 'Pick inventory to move.'
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Confirm and submit.'
  }
];

const CreateTransferOrder = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    from_location_id: '',
    to_location_id: '',
    destination_type: 'general_delivery',
    destination_loadout_id: '',
    blueprint_id: '',
    priority: 'Medium',
    requested_date: '',
    transfer_reason: '',
    notes: ''
  });
  const [locations, setLocations] = useState([]);
  const [blueprints, setBlueprints] = useState([]);
  const [blueprintDetails, setBlueprintDetails] = useState([]);
  const [destinationLoadouts, setDestinationLoadouts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showDestinationTypeInfo, setShowDestinationTypeInfo] = useState(false);

  const getAuthHeaders = () => {
    const stored =
      localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    return stored
      ? {
          Authorization: `Bearer ${stored}`
        }
      : {};
  };

  useEffect(() => {
    fetchLocations();
    fetchBlueprints();
  }, []);

  useEffect(() => {
    if (formData.from_location_id) {
      setInventoryItems([]);
      setSelectedItems([]);
      setSearchTerm('');
      fetchInventory();
    }
  }, [formData.from_location_id]);

  useEffect(() => {
    if (formData.to_location_id) {
      fetchDestinationLoadouts(formData.to_location_id);
    } else {
      setDestinationLoadouts([]);
    }
  }, [formData.to_location_id]);

  useEffect(() => {
    if (formData.blueprint_id) {
      fetchBlueprintDetails(formData.blueprint_id);
    } else {
      setBlueprintDetails(null);
    }
  }, [formData.blueprint_id]);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/inventory/locations`, {
        params: { limit: 250 },
        headers: getAuthHeaders()
      });
      const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
      setLocations(rows);
    } catch (err) {
      console.error('Failed to load locations', err);
    }
  };

  const fetchBlueprints = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/inventory/container_blueprints/search`, {
        params: { limit: 100 },
        headers: getAuthHeaders()
      });
      const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
      setBlueprints(rows);
    } catch (err) {
      console.error('Failed to load blueprints', err);
    }
  };

  const fetchInventory = async () => {
    if (!formData.from_location_id) return;
    try {
      const res = await axios.get(`${API_BASE}/api/inventory/items/by-location/${formData.from_location_id}`, {
        params: { limit: 400 },
        headers: getAuthHeaders()
      });
      const items = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.items)
        ? res.data.items
        : res.data?.data || [];
      const fromId = Number(formData.from_location_id);
      const scopedItems = Number.isFinite(fromId)
        ? items.filter((item) => Number(item.location_id) === fromId)
        : [];
      const availableOnly = scopedItems.filter((item) => {
        let computed = Number(
          item.computed_available ??
          item.quantity_available ??
          item.quantity_on_hand
        );
        if (!Number.isFinite(computed)) computed = 0;
        const reserved = Number(item.quantity_reserved ?? 0);
        const net = computed > 0 ? computed : computed - reserved;
        return net > 0;
      });
      setInventoryItems(availableOnly.map(normalizeInventoryRecord));
    } catch (err) {
      console.error('Failed to load inventory', err);
    }
  };

  const fetchDestinationLoadouts = async (locationId) => {
    if (!locationId) {
      setDestinationLoadouts([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/inventory/container_loadouts/search`, {
        params: { locationId, company_id: 1 },
        headers: getAuthHeaders()
      });
      const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
      setDestinationLoadouts(rows);
    } catch (err) {
      console.error('Failed to load destination loadouts', err);
      setDestinationLoadouts([]);
    }
  };

  const fetchBlueprintDetails = async (blueprintId) => {
    if (!blueprintId) return;
    try {
      const [blueprintRes, itemsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/inventory/container_blueprints/${blueprintId}`, {
          headers: getAuthHeaders()
        }),
        axios.get(`${API_BASE}/api/inventory/container_blueprints/${blueprintId}/items`, {
          headers: getAuthHeaders()
        })
      ]);

      setBlueprintDetails({
        ...blueprintRes.data,
        items: Array.isArray(itemsRes.data) ? itemsRes.data : []
      });
    } catch (error) {
      console.error('Failed to fetch blueprint details', error);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Reset destination_loadout_id if switching to general_delivery
      if (name === 'destination_type' && value === 'general_delivery') {
        updated.destination_loadout_id = '';
      }
      return updated;
    });
  };

  const handleAddInventoryItem = (record) => {
    const fromId = Number(formData.from_location_id);
    if (!fromId || Number(record.location_id) !== fromId) {
      alert('Select a source location before choosing inventory. Items must come from the origin.');
      return;
    }

    const exists = selectedItems.some((item) => item.inventory_id === record.inventory_id);
    if (exists) return;

    setSelectedItems((prev) => [
      ...prev,
      {
        inventory_id: record.inventory_id,
        part_id: record.part_id,
        lot_id: record.lot_id,
        quantity: 1,
        unit_of_measure: record.part?.unit_of_measure || 'EA',
        serial_number: record.serial_number || null,
        expiration_date: record.lot?.expiration_date || null,
        location_id: record.location_id,
        part: record.part,
        lot: record.lot
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemQuantityChange = (index, value) => {
    setSelectedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Number(value) || 0 } : item))
    );
  };

  const filteredInventory = useMemo(() => {
    const fromId = Number(formData.from_location_id);
    const locationFiltered = Number.isFinite(fromId)
      ? inventoryItems.filter((item) => Number(item.location_id) === fromId)
      : [];
    if (!searchTerm) return locationFiltered;
    const term = searchTerm.toLowerCase();
    return locationFiltered.filter((item) =>
      [item.part?.product_name, item.part?.sku, item.lot?.lot_number]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [inventoryItems, searchTerm, formData.from_location_id]);

  const manualStats = useMemo(() => {
    const totalQty = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const uniqueParts = new Set(selectedItems.map((item) => item.part_id)).size;
    return { totalQty, uniqueParts };
  }, [selectedItems]);

  const canContinue = useMemo(() => {
    switch (stepConfig[currentStep].id) {
      case 'details':
        return formData.from_location_id && formData.to_location_id;
      case 'items':
        return Boolean(formData.blueprint_id) || selectedItems.length > 0;
      default:
        return true;
    }
  }, [currentStep, formData, selectedItems]);

  const goNext = () => {
    if (currentStep < stepConfig.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canContinue) return;

    setLoading(true);
    try {
      const fromId = Number(formData.from_location_id);
      const invalidItems = selectedItems.filter(
        (item) => Number(item.location_id) !== fromId
      );
      if (invalidItems.length > 0) {
        alert('All selected inventory must come from the origin location.');
        setLoading(false);
        return;
      }

      const payload = {
        ...formData,
        items: selectedItems.map((item) => ({
          inventory_id: item.inventory_id,
          part_id: item.part_id,
          lot_id: item.lot_id,
          quantity: item.quantity,
          unit_of_measure: item.unit_of_measure,
          serial_number: item.serial_number,
          expiration_date: item.expiration_date
        }))
      };

      const response = await axios.post(`${API_BASE}/api/inventory/transfer-orders`, payload, {
        headers: getAuthHeaders()
      });
      onSuccess?.(response.data);
      onClose();
    } catch (error) {
      console.error('Failed to create transfer order', error);

      // Handle blueprint validation error with detailed message
      if (error.response?.data?.invalidItems) {
        const invalidItemsList = error.response.data.invalidItems
          .map(item => item.part_id)
          .join(', ');
        alert(
          `${error.response.data.message || 'Validation error'}\n\n` +
          `Invalid items: ${invalidItemsList}\n\n` +
          `These items are not defined in the selected loadout's blueprint.`
        );
      } else {
        alert(error.response?.data?.error || error.response?.data?.message || error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    const step = stepConfig[currentStep].id;

    if (step === 'details') {
      return (
        <div className="cto-step-card">
          <div className="cto-field">
            <label>
              <MapPin size={16} />
              From location
            </label>
            <select
              name="from_location_id"
              value={formData.from_location_id}
              onChange={handleInputChange}
              required
            >
              <option value="">Select...</option>
              {locations.map((loc) => (
                <option key={loc.location_id} value={loc.location_id}>
                  {loc.location_name}
                </option>
              ))}
            </select>
          </div>

          <div className="cto-field">
            <label>
              <MapPin size={16} />
              To location
            </label>
            <select
              name="to_location_id"
              value={formData.to_location_id}
              onChange={handleInputChange}
              required
            >
              <option value="">Select...</option>
              {locations
                .filter((loc) => String(loc.location_id) !== String(formData.from_location_id))
                .map((loc) => (
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.location_name}
                  </option>
                ))}
            </select>
          </div>

          <div className="cto-field">
            <label>
              <Package size={16} />
              Destination Type
              <button
                type="button"
                className="cto-info-icon"
                onClick={() => setShowDestinationTypeInfo(!showDestinationTypeInfo)}
                title="Click for more information"
              >
                <Info size={16} />
              </button>
            </label>

            {showDestinationTypeInfo && (
              <div className="cto-info-tooltip">
                <p><strong>General Delivery:</strong> Send items to the destination location's inventory. Items will be available as general stock.</p>
                <p><strong>Loadout Restock:</strong> Replenish an existing container/tray at the destination. Only items defined in the loadout's blueprint can be sent.</p>
              </div>
            )}

            <div className="cto-radio-group">
              <label className="cto-radio-option">
                <input
                  type="radio"
                  name="destination_type"
                  value="general_delivery"
                  checked={formData.destination_type === 'general_delivery'}
                  onChange={handleInputChange}
                />
                <span>General Delivery</span>
              </label>

              <label className="cto-radio-option">
                <input
                  type="radio"
                  name="destination_type"
                  value="loadout_restock"
                  checked={formData.destination_type === 'loadout_restock'}
                  onChange={handleInputChange}
                />
                <span>Loadout Restock</span>
              </label>
            </div>
          </div>

          {formData.destination_type === 'loadout_restock' && (
            <div className="cto-field">
              <label>
                <Box size={16} />
                Destination Loadout *
              </label>

              {destinationLoadouts.length === 0 ? (
                <p className="cto-no-loadouts">
                  No active loadouts found at destination location.
                </p>
              ) : (
                <select
                  name="destination_loadout_id"
                  value={formData.destination_loadout_id}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select a loadout...</option>
                  {destinationLoadouts.map(loadout => (
                    <option key={loadout.loadout_id} value={loadout.loadout_id}>
                      {loadout.full_serial || `${loadout.serial_suffix}`} - {loadout.blueprint_name} ({loadout.location_name})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="cto-field-row">
            <div>
              <label>Priority</label>
              <div className="cto-pill-group">
                {['Low', 'Medium', 'High'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`cto-pill ${formData.priority === level ? 'active' : ''}`}
                    onClick={() => setFormData((prev) => ({ ...prev, priority: level }))}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label>
                <Calendar size={16} />
                Requested date
              </label>
              <input
                type="datetime-local"
                name="requested_date"
                value={formData.requested_date}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="cto-field">
            <label>Transfer reason</label>
            <textarea
              rows={3}
              name="transfer_reason"
              value={formData.transfer_reason}
              onChange={handleInputChange}
              placeholder="Why is this move happening?"
            />
          </div>
        </div>
      );
    }

    if (step === 'blueprint') {
      return (
        <div className="cto-step-card">
          <div className="cto-field">
            <label>
              <Box size={16} />
              Blueprint (optional)
            </label>
            <select
              name="blueprint_id"
              value={formData.blueprint_id}
              onChange={handleInputChange}
            >
              <option value="">Manual build</option>
              {blueprints.map((bp) => (
                <option key={bp.blueprint_id} value={bp.blueprint_id}>
                  {bp.blueprint_name}
                </option>
              ))}
            </select>
            <small>
              {formData.blueprint_id
                ? 'Inventory will be auto-assigned according to this template.'
                : 'You can still assign containers manually.'}
            </small>
          </div>

          {formData.blueprint_id && blueprintDetails && (
            <div className="cto-blueprint-detail">
              <div className="cto-blueprint-head">
                <strong>{blueprintDetails.blueprint_name}</strong>
                <span>{blueprintDetails.items?.length || 0} items</span>
              </div>
              <div className="cto-blueprint-body">
                {blueprintDetails.items?.map((item, idx) => (
                  <div key={idx}>
                    <p>{item.product_name || item.part_product_name || `Item #${idx + 1}`}</p>
                    <small>
                      {(item.part_sku || item.part_gtin || '').toUpperCase()} -{' '}
                      {item.required_quantity || 1} {item.unit_of_measure || 'EA'}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (step === 'items') {
      const inventoryContent = (() => {
        if (!formData.from_location_id) {
          return (
            <div className="cto-empty-state large">
              Choose a source location in Step 1 to browse available inventory.
            </div>
          );
        }

        if (!inventoryItems.length) {
          return (
            <div className="cto-empty-state large">
              No inventory found at this location that matches the filters.
            </div>
          );
        }

        return (
          <>
            <div className="cto-field">
              <label>
                <Search size={16} />
                Search inventory
              </label>
              <input
                placeholder="Search by name, SKU or lot"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="cto-inventory-grid">
              {filteredInventory.slice(0, 40).map((item) => (
                <button
                  key={item.inventory_id}
                  type="button"
                  className="cto-inventory-card"
                  onClick={() => handleAddInventoryItem(item)}
                >
                  <strong>{item.part?.product_name}</strong>
                    <span>{item.part?.sku || '-'}</span>
                  <small>
                    {item.quantity_on_hand || item.quantity_available || 0} available • Lot{' '}
                    {item.lot?.lot_number || '-'}
                  </small>
                </button>
              ))}
            </div>
          </>
        );
      })();

      return (
        <div className="cto-step-card">
          <div className="cto-info-card">
            <strong>
              {formData.blueprint_id
                ? 'Blueprint inventory is pre-assigned'
                : 'Manual selection'}
            </strong>
            <p>
              {formData.blueprint_id
                ? 'Add extra items below if you need to send more than the template.'
                : 'Pick specific lots to transfer. Each card adds one item to the list.'}
            </p>
          </div>

          {!formData.blueprint_id && (
            <div className="cto-inventory-stack">{inventoryContent}</div>
          )}

          <div className="cto-selection-list">
            <div className="cto-selection-head">
              <div>
                <strong>Manual additions</strong>
                <span>
                  {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              {selectedItems.length > 0 && (
                <button type="button" className="link" onClick={() => setSelectedItems([])}>
                  Clear all
                </button>
              )}
            </div>
            {selectedItems.length === 0 ? (
              <p className="cto-empty-state">Select inventory cards to add them to this transfer.</p>
            ) : (
              selectedItems.map((item, index) => (
                <div key={`${item.inventory_id}-${index}`} className="cto-selection-row">
                  <div>
                    <p>{item.part?.product_name}</p>
                    <small>{item.part?.sku}</small>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={item.quantity}
                    onChange={(e) => handleItemQuantityChange(index, e.target.value)}
                  />
                  <button type="button" onClick={() => handleRemoveItem(index)}>
                    Remove
                  </button>
                </div>
              ))
            )}
            {selectedItems.length > 0 && (
              <p className="cto-selection-foot">
                {manualStats.totalQty} units / {manualStats.uniqueParts} unique parts
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="cto-step-card">
        <div className="cto-review-grid">
          <div>
            <p className="label">From</p>
            <strong>
              {locations.find((loc) => String(loc.location_id) === String(formData.from_location_id))
                ?.location_name || '-'}
            </strong>
          </div>
          <div>
            <p className="label">To</p>
            <strong>
              {locations.find((loc) => String(loc.location_id) === String(formData.to_location_id))
                ?.location_name || '-'}
            </strong>
          </div>
          <div>
            <p className="label">Priority</p>
            <strong>{formData.priority}</strong>
          </div>
          <div>
            <p className="label">Blueprint</p>
            <strong>
              {formData.blueprint_id
                ? blueprintDetails?.blueprint_name || 'Selected'
                : 'Manual selection'}
            </strong>
          </div>
        </div>

        <div className="cto-field">
          <label>
            <ClipboardList size={16} />
            Notes for warehouse team
          </label>
          <textarea
            rows={4}
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            placeholder="Truck access, sequence, special packaging, etc."
          />
        </div>
      </div>
    );
  };

  const atFinalStep = currentStep === stepConfig.length - 1;

  return (
    <div className="create-transfer-order-overlay">
      <div className="create-transfer-order-shell">
        <header className="cto-header">
          <div className="cto-header-title">
            <div className="cto-header-icon">
              <Package size={22} />
            </div>
            <div>
              <h2>New Transfer Order</h2>
              <p>Send staged inventory to another location in a few guided steps.</p>
            </div>
          </div>
          <button className="cto-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="cto-content">
          <aside className="cto-steps">
            {stepConfig.map((step, index) => {
              const status =
                index < currentStep ? 'complete' : index === currentStep ? 'active' : 'upcoming';
              return (
                <div key={step.id} className={`cto-step ${status}`}>
                  <span className="num">{index + 1}</span>
                  <div>
                    <p>{step.title}</p>
                    <small>{step.description}</small>
                  </div>
                </div>
              );
            })}
          </aside>

          <main className="cto-main">
            <form onSubmit={handleSubmit}>
              {renderStepContent()}

              <div className="cto-nav">
                {currentStep > 0 && (
                  <button type="button" className="secondary" onClick={goBack}>
                    Back
                  </button>
                )}
                {!atFinalStep ? (
                  <button type="button" className="primary" disabled={!canContinue} onClick={goNext}>
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="submit" className="primary" disabled={loading || !canContinue}>
                    {loading ? 'Creating...' : 'Create transfer order'}
                  </button>
                )}
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
};

export default CreateTransferOrder;
