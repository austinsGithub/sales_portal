import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Keyboard,
  Camera,
  CheckCircle,
  Clock,
  MapPin,
  Truck,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library';
import axios from 'axios';
import './TransferOrderScanner.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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

const TransferOrderScanner = ({ order, onClose, onUpdate }) => {
  const [scanMode, setScanMode] = useState('keyboard');
  const [scannedData, setScannedData] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [pickedItems, setPickedItems] = useState(() => {
    const saved = localStorage.getItem(`picked_items_${order.transfer_order_id}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [packedItems, setPackedItems] = useState(() => {
    const saved = localStorage.getItem(`packed_items_${order.transfer_order_id}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const scanInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPickingMode = order.status === 'Approved';
  const isPackingMode = order.status === 'Picked';
  const isShippingMode = order.status === 'Packed';

  const blueprintItems = order?.loadout_details?.blueprint_items || [];
  const additionalItems = order?.items?.filter(item => !item.loadout_id) || [];
  const allItems = [...blueprintItems, ...additionalItems];
  const currentItem = allItems[currentItemIndex];

  useEffect(() => {
    if (scanMode === 'keyboard' && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [scanMode, currentItemIndex]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    localStorage.setItem(`picked_items_${order.transfer_order_id}`, JSON.stringify(pickedItems));
  }, [pickedItems, order.transfer_order_id]);

  useEffect(() => {
    localStorage.setItem(`packed_items_${order.transfer_order_id}`, JSON.stringify(packedItems));
  }, [packedItems, order.transfer_order_id]);

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
        (result, err) => {
          if (result) {
            const scannedText = result.getText();
            setScannedData(scannedText);
            setScanStatus('Barcode detected!');
            handleScan(scannedText);
            stopCamera();
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error('Scanner error:', err);
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

  const handleScan = (scanData) => {
    if (isPickingMode) {
      // Match scanned data with current item
      const itemMatch = allItems.find(item => {
        const sku = item.part_sku || item.sku;
        const gtin = item.part_gtin || item.gtin;
        const lotNumber = item.lot_number;
        return scanData === sku || scanData === gtin || scanData === lotNumber;
      });

      if (itemMatch) {
        const itemKey = itemMatch.blueprint_item_id || itemMatch.transfer_order_item_id;
        setPickedItems(prev => ({ ...prev, [itemKey]: true }));
        setSuccess(`${itemMatch.product_name || itemMatch.part_product_name} scanned!`);
        setTimeout(() => {
          setSuccess('');
          if (currentItemIndex < allItems.length - 1) {
            setCurrentItemIndex(currentItemIndex + 1);
          }
        }, 1500);
      } else {
        setError('Item not found in this order');
        setTimeout(() => setError(''), 3000);
      }
    }

    if (isPackingMode) {
      // Match scanned data with current item
      const itemMatch = allItems.find(item => {
        const sku = item.part_sku || item.sku;
        const gtin = item.part_gtin || item.gtin;
        const lotNumber = item.lot_number;
        return scanData === sku || scanData === gtin || scanData === lotNumber;
      });

      if (itemMatch) {
        const itemKey = itemMatch.blueprint_item_id || itemMatch.transfer_order_item_id;
        setPackedItems(prev => ({ ...prev, [itemKey]: true }));
        setSuccess(`${itemMatch.product_name || itemMatch.part_product_name} verified!`);
        setTimeout(() => {
          setSuccess('');
          if (currentItemIndex < allItems.length - 1) {
            setCurrentItemIndex(currentItemIndex + 1);
          }
        }, 1500);
      } else {
        setError('Item not found in this order');
        setTimeout(() => setError(''), 3000);
      }
    }

    setScannedData('');
  };

  const handleManualEntry = (e) => {
    if (e.key === 'Enter' && scannedData.trim()) {
      e.preventDefault();
      handleScan(scannedData.trim());
    }
  };

  const handleMarkAsPicked = async () => {
    try {
      setLoading(true);
      await axios.put(`${API_BASE}/api/inventory/transfer-orders/${order.transfer_order_id}`, {
        status: 'Picked'
      });
      localStorage.removeItem(`picked_items_${order.transfer_order_id}`);
      setSuccess('Order marked as picked!');
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1000);
    } catch (err) {
      const apiMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        (typeof err.response?.data === 'string' ? err.response.data : '') ||
        err.message ||
        'Failed to mark as picked';
      setError(apiMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPacked = async () => {
    try {
      setLoading(true);
      await axios.put(`${API_BASE}/api/inventory/transfer-orders/${order.transfer_order_id}`, {
        status: 'Packed'
      });
      localStorage.removeItem(`packed_items_${order.transfer_order_id}`);
      setSuccess('Order marked as packed!');
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1000);
    } catch (err) {
      setError('Failed to mark as packed');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsShipped = async () => {
    try {
      setLoading(true);
      await axios.put(`${API_BASE}/api/inventory/transfer-orders/${order.transfer_order_id}`, {
        status: 'Shipped',
        carrier,
        tracking_number: trackingNumber
      });
      setSuccess('Order marked as shipped!');
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1000);
    } catch (err) {
      setError('Failed to mark as shipped');
    } finally {
      setLoading(false);
    }
  };

  const renderPickingInterface = () => {
    const getBinLocation = (item) => {
      // Try to get bin from lines first
      if (item.lines && item.lines[0]) {
        return [item.lines[0].aisle, item.lines[0].rack, item.lines[0].shelf, item.lines[0].bin]
          .filter(Boolean)
          .join('-') || item.lines[0].zone || 'Not assigned';
      }
      // Try to get bin from item directly
      if (item.aisle || item.rack || item.shelf || item.bin) {
        return [item.aisle, item.rack, item.shelf, item.bin]
          .filter(Boolean)
          .join('-') || item.zone || 'Not assigned';
      }
      return 'Not assigned';
    };

    const isPicked = currentItem ? pickedItems[currentItem.blueprint_item_id || currentItem.transfer_order_item_id] : false;

    return (
      <div className="scanner-content">
        <div className="scanner-header">
          <button className="back-button" onClick={onClose}>
            <ArrowLeft size={20} />
            Back to Order
          </button>
          <div className="scanner-title">
            <Package size={24} />
            <div>
              <h2>Picking</h2>
              <p>{order.transfer_order_number}</p>
            </div>
          </div>
        </div>

        <div className="scanner-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(Object.keys(pickedItems).length / allItems.length) * 100}%` }}
            />
          </div>
          <p className="progress-text">
            {Object.keys(pickedItems).length} of {allItems.length} items picked
          </p>
        </div>

        {currentItem && (
          <>
            {/* Item Navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 1.5rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                Item {currentItemIndex + 1} of {allItems.length}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setCurrentItemIndex(Math.max(0, currentItemIndex - 1))}
                  disabled={currentItemIndex === 0}
                  className="nav-btn"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentItemIndex(Math.min(allItems.length - 1, currentItemIndex + 1))}
                  disabled={currentItemIndex === allItems.length - 1}
                  className="nav-btn"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Item Info Card */}
            <div className="current-item-card">
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                  {currentItem.product_name || currentItem.part_product_name || 'Item'}
                </h4>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280', fontFamily: "'SF Mono', Monaco, monospace" }}>
                  SKU: {currentItem.part_sku || currentItem.sku || 'N/A'}
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                  Qty: {currentItem.required_quantity || currentItem.quantity}
                </p>
              </div>

              {/* Bin Location - ALWAYS SHOW */}
              <div className="bin-location-highlight" style={{ marginBottom: '1.5rem' }}>
                <MapPin size={24} />
                <div style={{ flex: 1 }}>
                  <p className="bin-label">Pick From</p>
                  <p className="bin-value">{getBinLocation(currentItem)}</p>
                  <p className="location-name">{order.from_location_name}</p>
                </div>
              </div>

              {/* Status */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '1.5rem'
              }}>
                {isPicked ? (
                  <div className="status-picked">
                    <CheckCircle size={20} />
                    <span>Picked</span>
                  </div>
                ) : (
                  <div className="status-pending">
                    <Clock size={20} />
                    <span>Pending</span>
                  </div>
                )}
              </div>

              {/* Scan Input */}
              <div className="scanner-card" style={{ marginBottom: '1rem' }}>
                <div className="scan-mode-toggle">
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('keyboard');
                      stopCamera();
                    }}
                    className={`scan-mode-btn ${scanMode === 'keyboard' ? 'active' : ''}`}
                  >
                    <Keyboard size={18} />
                    Scanner
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
                  <div className="scan-input-container">
                    <input
                      ref={scanInputRef}
                      type="text"
                      className="scan-input"
                      value={scannedData}
                      onChange={(e) => setScannedData(e.target.value)}
                      onKeyDown={handleManualEntry}
                      placeholder="Scan barcode and press Enter"
                      autoFocus
                    />
                  </div>
                )}

                {scanMode === 'camera' && (
                  <div className="camera-panel">
                    <div className="camera-frame">
                      <video ref={videoRef} />
                      {scanStatus && <div className="camera-status">{scanStatus}</div>}
                    </div>
                    {cameraActive && (
                      <button type="button" onClick={stopCamera} className="btn btn-secondary">
                        Stop Camera
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                className="btn btn-primary btn-full"
                onClick={() => {
                  const itemKey = currentItem.blueprint_item_id || currentItem.transfer_order_item_id;
                  setPickedItems(prev => ({ ...prev, [itemKey]: true }));
                  if (currentItemIndex < allItems.length - 1) {
                    setCurrentItemIndex(currentItemIndex + 1);
                  }
                }}
                disabled={isPicked}
              >
                {isPicked ? 'Already Picked' : 'Mark as Picked'}
              </button>
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div className="action-footer">
          {Object.keys(pickedItems).length === allItems.length ? (
            <button
              className="btn btn-success btn-large btn-full"
              onClick={handleMarkAsPicked}
              disabled={loading}
            >
              <CheckCircle size={20} />
              {loading ? 'Processing...' : 'Complete Picking'}
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-large btn-full"
              onClick={onClose}
            >
              Save Progress & Exit
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
      </div>
    );
  };

  const renderPackingInterface = () => {
    if (isDesktop) {
      return (
        <div className="scanner-content">
          <div className="scanner-header">
            <button className="back-button" onClick={onClose}>
              <ArrowLeft size={20} />
              Back to Order
            </button>
            <div className="scanner-title">
              <Package size={24} />
              <div>
                <h2>Packing Mode</h2>
                <p>{order.transfer_order_number}</p>
              </div>
            </div>
          </div>

          <div className="scanner-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(Object.keys(packedItems).length / allItems.length) * 100}%` }}
              />
            </div>
            <p className="progress-text">
              {Object.keys(packedItems).length} of {allItems.length} items verified for packing
            </p>
          </div>

          {/* DESKTOP TWO-COLUMN LAYOUT */}
          <div className="packing-desktop-layout">
            {/* LEFT: Items List */}
            <div className="packing-desktop-left">
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                Total Items: {allItems.length}
              </h3>
              <div className="desktop-items-list">
                {allItems.map((item, index) => {
                  const itemKey = item.blueprint_item_id || item.transfer_order_item_id;
                  const isActive = index === currentItemIndex;
                  const isVerified = packedItems[itemKey];

                  return (
                    <div
                      key={index}
                      className={`desktop-item-card ${isActive ? 'active' : ''} ${isVerified ? 'verified' : ''}`}
                      onClick={() => setCurrentItemIndex(index)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        {isVerified ? (
                          <CheckCircle size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                          <Clock size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                            {item.product_name || item.part_product_name}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', fontFamily: "'SF Mono', Monaco, monospace" }}>
                            SKU: {item.part_sku || item.sku || 'N/A'}
                          </p>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                            Qty: {item.required_quantity || item.quantity}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Scan Interface + Current Item Details */}
            <div className="packing-desktop-right">
              {/* Scanner Controls */}
              <div className="scanner-card-desktop">
                <div className="scan-mode-toggle-desktop">
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('keyboard');
                      stopCamera();
                    }}
                    className={`scan-mode-btn ${scanMode === 'keyboard' ? 'active' : ''}`}
                  >
                    <Keyboard size={18} />
                    Scanner / Keyboard
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
                  <div className="scan-input-container">
                    <label>Scan Item to Verify</label>
                    <input
                      ref={scanInputRef}
                      type="text"
                      className="scan-input"
                      value={scannedData}
                      onChange={(e) => setScannedData(e.target.value)}
                      onKeyDown={handleManualEntry}
                      placeholder="Scan or type SKU/GTIN/Lot and press Enter"
                      autoFocus
                    />
                    <p className="helper-text">Verify each item before placing in package</p>
                  </div>
                )}

                {scanMode === 'camera' && (
                  <div className="camera-panel">
                    <div className="camera-frame">
                      <video ref={videoRef} />
                      {scanStatus && <div className="camera-status">{scanStatus}</div>}
                    </div>
                    {cameraActive && (
                      <button type="button" onClick={stopCamera} className="btn btn-secondary">
                        Stop Camera
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Current Item Details */}
              {currentItem && (
                <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Current Item ({currentItemIndex + 1} of {allItems.length})
                  </h3>

                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                    {currentItem.product_name || currentItem.part_product_name}
                  </h4>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280', fontFamily: "'SF Mono', Monaco, monospace" }}>
                    SKU: {currentItem.part_sku || currentItem.sku || 'N/A'}
                  </p>
                  <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
                    Quantity to Pack: {currentItem.required_quantity || currentItem.quantity}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
                    <Truck size={20} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Destination</p>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{order.to_location_name}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    {packedItems[currentItem.blueprint_item_id || currentItem.transfer_order_item_id] ? (
                      <div className="status-picked">
                        <CheckCircle size={20} />
                        <span>Verified</span>
                      </div>
                    ) : (
                      <div className="status-pending">
                        <Clock size={20} />
                        <span>Pending</span>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      const itemKey = currentItem.blueprint_item_id || currentItem.transfer_order_item_id;
                      setPackedItems(prev => ({ ...prev, [itemKey]: true }));
                      if (currentItemIndex < allItems.length - 1) {
                        setCurrentItemIndex(currentItemIndex + 1);
                      }
                    }}
                    disabled={packedItems[currentItem.blueprint_item_id || currentItem.transfer_order_item_id]}
                  >
                    Verify & Pack Item
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="action-footer">
            {Object.keys(packedItems).length === allItems.length ? (
              <button
                className="btn btn-success btn-large btn-full"
                onClick={handleMarkAsPacked}
                disabled={loading}
              >
                <CheckCircle size={20} />
                {loading ? 'Processing...' : 'Start Packing'}
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-large btn-full"
                onClick={onClose}
              >
                Mark as Packed (Skip Scanner)
              </button>
            )}
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
        </div>
      );
    }

    // MOBILE LAYOUT (original)
    return (
      <div className="scanner-content">
        <div className="scanner-header">
          <button className="back-button" onClick={onClose}>
            <ArrowLeft size={20} />
            Back to Order
          </button>
          <div className="scanner-title">
            <Package size={24} />
            <div>
              <h2>Packing Mode</h2>
              <p>{order.transfer_order_number}</p>
            </div>
          </div>
        </div>

        <div className="scanner-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(Object.keys(packedItems).length / allItems.length) * 100}%` }}
            />
          </div>
          <p className="progress-text">
            {Object.keys(packedItems).length} of {allItems.length} items verified for packing
          </p>
        </div>

        <div className="scanner-card">
          <div className="scan-mode-toggle">
            <button
              type="button"
              onClick={() => {
                setScanMode('keyboard');
                stopCamera();
              }}
              className={`scan-mode-btn ${scanMode === 'keyboard' ? 'active' : ''}`}
            >
              <Keyboard size={18} />
              Scanner / Keyboard
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
            <div className="scan-input-container">
              <label>Scan Item to Verify</label>
              <input
                ref={scanInputRef}
                type="text"
                className="scan-input"
                value={scannedData}
                onChange={(e) => setScannedData(e.target.value)}
                onKeyDown={handleManualEntry}
                placeholder="Scan or type SKU/GTIN/Lot and press Enter"
                autoFocus
              />
              <p className="helper-text">Verify each item before placing in package</p>
            </div>
          )}

          {scanMode === 'camera' && (
            <div className="camera-panel">
              <div className="camera-frame">
                <video ref={videoRef} />
                {scanStatus && <div className="camera-status">{scanStatus}</div>}
              </div>
              {cameraActive && (
                <button type="button" onClick={stopCamera} className="btn btn-secondary">
                  Stop Camera
                </button>
              )}
            </div>
          )}
        </div>

        {currentItem && (
          <div className="current-item-card">
            <div className="item-header">
              <h3>Current Item ({currentItemIndex + 1} of {allItems.length})</h3>
              <div className="item-navigation">
                <button
                  onClick={() => setCurrentItemIndex(Math.max(0, currentItemIndex - 1))}
                  disabled={currentItemIndex === 0}
                  className="nav-btn"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentItemIndex(Math.min(allItems.length - 1, currentItemIndex + 1))}
                  disabled={currentItemIndex === allItems.length - 1}
                  className="nav-btn"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="item-details">
              <div className="item-info">
                <h4>{currentItem.product_name || currentItem.part_product_name}</h4>
                <p className="item-sku">SKU: {currentItem.part_sku || currentItem.sku || 'N/A'}</p>
                <p className="item-quantity">
                  Quantity to Pack: {currentItem.required_quantity || currentItem.quantity}
                </p>
              </div>

              {currentItem.lines && currentItem.lines[0] && (
                <div className="bin-location-highlight">
                  <MapPin size={20} />
                  <div>
                    <p className="bin-label">Picked From</p>
                    <p className="bin-value">
                      {[
                        currentItem.lines[0].aisle,
                        currentItem.lines[0].rack,
                        currentItem.lines[0].shelf,
                        currentItem.lines[0].bin
                      ]
                        .filter(Boolean)
                        .join('-') || currentItem.lines[0].zone || 'No bin assigned'}
                    </p>
                    <p className="location-name">{order.from_location_name}</p>
                  </div>
                </div>
              )}

              <div className="info-card" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Truck size={16} style={{ color: '#6b7280' }} />
                  <h3 style={{ margin: 0 }}>Destination</h3>
                </div>
                <p className="destination-name">{order.to_location_name}</p>
                <p className="destination-type">{order.to_location_type}</p>
              </div>

              <div className="item-status">
                {packedItems[currentItem.blueprint_item_id || currentItem.transfer_order_item_id] ? (
                  <div className="status-picked">
                    <CheckCircle size={20} />
                    <span>Verified</span>
                  </div>
                ) : (
                  <div className="status-pending">
                    <Clock size={20} />
                    <span>Pending</span>
                  </div>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                const itemKey = currentItem.blueprint_item_id || currentItem.transfer_order_item_id;
                setPackedItems(prev => ({ ...prev, [itemKey]: true }));
                if (currentItemIndex < allItems.length - 1) {
                  setCurrentItemIndex(currentItemIndex + 1);
                }
              }}
              disabled={packedItems[currentItem.blueprint_item_id || currentItem.transfer_order_item_id]}
            >
              Verify & Pack Item
            </button>
          </div>
        )}

        <div className="action-footer">
          {Object.keys(packedItems).length === allItems.length ? (
            <button
              className="btn btn-success btn-large"
              onClick={handleMarkAsPacked}
              disabled={loading}
            >
              <CheckCircle size={20} />
              {loading ? 'Processing...' : 'Complete Packing - Mark Order as Packed'}
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-large"
              onClick={onClose}
            >
              Save Progress & Exit
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
      </div>
    );
  };

  const renderShippingInterface = () => {
    const commonCarriers = ['FedEx', 'UPS', 'USPS', 'DHL', 'OnTrac', 'Other'];

    return (
      <div className="scanner-content">
        <div className="scanner-header">
          <button className="back-button" onClick={onClose}>
            <ArrowLeft size={20} />
            Back to Order
          </button>
          <div className="scanner-title">
            <Truck size={24} />
            <div>
              <h2>Shipping Information</h2>
              <p>{order.transfer_order_number}</p>
            </div>
          </div>
        </div>

        <div className="info-card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '2px solid #86efac' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <CheckCircle size={20} style={{ color: '#10b981' }} />
            <h3 style={{ margin: 0, color: '#065f46' }}>Package Ready for Shipment</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #86efac' }}>
              <span style={{ color: '#065f46', fontSize: '0.875rem' }}>From:</span>
              <strong style={{ color: '#065f46' }}>{order.from_location_name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #86efac' }}>
              <span style={{ color: '#065f46', fontSize: '0.875rem' }}>To:</span>
              <strong style={{ color: '#065f46' }}>{order.to_location_name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #86efac' }}>
              <span style={{ color: '#065f46', fontSize: '0.875rem' }}>Items Packed:</span>
              <strong style={{ color: '#065f46' }}>{allItems.length} items</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#065f46', fontSize: '0.875rem' }}>Priority:</span>
              <strong style={{ color: '#065f46', textTransform: 'uppercase' }}>{order.priority}</strong>
            </div>
          </div>
        </div>

        <div className="packing-info">
          <div className="info-card">
            <h3>Package Contents</h3>
            <div className="items-list">
              {allItems.map((item, index) => (
                <div key={index} className="packed-item">
                  <Package size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p className="item-name">{item.product_name || item.part_product_name}</p>
                    <p className="item-meta">
                      Qty: {item.required_quantity || item.quantity} |{' '}
                      SKU: {item.part_sku || item.sku || 'N/A'}
                      {item.lot_number && ` | Lot: ${item.lot_number}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shipping-form">
          <div className="form-group">
            <label>Carrier *</label>
            <select
              className="form-input"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              style={{
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
                paddingRight: '2.5rem'
              }}
            >
              <option value="">Select a carrier...</option>
              {commonCarriers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tracking Number</label>
            <input
              type="text"
              className="form-input"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number (optional)"
              style={{ fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace" }}
            />
            <p className="helper-text">Optional - can be added later if not available</p>
          </div>
        </div>

        <div className="action-footer">
          <button
            className="btn btn-success btn-large btn-full"
            onClick={handleMarkAsShipped}
            disabled={loading || !carrier}
          >
            <Truck size={20} />
            {loading ? 'Processing...' : 'Complete Shipment'}
          </button>
          {!carrier && (
            <p className="helper-text" style={{ color: '#dc2626', fontWeight: 500 }}>
              Please select a carrier to continue
            </p>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
      </div>
    );
  };

  return (
    <div className="scanner-overlay">
      <div className="scanner-container">
        {isPickingMode && renderPickingInterface()}
        {isPackingMode && renderPackingInterface()}
        {isShippingMode && renderShippingInterface()}
      </div>
    </div>
  );
};

export default TransferOrderScanner;
