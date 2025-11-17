/**
 * ===========================================
 * IMPORTS & DEPENDENCIES
 * ===========================================
 */
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Plus, X, QrCode, Trash2, Check, Camera, Keyboard, Package, Search, CheckCircle } from 'lucide-react';
import StatusBadge from '../../../components/StatusBadge';
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library';
import './Receiving.css';

/**
 * ===========================================
 * API ENDPOINTS CONFIGURATION
 * ===========================================
 * All API routes should be defined here.
 */
// Purchase Orders
const API_PURCHASE_ORDERS = 'api/procurement/purchase_orders';
const getPurchaseOrderById = (id) => `api/procurement/purchase_orders/${id}`;

// Receiving
const API_RECEIVING = 'api/procurement/receiving';
const getReceivingById = (id) => `api/procurement/receiving/${id}`;
const getReceivingItems = (id) => `api/procurement/receiving/${id}/items`;
const getReceivingItem = (receivingId, itemId) => `api/procurement/receiving/${receivingId}/items/${itemId}`;
const getReceivingComplete = (id) => `api/procurement/receiving/${id}/complete`;
const API_RECEIVING_PARSE_SCAN = 'api/procurement/receiving/parse-scan';
const getReceivingSearch = (query) => `api/procurement/receiving/search?q=${encodeURIComponent(query)}`;

// Inventory
const API_INVENTORY_PARTS = 'api/inventory/parts';
const API_INVENTORY_LOCATIONS = 'api/inventory/locations';

// Suppliers
const API_SUPPLIERS = 'api/procurement/suppliers';
// ============================================

const RECEIVABLE_STATUSES = ['sent_to_supplier', 'partial', 'received'];
const RECEIVING_PO_PAGE_SIZE = 10;

/**
 * ===========================================
 * API UTILITIES
 * ===========================================
 */

/**
 * Constructs a full API URL by combining base URL and endpoint
 * @param {string} endpoint - API endpoint path
 * @returns {string} Full API URL
 */
const buildApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = base.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return cleanEndpoint ? `${cleanBase}/${cleanEndpoint}` : cleanBase;
};

/**
 * Retrieves authentication token from localStorage
 * @returns {string} Authentication token or empty string if not found
 */
const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) console.warn('No auth token found in localStorage');
  return token || '';
};

/**
 * ===========================================
 * HELPER FUNCTIONS
 * ===========================================
 */

/**
 * Calculates total quantities received for each PO line
 * @param {Array} items - Array of received items
 * @param {Array} poLines - Array of purchase order lines
 * @returns {Object} Mapping of po_line_id to total quantity received
 */
const calculateReceivedQuantities = (items, poLines) => {
  const quantities = {};
  poLines.forEach(line => {
    quantities[line.po_line_id] = 0;
  });
  items.forEach(item => {
    if (item.po_line_id) {
      quantities[item.po_line_id] = (quantities[item.po_line_id] || 0) + Number(item.quantity_received || 0);
    }
  });
  return quantities;
};

/**
 * Determines if all line items are fully received
 * @param {Object} receivedQuantities - Map of po_line_id to received quantity
 * @param {Array} poLines - Array of purchase order lines
 * @returns {boolean} True if all items are fully received
 */
const isFullyReceived = (receivedQuantities, poLines) => {
  if (!poLines || poLines.length === 0) return false;
  
  return poLines.every(line => {
    const received = receivedQuantities[line.po_line_id] || 0;
    const ordered = Number(line.quantity_ordered || 0);
    return received >= ordered;
  });
};

/**
 * Determines if any items have been received
 * @param {Object} receivedQuantities - Map of po_line_id to received quantity
 * @returns {boolean} True if any items have been received
 */
const hasReceivedItems = (receivedQuantities) => {
  return Object.values(receivedQuantities).some(qty => qty > 0);
};

/**
 * ===========================================
 * SCAN MODAL COMPONENT
 * ===========================================
 * Handles barcode/QR code scanning and manual entry of received items.
 * 
 * Props:
 * - open: Boolean to control modal visibility
 * - onClose: Function to close the modal
 * - onAdd: Callback when an item is added
 * - parts: List of available parts
 * - suppliers: List of suppliers
 * - locations: List of storage locations
 * - purchaseOrder: Current purchase order being processed
 */
function ScanModal({ open, onClose, onAdd, parts, suppliers, locations, purchaseOrder }) {
  const [scannedData, setScannedData] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [lotNumber, setLotNumber] = useState('');
  const [gtin, setGtin] = useState('');
  const [sku, setSku] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanMode, setScanMode] = useState('keyboard');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [selectedPOLine, setSelectedPOLine] = useState('');
  const [formErrors, setFormErrors] = useState({});
  
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const scanInputRef = useRef(null);

  const selectedLine = useMemo(() => {
    if (!selectedPOLine || !purchaseOrder?.lines) return null;
    return purchaseOrder.lines.find(line => line.po_line_id === Number(selectedPOLine)) || null;
  }, [selectedPOLine, purchaseOrder]);

  const selectedPartDetails = useMemo(() => {
    if (!selectedPart) return null;
    return parts.find(p => p.part_id === Number(selectedPart)) || null;
  }, [selectedPart, parts]);

  const supplierDisplayName = useMemo(() => {
    if (purchaseOrder?.supplier_name) return purchaseOrder.supplier_name;
    if (purchaseOrder?.order?.supplier_name) return purchaseOrder.order.supplier_name;
    const supplier = suppliers.find(s => s.supplier_id === Number(selectedSupplier));
    return supplier?.supplier_name || 'Supplier not set';
  }, [purchaseOrder, selectedSupplier, suppliers]);

  const orderedQty = Number(selectedLine?.quantity_ordered ?? 0);
  const alreadyReceived = Number(selectedLine?.quantity_received ?? 0);
  const remainingQty = Math.max(0, orderedQty - alreadyReceived);
  const quantityExceeds = remainingQty > 0 && Number(quantity || 0) > remainingQty;

  useEffect(() => {
    if (open && scanMode === 'keyboard' && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [open, scanMode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (open) {
      resetForm();
      if (purchaseOrder?.supplier_id) {
        setSelectedSupplier(purchaseOrder.supplier_id.toString());
      }
      if (locations.length === 1) {
        setSelectedLocation(locations[0].location_id.toString());
      }
      // Auto-select PO line if there's only one
      if (purchaseOrder?.lines && purchaseOrder.lines.length === 1) {
        setSelectedPOLine(purchaseOrder.lines[0].po_line_id.toString());
      }
    }
  }, [open, purchaseOrder, locations]);

  useEffect(() => {
    if (selectedPart && parts.length > 0) {
      const part = parts.find(p => p.part_id === Number(selectedPart));
      if (part) {
        if (part.gtin) setGtin(part.gtin);
        if (part.sku) setSku(part.sku);
      }
    }
  }, [selectedPart, parts]);

  // Auto-select the part when the PO line changes to prevent mismatch
  useEffect(() => {
    if (selectedPOLine && purchaseOrder?.lines) {
      const line = purchaseOrder.lines.find(l => l.po_line_id === Number(selectedPOLine));
      if (line && line.part_id) {
        setSelectedPart(line.part_id.toString());
      }
    }
  }, [selectedPOLine, purchaseOrder]);

  useEffect(() => {
    if (selectedLine && !quantityTouched) {
      const suggestedQty = remainingQty > 0 ? remainingQty : Math.max(1, orderedQty || 1);
      setQuantity(String(suggestedQty));
    }
  }, [selectedLine, quantityTouched, remainingQty, orderedQty]);

  const resetForm = () => {
    setScannedData('');
    setParsedData(null);
    setSelectedPart('');
    if (purchaseOrder?.supplier_id) {
      setSelectedSupplier(purchaseOrder.supplier_id.toString());
    } else {
      setSelectedSupplier('');
    }
    setSelectedLocation('');
    setQuantity('1');
    setLotNumber('');
    setGtin('');
    setSku('');
    setSerialNumber('');
    setExpirationDate('');
    setNotes('');
    setError('');
    setSuccess('');
    setSelectedPOLine('');
    setScanStatus('');
    setFormErrors({});
    setQuantityTouched(false);
  };

const ZXING_FORMATS = [
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_8,
  BarcodeFormat.EAN_13,
];

const ZXING_HINTS = new Map([[DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS]]);

const startCamera = async () => {
    try {
      setScanStatus('Starting camera...');
      const codeReader = new BrowserMultiFormatReader(ZXING_HINTS);
      codeReaderRef.current = codeReader;

      const videoInputDevices = await codeReader.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera found');
      }

      let selectedDevice = videoInputDevices[0];
      const backCamera = videoInputDevices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear') ||
        device.label.toLowerCase().includes('environment')
      );
      
      if (backCamera) {
        selectedDevice = backCamera;
      }

      setScanStatus('Camera ready - position barcode in view');
      
      await codeReader.decodeFromVideoDevice(
        selectedDevice.deviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            const scannedText = result.getText();
            setScannedData(scannedText);
            setScanStatus('Barcode detected! Processing...');
            handleParseScan(scannedText);
            stopCamera();
          }
          if (error && !(error instanceof NotFoundException)) {
            console.error('Scanner error:', error);
          }
        }
      );

      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Camera error: ${err.message}`);
      setScanStatus('');
    }
  };

  const stopCamera = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
    setCameraActive(false);
    setScanStatus('');
  };

  const handleParseScan = async (scanData) => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(buildApiUrl(API_RECEIVING_PARSE_SCAN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ scan_data: scanData })
      });

      if (!response.ok) {
        throw new Error('Failed to parse scan data');
      }

      const data = await response.json();
      setParsedData(data);
      
      if (data.gtin || data.GTIN) setGtin(data.gtin || data.GTIN);
      const parsedLot = data.lot || data.lot_number || data.lotNumber || data.batch || data.batch_number || data.batchNumber;
      if (parsedLot) setLotNumber(parsedLot);
      const parsedSerial = data.serial || data.serial_number || data.serialNumber;
      if (parsedSerial) setSerialNumber(parsedSerial);
      if (data.expiry || data.expiration || data.expiration_date) {
        setExpirationDate(data.expiry || data.expiration || data.expiration_date);
      }
      if (data.quantity) setQuantity(data.quantity.toString());
      
      // Try to match with existing parts
      if (data.gtin && parts.length > 0) {
        const matchingPart = parts.find(p => p.gtin === data.gtin);
        if (matchingPart) {
          setSelectedPart(matchingPart.part_id.toString());
          setSuccess('Part automatically matched!');
        }
      }
      
    } catch (err) {
      console.error('Parse error:', err);
      setError('Failed to parse barcode data');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!selectedPart) errors.selectedPart = 'Please select a part';
    if (!selectedLocation) errors.selectedLocation = 'Please select a location';
    if (!quantity || Number(quantity) <= 0) errors.quantity = 'Quantity must be greater than 0';
    if (!selectedPOLine) errors.selectedPOLine = 'Please select a PO line item';
    if (!purchaseOrder?.supplier_id && !selectedSupplier) {
      errors.selectedSupplier = 'Assign a supplier to this purchase order before receiving.';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleQuantityChange = (value) => {
    setQuantityTouched(true);
    setQuantity(value);
  };

  const adjustQuantity = (delta) => {
    setQuantityTouched(true);
    setQuantity(prev => {
      const current = Number(prev || 0) || 0;
      const next = Math.max(1, current + delta);
      return String(next);
    });
  };

  const fillRemaining = () => {
    if (remainingQty > 0) {
      setQuantityTouched(true);
      setQuantity(String(remainingQty));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const itemData = {
        part_id: Number(selectedPart),
        supplier_id: Number(selectedSupplier),
        location_id: Number(selectedLocation),
        quantity_received: Number(quantity),
        lot_number: lotNumber || null,
        serial_number: serialNumber || null,
        expiration_date: expirationDate || null,
        notes: notes || null,
        gtin: gtin || null,
        sku: sku || null,
        po_line_id: Number(selectedPOLine)
      };

      await onAdd(itemData);
      setSuccess('Item added successfully!');
      
      // Reset form but keep supplier and location selected
      setTimeout(() => {
        const currentSupplier = selectedSupplier;
        const currentLocation = selectedLocation;
        resetForm();
        setSelectedSupplier(currentSupplier);
        setSelectedLocation(currentLocation);
        setSuccess('');
        
        if (scanMode === 'keyboard' && scanInputRef.current) {
          scanInputRef.current.focus();
        }
      }, 1000);

    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message || 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = (e) => {
    const value = e.target.value;
    setScannedData(value);
    
    // Auto-parse when Enter is pressed
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      handleParseScan(value.trim());
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Scan Items</h2>
            <p className="scan-modal__muted">Capture barcodes or enter item details manually.</p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close scan modal">
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="scan-modal__intro">
            <div>
              <p className="scan-modal__eyebrow">Purchase Order</p>
              <h3 className="scan-modal__title">
                {purchaseOrder?.po_number ? `#${purchaseOrder.po_number}` : 'Select a PO'}
              </h3>
              <p className="scan-modal__muted">{supplierDisplayName}</p>
            </div>
            <div className="scan-modal__chips">
              <div className="scan-chip">
                <span>Open lines</span>
                <strong>{purchaseOrder?.lines?.length || 0}</strong>
              </div>
              {purchaseOrder?.status && (
                <div className="scan-chip">
                  <span>Status</span>
                  <StatusBadge status={purchaseOrder.status} />
                </div>
              )}
            </div>
          </div>

          <div className="scan-card">
            <div className="scan-card__title">Capture Barcode</div>
            <p className="scan-modal__muted">
              Toggle between a hardware scanner/keyboard or the built-in camera.
            </p>
            <div className="scan-mode-toggle scan-mode-toggle--pill">
              <button
                type="button"
                onClick={() => {
                  setScanMode('keyboard');
                  stopCamera();
                }}
                className={`scan-mode-btn ${scanMode === 'keyboard' ? 'active' : ''}`}
              >
                <Keyboard size={18} />
                Keyboard / Scanner
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanMode('camera');
                  if (!cameraActive) startCamera();
                }}
                className={`scan-mode-btn ${scanMode === 'camera' ? 'active' : ''}`}
              >
                <Camera size={18} />
                Camera
              </button>
            </div>

            {scanMode === 'keyboard' && (
              <div className="scan-input-stack">
                <label className="form-label">Scan or Enter Barcode Data</label>
                <input
                  ref={scanInputRef}
                  type="text"
                  className="form-input"
                  value={scannedData}
                  onChange={(e) => setScannedData(e.target.value)}
                  onKeyDown={handleManualEntry}
                  placeholder="Scan barcode or type and press Enter"
                  autoFocus
                />
                <div className="scan-input-actions">
                  <span className="helper-text">Press Enter after scanning to parse automatically.</span>
                  {scannedData && (
                    <button
                      type="button"
                      onClick={() => handleParseScan(scannedData)}
                      className="btn btn-secondary"
                      disabled={loading}
                    >
                      Parse Barcode
                    </button>
                  )}
                </div>
              </div>
            )}

            {scanMode === 'camera' && (
              <div className="camera-panel">
                <div className="camera-frame">
                  <video ref={videoRef} />
                  {scanStatus && <div className="camera-status">{scanStatus}</div>}
                </div>
                {cameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="btn btn-secondary"
                    style={{ width: '100%' }}
                  >
                    Stop Camera
                  </button>
                )}
              </div>
            )}
          </div>

          {parsedData && (
            <div className="scan-card scan-card--info">
              <div className="scan-card__title">Parsed Barcode</div>
              <div className="parsed-grid">
                <div>
                  <span>GTIN</span>
                  <strong>{parsedData.gtin || '—'}</strong>
                </div>
                <div>
                  <span>Lot</span>
                  <strong>{parsedData.lot || '—'}</strong>
                </div>
                <div>
                  <span>Serial</span>
                  <strong>{parsedData.serial || '—'}</strong>
                </div>
                <div>
                  <span>Expiry</span>
                  <strong>
                    {parsedData.expiration_date ||
                      parsedData.expiration ||
                      parsedData.expiry ||
                      '—'}
                  </strong>
                </div>
                <div>
                  <span>Quantity</span>
                  <strong>{parsedData.quantity || '—'}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="scan-card">
            <div className="scan-card__title">Item Details</div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">PO Line Item</label>
                  <select
                    className={`form-input ${formErrors.selectedPOLine ? 'error' : ''}`}
                    value={selectedPOLine}
                    onChange={(e) => setSelectedPOLine(e.target.value)}
                    required
                  >
                    <option value="">Select line item</option>
                    {purchaseOrder?.lines?.map(line => (
                      <option key={line.po_line_id} value={line.po_line_id}>
                        {line.part_name || line.product_name} — Ordered: {line.quantity_ordered}
                      </option>
                    ))}
                  </select>
                  <span className="helper-text">Selecting a line auto-fills the correct part.</span>
                  {formErrors.selectedPOLine && (
                    <span className="error-text">{formErrors.selectedPOLine}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label required">Part</label>
                  <select
                    className="form-input"
                    value={selectedPart}
                    onChange={(e) => setSelectedPart(e.target.value)}
                    required
                    disabled={!!selectedPOLine}
                  >
                    <option value="">Select part</option>
                    {parts.map(part => (
                      <option key={part.part_id} value={part.part_id}>
                        {part.product_name || part.part_name} ({part.gtin || part.sku || 'No code'})
                      </option>
                    ))}
                  </select>
                  <span className="helper-text">
                    {selectedPOLine ? 'Locked to the PO line to avoid mismatches.' : 'Search the catalogue.'}
                  </span>
                  {selectedPartDetails && (
                    <span className="helper-text">
                      SKU: {selectedPartDetails.sku || '—'} · GTIN: {selectedPartDetails.gtin || '—'}
                    </span>
                  )}
                  {formErrors.selectedPart && (
                    <span className="error-text">{formErrors.selectedPart}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <div className="form-static">
                    {supplierDisplayName}
                  </div>
                  {!purchaseOrder?.supplier_id && (
                    <span className="warning-text">
                      This purchase order has no supplier assigned. Please update the PO before receiving.
                    </span>
                  )}
                  {formErrors.selectedSupplier && (
                    <span className="error-text">{formErrors.selectedSupplier}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label required">Location</label>
                  <select
                    className={`form-input ${formErrors.selectedLocation ? 'error' : ''}`}
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    required
                  >
                    <option value="">Select location</option>
                    {locations.map(loc => (
                      <option key={loc.location_id} value={loc.location_id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                  <span className="helper-text">Where in the warehouse the items will land.</span>
                  {formErrors.selectedLocation && (
                    <span className="error-text">{formErrors.selectedLocation}</span>
                  )}
                </div>

                {selectedLine && (
                  <div className="line-summary-card form-grid-full">
                    <div>
                      <span>Ordered</span>
                      <strong>{orderedQty}</strong>
                    </div>
                    <div>
                      <span>Received</span>
                      <strong>{alreadyReceived}</strong>
                    </div>
                    <div>
                      <span>Remaining</span>
                      <strong>{remainingQty}</strong>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label required">Quantity</label>
                  <input
                    type="number"
                    className={`form-input ${formErrors.quantity ? 'error' : ''}`}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    min="1"
                    required
                  />
                  <div className="qty-quick-actions">
                    <button type="button" onClick={() => adjustQuantity(-1)}>−1</button>
                    <button type="button" onClick={() => adjustQuantity(1)}>+1</button>
                    {remainingQty > 0 && (
                      <button type="button" onClick={fillRemaining}>
                        Fill Remaining ({remainingQty})
                      </button>
                    )}
                  </div>
                  {quantityExceeds && (
                    <span className="warning-text">
                      Quantity exceeds remaining amount by {Number(quantity) - remainingQty}.
                    </span>
                  )}
                  {formErrors.quantity && (
                    <span className="error-text">{formErrors.quantity}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Lot Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Serial Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">GTIN</label>
                  <input
                    type="text"
                    className="form-input"
                    value={gtin}
                    onChange={(e) => setGtin(e.target.value)}
                    placeholder="Optional"
                    readOnly={!!parsedData?.gtin}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input
                    type="text"
                    className="form-input"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group form-grid-full">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows="3"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {error && (
                <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                  {error}
                </div>
              )}
              
              {success && (
                <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                  {success}
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  <Plus size={16} />
                  {loading ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ===========================================
 * MAIN RECEIVING COMPONENT
 * ===========================================
 */
function Receiving() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [items, setItems] = useState([]);
  const [parts, setParts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [receivedQuantities, setReceivedQuantities] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [poOffset, setPoOffset] = useState(0);
  const [poTotal, setPoTotal] = useState(0);
  const [poHasMore, setPoHasMore] = useState(false);

  const loadPurchaseOrders = useCallback(
    async (offsetOverride) => {
      try {
        setLoading(true);
        const limit = RECEIVING_PO_PAGE_SIZE;
        const effectiveOffset =
          typeof offsetOverride === 'number' ? Math.max(0, offsetOverride) : poOffset;
        const statusesToQuery =
          !statusFilter || statusFilter === 'all'
            ? RECEIVABLE_STATUSES
            : [statusFilter];

        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(effectiveOffset),
          status: Array.from(new Set(statusesToQuery)).join(','),
        });

        const response = await fetch(
          buildApiUrl(`${API_PURCHASE_ORDERS}?${params.toString()}`),
          {
            headers: {
              Authorization: `Bearer ${getAuthToken()}`
            }
          }
        );

        if (!response.ok) throw new Error('Failed to load purchase orders');

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : (payload.data || []);

        const receivableOrders = rows.filter((po) =>
          RECEIVABLE_STATUSES.includes(po.status)
        );
        setPurchaseOrders(receivableOrders);

        const pagination = (!Array.isArray(payload) && payload.pagination) || {};
        const apiTotal =
          typeof pagination?.total === 'number'
            ? pagination.total
            : (!Array.isArray(payload) && typeof payload?.total === 'number'
                ? payload.total
                : 0);
        setPoTotal(apiTotal);

        const derivedHasMore =
          typeof pagination?.hasMore === 'boolean'
            ? pagination.hasMore
            : (apiTotal
                ? effectiveOffset + receivableOrders.length < apiTotal
                : receivableOrders.length === limit);
        setPoHasMore(derivedHasMore);
      } catch (err) {
        console.error('Error loading purchase orders:', err);
      } finally {
        setLoading(false);
      }
    },
    [poOffset, statusFilter]
  );

  // Load static reference data
  useEffect(() => {
    loadParts();
    loadSuppliers();
    loadLocations();
  }, []);

  // Fetch purchase orders whenever pagination/filter/search changes (excluding active search mode)
  useEffect(() => {
    if (searchTerm.trim()) return;
    loadPurchaseOrders();
  }, [loadPurchaseOrders, searchTerm]);

  // Load received quantities when PO or items change
  useEffect(() => {
    if (selectedPO && selectedPO.lines) {
      const quantities = calculateReceivedQuantities(items, selectedPO.lines);
      setReceivedQuantities(quantities);
    }
  }, [selectedPO, items]);

  const loadParts = async () => {
    try {
      const response = await fetch(buildApiUrl(API_INVENTORY_PARTS), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) throw new Error('Failed to load parts');

      const data = await response.json();
      const partsArray = Array.isArray(data) ? data : (data.data || []);
      setParts(partsArray);
    } catch (err) {
      console.error('Error loading parts:', err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const response = await fetch(buildApiUrl(API_SUPPLIERS), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) throw new Error('Failed to load suppliers');

      const data = await response.json();
      const suppliersArray = Array.isArray(data) ? data : (data.data || []);
      setSuppliers(suppliersArray);
    } catch (err) {
      console.error('Error loading suppliers:', err);
    }
  };

  const loadLocations = async () => {
    try {
      const response = await fetch(buildApiUrl(API_INVENTORY_LOCATIONS), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) throw new Error('Failed to load locations');

      const data = await response.json();
      const locationsArray = Array.isArray(data) ? data : (data.data || []);
      setLocations(locationsArray);
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  };

  const handleSelectPO = async (po) => {
    try {
      setLoading(true);
      
      // First, ensure we have the PO with lines
      let poWithLines = po;
      if (!po.lines || po.lines.length === 0) {
        // If PO doesn't have lines, fetch it with lines from the server
        const poResponse = await fetch(buildApiUrl(`${API_PURCHASE_ORDERS}/${po.purchase_order_id}`), {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });
        
        if (!poResponse.ok) throw new Error('Failed to load PO details');
        
        const poData = await poResponse.json();
        if (poData?.order) {
          poWithLines = {
            ...po,
            ...poData.order,
            lines: poData.lines || po.lines || [],
          };
        } else if (Array.isArray(poData)) {
          poWithLines = poData[0];
        } else {
          poWithLines = poData;
        }
      }
      
      setSelectedPO(poWithLines);
      
      // First, ensure we have a numeric purchase order ID
      const poId = typeof po.purchase_order_id === 'string' 
        ? parseInt(po.purchase_order_id, 10) 
        : po.purchase_order_id;

      if (isNaN(poId)) {
        throw new Error('Invalid purchase order ID');
      }

      // Try to find an existing receiving record for this PO using the direct endpoint
      let receivingData = null;
      try {
        // First try the direct endpoint if it exists
        const searchResponse = await fetch(buildApiUrl(`${API_RECEIVING}/by-po/${poId}`), {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });

        if (searchResponse.ok) {
          const searchResult = await searchResponse.json();
          if (searchResult && searchResult.receiving_id) {
            receivingData = searchResult;
          }
        }
      } catch (searchError) {
        console.warn('Error searching for receiving record by PO:', searchError);
        // Continue with the creation flow
      }

      // If no existing receiving record, create a new one
      if (!receivingData) {
        const createResponse = await fetch(buildApiUrl(API_RECEIVING), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify({
            purchase_order_id: poId,
            supplier_id: po.supplier_id || poWithLines?.supplier_id || null,
            po_number: po.po_number || null,
            reference_number: `RCV-${new Date().getTime()}`,
            notes: `Receiving for PO ${po.po_number || poId}`
          })
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || 'Failed to create receiving record');
        }

        receivingData = await createResponse.json();
      }

      if (!receivingData || !receivingData.receiving_id) {
        throw new Error('Failed to get valid receiving record');
      }

      // Fetch the complete receiving record to ensure we have all fields
      const receivingResponse = await fetch(buildApiUrl(getReceivingById(receivingData.receiving_id)), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!receivingResponse.ok) {
        throw new Error('Failed to load receiving record details');
      }

      const fullReceivingData = await receivingResponse.json();
      setReceiving(fullReceivingData);
      
      // Load existing items
      await loadReceivingItems(fullReceivingData.receiving_id);
    } catch (err) {
      console.error('Error selecting PO:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReceivingItems = async (receivingId) => {
    try {
      const response = await fetch(buildApiUrl(getReceivingItems(receivingId)), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) throw new Error('Failed to load receiving items');

      const data = await response.json();
      const itemsArray = Array.isArray(data) ? data : (data.data || []);
      setItems(itemsArray);
    } catch (err) {
      console.error('Error loading receiving items:', err);
    }
  };

  const handleAddItem = async (itemData) => {
    try {
      if (!receiving) throw new Error('No receiving record selected');

      const response = await fetch(buildApiUrl(getReceivingItems(receiving.receiving_id)), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          ...itemData,
          // Ensure quantity is a number
          quantity_received: Number(itemData.quantity_received || 1),
          // Ensure purchase_order_id is included if available
          purchase_order_id: receiving.purchase_order_id || itemData.purchase_order_id
        })
      });

      if (!response.ok) {
        // Clone the response to read it multiple times if needed
        const responseClone = response.clone();
        let errorMessage = 'Failed to add item';
        
        try {
          // First try to parse as JSON
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
          
          // Log the full error for debugging
          console.error('Backend error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
        } catch (e) {
          // If JSON parsing fails, try to get the response as text
          try {
            const text = await responseClone.text();
            errorMessage = text || errorMessage;
            console.error('Backend error (text):', text);
          } catch (textError) {
            console.error('Could not parse error response:', textError);
          }
        }
        throw new Error(errorMessage);
      }

      // Refresh the items list
      await loadReceivingItems(receiving.receiving_id);
      
      // Also refresh the PO to update status if needed
      if (receiving.purchase_order_id) {
        await loadPurchaseOrder(receiving.purchase_order_id);
      }
      
      return true;
    } catch (err) {
      console.error('Error adding item:', {
        error: err,
        message: err.message,
        stack: err.stack
      });
      throw err; // Re-throw to be handled by the caller (e.g., ScanModal)
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to remove this item?')) return;

    try {
      if (!receiving) throw new Error('No receiving record selected');
      
      const response = await fetch(
        buildApiUrl(getReceivingItem(receiving.receiving_id, itemId)),
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        let errorMessage = 'Failed to remove item';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
          console.error('Backend error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
        } catch (e) {
          try {
            const text = await response.text();
            errorMessage = text || errorMessage;
          } catch (textError) {
            console.error('Could not parse error response:', textError);
          }
        }
        throw new Error(errorMessage);
      }

      // Refresh the items list
      await loadReceivingItems(receiving.receiving_id);
      
      // Also refresh the PO to update status if needed
      if (receiving.purchase_order_id) {
        await loadPurchaseOrder(receiving.purchase_order_id);
      }
      
      // Show success message
      toast.success('Item removed successfully');
    } catch (err) {
      console.error('Error removing item:', {
        error: err,
        message: err.message,
        stack: err.stack
      });
      toast.error(`Failed to remove item: ${err.message}`);
    }
  };

  const handleCompleteReceiving = async () => {
    try {
      if (!receiving) return;
      
      const quantities = calculateReceivedQuantities(items, selectedPO.lines);
      const fullyReceived = isFullyReceived(quantities, selectedPO.lines);
      const hasItems = hasReceivedItems(quantities);
      
      if (!hasItems) {
        alert('Please scan at least one item before completing.');
        return;
      }

      const statusText = fullyReceived ? 'fully received' : 'partially received';
      if (!window.confirm(`Complete receiving? This order will be marked as ${statusText}.`)) {
        return;
      }

      setLoading(true);

      const response = await fetch(
        buildApiUrl(getReceivingComplete(receiving.receiving_id)),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify({
            status: fullyReceived ? 'received' : 'partial'
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to complete receiving');
      }

      alert(`Receiving completed successfully! Order marked as ${statusText}.`);
      
      // Reload data
      await loadPurchaseOrders();
      setSelectedPO(null);
      setReceiving(null);
      setItems([]);
      setReceivedQuantities({});
      
    } catch (err) {
      console.error('Error completing receiving:', err);
      alert('Failed to complete receiving: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    const trimmed = term.trim();

    if (!trimmed) {
      setPoOffset(0);
      setPoTotal(0);
      setPoHasMore(false);
      return;
    }
    setPoOffset(0);

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(getReceivingSearch(trimmed)), {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      const resultsArray = Array.isArray(data) ? data : (data.data || []);
      setPurchaseOrders(resultsArray);
      setPoTotal(resultsArray.length);
      setPoHasMore(false);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter purchase orders by status  -left arm 
  const filteredPOs = purchaseOrders.filter(po => {
    if (statusFilter === 'all') return true;
    // sent_to_supplier = pending 
    if (statusFilter === 'sent_to_supplier') return po.status === 'sent_to_supplier';
    if (statusFilter === 'partial') return po.status === 'partial';
    if (statusFilter === 'received') return po.status === 'received';
    return true;
  });

  const isSearchActive = Boolean(searchTerm.trim());
  const currentPage = Math.floor(poOffset / RECEIVING_PO_PAGE_SIZE) + 1;
  const effectiveTotal = isSearchActive ? purchaseOrders.length : poTotal;
  const totalPages = effectiveTotal
    ? Math.max(1, Math.ceil(effectiveTotal / RECEIVING_PO_PAGE_SIZE))
    : (poHasMore ? currentPage + 1 : currentPage);
  const pageStart = purchaseOrders.length ? poOffset + 1 : 0;
  const pageEnd = purchaseOrders.length ? poOffset + purchaseOrders.length : 0;
  const displayTotal = effectiveTotal || pageEnd;
  const displayStart = purchaseOrders.length ? pageStart : 0;
  const displayEnd = purchaseOrders.length
    ? (displayTotal ? Math.min(pageEnd, displayTotal) : pageEnd)
    : 0;

  const getStatusDisplay = (status) => {
    switch(status) {
      case 'sent_to_supplier': return { text: 'Pending', color: '#3b82f6' };
        // sent_to_supplier = pending 
      case 'partial': return { text: 'Partial', color: '#f59e0b' };
      case 'received': return { text: 'Received', color: '#10b981' };
      default: return { text: status, color: '#6b7280' };
    }
  };

  return (
    <div className="receiving-container">
      <div className="page-header">
        <div>
          <h1>Receiving</h1>
          <p className="subtitle">Receive and process incoming shipments</p>
        </div>
      </div>

      <div className="receiving-content">
        {/* Left Panel - Purchase Orders List */}
        <div className="po-list-panel">
          <div className="panel-header">
            <h2>Purchase Orders</h2>
          </div>

          {/* Search and Filter */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
            <div className="search-box" style={{ marginBottom: '1rem' }}>
              <Search size={20} />
              <input
                type="text"
                placeholder="Search purchase orders..."
                value={searchTerm}
                onChange={handleSearch}
                className="search-input"
              />
            </div>
            
            {/* Status Filter */}
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPoOffset(0);
              }}
              style={{ width: '100%' }}
            >
              <option value="all">All Statuses</option>
              <option value="sent_to_supplier">Pending Receipt</option>
              <option value="partial">Partially Received</option>
              <option value="received">Fully Received</option>
            </select>
          </div>

          {/* Purchase Orders List */}
          <div className="po-list">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                Loading...
              </div>
            ) : filteredPOs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <p>No purchase orders found</p>
              </div>
            ) : (
              filteredPOs.map(po => {
                const statusInfo = getStatusDisplay(po.status);
                const isSelected = selectedPO?.purchase_order_id === po.purchase_order_id;
                
                return (
                  <div
                    key={po.purchase_order_id}
                    className={`po-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPO(po)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '700', fontSize: '1rem' }}>
                          {po.po_number}
                        </span>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: statusInfo.color + '20',
                          color: statusInfo.color
                        }}>
                          {statusInfo.text}
                        </span>
                      </div>
                      <p style={{ margin: '0', fontSize: '0.875rem', color: '#6b7280' }}>
                        {po.supplier_name}
                      </p>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                        {new Date(po.order_date).toLocaleDateString()}
                      </p>
                      {po.status === 'partial' && (
                        <p style={{ 
                          margin: '0.5rem 0 0 0', 
                          fontSize: '0.75rem', 
                          color: '#f59e0b',
                          fontWeight: '600'
                        }}>
                          ⚠ Partially received 
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {!isSearchActive && (
            <div className="po-pagination">
              <div className="po-pagination-info">
                {displayTotal
                  ? `Showing ${displayStart}-${displayEnd} of ${displayTotal}`
                  : '0 results'}
              </div>
              <div className="po-pagination-controls">
                <button
                  className="po-pagination-btn"
                  onClick={() => setPoOffset(prev => Math.max(0, prev - RECEIVING_PO_PAGE_SIZE))}
                  disabled={poOffset === 0 || loading}
                >
                  Prev
                </button>
                <span className="po-pagination-page">
                  Page {currentPage}{totalPages ? ` of ${totalPages}` : ''}
                </span>
                <button
                  className="po-pagination-btn"
                  onClick={() => setPoOffset(prev => prev + RECEIVING_PO_PAGE_SIZE)}
                  disabled={!poHasMore || loading}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Receiving Details */}
        {!selectedPO ? (
          <div className="receiving-detail-panel">
            <div className="empty-state" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <Package size={64} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Select a Purchase Order
              </h3>
              <p style={{ color: '#6b7280' }}>
                Choose a purchase order from the list to begin receiving items
              </p>
            </div>
          </div>
        ) : (
          <div className="receiving-detail-panel">
            {/* Header with Actions */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              background: 'white'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <div>
                  <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: '700' }}>
                    {selectedPO.po_number}
                  </h2>
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    {selectedPO.supplier_name}
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    Order Date: {new Date(selectedPO.order_date).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {receiving?.status !== 'completed' && (
                    <>
                      <button
                        onClick={() => setScanModalOpen(true)}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <QrCode size={20} />
                        Scan Items
                      </button>
                      <button
                        onClick={handleCompleteReceiving}
                        className="btn btn-success"
                        disabled={items.length === 0}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <Check size={20} />
                        Complete
                      </button>
                    </>
                  )}
                  {receiving?.status === 'completed' && (
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      background: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '0.375rem',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <CheckCircle size={20} />
                      Completed
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Expected Items with Progress */}
            {selectedPO.lines && selectedPO.lines.length > 0 && (
              <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                  Expected Items:
                </h3>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {selectedPO.lines.map(line => {
                    const received = receivedQuantities[line.po_line_id] || 0;
                    const ordered = Number(line.quantity_ordered || 0);
                    const isComplete = received >= ordered;
                    const progress = ordered > 0 ? (received / ordered) * 100 : 0;
                    
                    return (
                      <div 
                        key={line.po_line_id}
                        style={{
                          padding: '1rem',
                          background: 'white',
                          borderRadius: '0.5rem',
                          border: `2px solid ${isComplete ? '#10b981' : '#e5e7eb'}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: '600', fontSize: '1rem' }}>
                            {line.product_name || line.part_name}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                            SKU: {line.sku || 'N/A'}
                          </p>
                          <div style={{ 
                            marginTop: '0.75rem', 
                            height: '8px', 
                            background: '#e5e7eb', 
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(progress, 100)}%`,
                              background: isComplete ? '#10b981' : '#3b82f6',
                              transition: 'width 0.3s ease',
                              borderRadius: '4px'
                            }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: '120px' }}>
                          <p style={{ 
                            margin: 0, 
                            fontSize: '1.5rem', 
                            fontWeight: '700',
                            color: isComplete ? '#10b981' : '#3b82f6'
                          }}>
                            {received}/{ordered}
                          </p>
                          <p style={{ 
                            margin: '0.25rem 0 0 0',
                            fontSize: '0.875rem', 
                            color: isComplete ? '#10b981' : '#6b7280',
                            fontWeight: '600'
                          }}>
                            {isComplete ? '✓ Complete' : `${ordered - received} remaining`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scanned Items */}
            {items.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
                <QrCode size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '1.125rem', fontWeight: '500', marginTop: '1rem' }}>
                  No items scanned yet
                </p>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Click "Scan Items" to begin receiving
                </p>
              </div>
            ) : (
              <>
                <div style={{ 
                  padding: '1rem', 
                  background: '#eff6ff', 
                  borderRadius: '0.5rem', 
                  marginBottom: '1rem',
                  border: '1px solid #bfdbfe'
                }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#1e40af' }}>
                    SCANNED ITEMS SUMMARY
                  </h3>
                  <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
                    <div>
                      <span style={{ color: '#3b82f6' }}>Total Items: </span>
                      <span style={{ fontWeight: '700', color: '#1e3a8a' }}>{items.length}</span>
                    </div>
                    <div>
                      <span style={{ color: '#3b82f6' }}>Total Quantity: </span>
                      <span style={{ fontWeight: '700', color: '#1e3a8a' }}>
                        {items.reduce((sum, item) => sum + Number(item.quantity_received || 0), 0)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#3b82f6' }}>Unique Parts: </span>
                      <span style={{ fontWeight: '700', color: '#1e3a8a' }}>
                        {new Set(items.map(i => i.part_id)).size}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th className="text-left">Part</th>
                        <th className="text-left">SKU</th>
                        <th className="text-left">Lot</th>
                        <th className="text-left">Serial</th>
                        <th className="text-center">Expiry</th>
                        <th className="text-left">Location</th>
                        <th className="text-right">Qty</th>
                        {receiving?.status !== 'completed' && <th className="text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.receiving_item_id}>
                          <td className="text-left font-medium">
                            {item.part_name || item.product_name}
                          </td>
                          <td className="text-left">{item.sku || '-'}</td>
                          <td className="text-left">{item.lot_number || '-'}</td>
                          <td className="text-left">{item.serial_number || '-'}</td>
                          <td className="text-center text-sm">
                            {item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="text-left">{item.location_name || '-'}</td>
                          <td className="text-right">
                            <span className="qty-badge">{item.quantity_received}</span>
                          </td>
                          {receiving?.status !== 'completed' && (
                            <td className="text-center">
                              <button 
                                className="icon-btn"
                                onClick={() => handleRemoveItem(item.receiving_item_id)}
                                title="Remove item"
                                style={{ color: '#ef4444' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onAdd={handleAddItem}
        parts={parts}
        suppliers={suppliers}
        purchaseOrder={selectedPO}
        locations={locations}
      />
    </div>
  );
}

export default Receiving;
