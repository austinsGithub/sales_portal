import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { Plus, Send, X, Trash2, FileText, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import LineItems from './PurchaseOrderLineItems';
import '../../../css/global/ListPanel.css';
import './PurchaseOrders.css';

// Import shared components
import StatusBadge from '../../../components/StatusBadge';
import ListItem from '../../../components/ListItem';
const PAGE_SIZE = 10;

const buildApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = base.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return cleanEndpoint ? `${cleanBase}/${cleanEndpoint}` : cleanBase;
};

const API_BASE = buildApiUrl('api/procurement/purchase_orders');

const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) console.warn('No auth token found in localStorage');
  return token || '';
};


// Add Purchase Order Modal
function AddPurchaseOrderModal({ open, onClose, onCreated, authTokenStr }) {
  const { user, hasPermission } = useAuth();
  
  // Debug logging
  console.log('User permissions:', user?.permissions);
  const canCreatePO = hasPermission('procurement.purchase_orders.create');
  console.log('Can create PO:', canCreatePO, 'for permission: procurement.purchase_orders.create');
  // State declarations at the top, before any conditional logic
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [createAnother, setCreateAnother] = useState(false);
  // Define standard payment terms options
  const paymentTermsOptions = [
    { value: '', label: 'Select payment terms...' },
    { value: 'Net 15', label: 'Net 15' },
    { value: 'Net 30', label: 'Net 30' },
    { value: 'Net 60', label: 'Net 60' },
    { value: 'Due on Receipt', label: 'Due on Receipt' },
    { value: '2% 10 Net 30', label: '2% 10 Net 30' },
    { value: 'custom', label: 'Custom Terms...' }
  ];

  // Define carrier options
  const carrierOptions = [
    { value: '', label: 'Select carrier...' },
    { value: 'UPS', label: 'UPS' },
    { value: 'FedEx', label: 'FedEx' },
    { value: 'USPS', label: 'USPS' },
    { value: 'DHL', label: 'DHL' },
    { value: 'LTL', label: 'LTL Freight' },
    { value: 'Other', label: 'Other...' }
  ];

  const [form, setForm] = useState({
    supplier_id: '',
    ship_to_location_id: '',
    order_date: new Date().toISOString().split('T')[0],
    requested_delivery_date: '',
    terms: '',
    custom_terms: '',
    shipping_method: '',
    carrier: '',
    tracking_number: '',
    tax_amount: 0,
    shipping_amount: 0,
  });
  
  const [showCustomTerms, setShowCustomTerms] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);

  // Mounting and cleanup
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      setHasFetchedData(false);
      setIsReady(false);
    };
  }, []);

  // Check for required user info and set ready state
  useEffect(() => {
    if (!open || !isMounted) return;
    
    console.log('User data in AddPurchaseOrderModal:', user); // Debug log
    
    if (!user) {
      console.error('No user object available');
      setErr('User session not found. Please log in again.');
      setIsReady(false);
      return;
    }
    
    if (!user.company_id) {
      console.error('User object missing company_id:', user);
      setErr('Your account is not associated with a company. Please contact your administrator.');
      setIsReady(false);
      return;
    }
    
    console.log('User has valid company_id:', user.company_id);
    setErr('');
    setIsReady(true);
  }, [user, open, isMounted]);

  // Fetch suppliers and locations when component is ready and open
  useEffect(() => {
    if (!isReady || !open || hasFetchedData) return;

    const fetchData = async () => {
      try {
        // Fetch suppliers
        const suppliersUrl = buildApiUrl('api/procurement/suppliers/search');
        const suppliersRes = await fetch(suppliersUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokenStr}`
          }
        });
        
        // Fetch locations
        const locationsUrl = buildApiUrl('api/inventory/locations');
        const locationsRes = await fetch(locationsUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authTokenStr}`
          }
        });

        // Process suppliers response
        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json();
          const filteredSuppliers = Array.isArray(suppliersData) 
            ? suppliersData 
            : (suppliersData.data || []);
          setSuppliers(filteredSuppliers.filter(s => s.is_active));
        } else {
          console.error('Failed to fetch suppliers:', suppliersRes.status);
          setSuppliers([]);
        }

        // Process locations response
        if (locationsRes.ok) {
          const locationsData = await locationsRes.json();
          const filteredLocations = Array.isArray(locationsData)
            ? locationsData
            : (locationsData.data || []);
          setLocations(filteredLocations.filter(l => l.is_active));
        } else {
          console.error('Failed to fetch locations:', locationsRes.status);
          setLocations([]);
        }

        setHasFetchedData(true);
      } catch (error) {
        console.error('Error fetching data:', error);
        setErr('Failed to load required data. Please try again.');
      }
    };

    fetchData();
  }, [isReady, open, authTokenStr, hasFetchedData]);

  
  const shouldRender = open && isMounted;

  if (!shouldRender) return null;

  const change = (e) => {
    const { name, value } = e.target;
    const processedValue = (name === 'supplier_id' || name === 'ship_to_location_id')
      ? value === '' ? '' : Number(value)
      : value;
    setForm(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    // Check permissions again in case they changed
    if (!canCreatePO) {
      setErr('You do not have permission to create purchase orders');
      return;
    }
    
    setSubmitting(true);
    setErr('');

    if (!form.supplier_id) {
      setErr('Supplier is required.');
      return;
    }
    if (!user?.company_id) {
      setErr('User company information is not available. Please log in again.');
      return;
    }

    try {
      setSubmitting(true);
      setErr('');

      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authTokenStr}`
        },
        body: JSON.stringify({
          ...form,
          supplier_id: Number(form.supplier_id),
          ship_to_location_id: form.ship_to_location_id ? Number(form.ship_to_location_id) : null,
          company_id: user.company_id,
          created_by: user.user_id,
          status: 'draft',
          tax_amount: parseFloat(form.tax_amount) || 0,
          shipping_amount: parseFloat(form.shipping_amount) || 0
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create purchase order');
      }

      const data = await response.json();
      
      // Reset form on success
      setForm({
        supplier_id: '',
        ship_to_location_id: '',
        order_date: new Date().toISOString().split('T')[0],
        requested_delivery_date: '',
        terms: '',
        custom_terms: '',
        shipping_method: '',
        carrier: '',
        tracking_number: '',
        tax_amount: 0,
        shipping_amount: 0,
      });
      setShowCustomTerms(false);
      
      if (typeof onCreated === 'function') {
        onCreated(data);
      }
      
      // Only close modal if user doesn't want to create another
      if (!createAnother && typeof onClose === 'function') {
        onClose();
      }
    } catch (error) {
      console.error('Error creating purchase order:', error);
      setErr(error.message || 'Failed to create purchase order');
    } finally {
      if (isMounted) {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal po-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Purchase Order</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {err && <div className="error-banner">Error: {err}</div>}

        <form onSubmit={handleSubmit} className="modal-body grid-2">
          <label>Supplier *
            <select
              name="supplier_id"
              value={form.supplier_id}
              onChange={change}
              required
            >
              <option value="" disabled>Select supplier...</option>
              {suppliers.map(s => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name} {s.supplier_code && `(${s.supplier_code})`}
                </option>
              ))}
            </select>
          </label>
          <label>Ship To Location
            <select
              name="ship_to_location_id"
              value={form.ship_to_location_id}
              onChange={change}
            >
              <option value="">Select location...</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.location_name || `Location ${location.location_id}`}
                </option>
              ))}
            </select>
          </label>
          <label>Order Date *
            <input
              type="date"
              name="order_date"
              value={form.order_date}
              onChange={change}
              required
            />
          </label>
          <label>Requested Delivery Date
            <input
              type="date"
              name="requested_delivery_date"
              value={form.requested_delivery_date}
              onChange={change}
            />
          </label>
          <div className="form-group col-span-2">
            <h3 className="text-lg font-medium mb-2">Payment Terms</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label>Standard Terms
                  <select
                    name="terms"
                    value={form.terms}
                    onChange={change}
                    className="w-full"
                  >
                    {paymentTermsOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {showCustomTerms && (
                <label>Custom Terms
                  <input
                    type="text"
                    name="custom_terms"
                    value={form.custom_terms}
                    onChange={change}
                    placeholder="Enter custom payment terms"
                    className="w-full"
                  />
                </label>
              )}
            </div>
          </div>
          
          <div className="form-group col-span-2">
            <h3 className="text-lg font-medium mb-2">Shipping Information</h3>
            <div className="grid grid-cols-3 gap-4">
              <label>Carrier
                <select
                  name="carrier"
                  value={form.carrier}
                  onChange={change}
                  className="w-full"
                >
                  {carrierOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>Shipping Method
                <input
                  type="text"
                  name="shipping_method"
                  value={form.shipping_method}
                  onChange={change}
                  placeholder="e.g., Ground, 2-Day Air"
                  className="w-full"
                />
              </label>
              <label>Tracking #
                <input
                  type="text"
                  name="tracking_number"
                  value={form.tracking_number}
                  onChange={change}
                  placeholder="Optional tracking number"
                  className="w-full"
                />
              </label>
            </div>
          </div>
          <label>Tax Amount
            <input
              type="number"
              step="0.01"
              name="tax_amount"
              value={form.tax_amount}
              onChange={change}
              placeholder="0.00"
            />
          </label>
          <label>Shipping Amount
            <input
              type="number"
              step="0.01"
              name="shipping_amount"
              value={form.shipping_amount}
              onChange={change}
              placeholder="0.00"
            />
          </label>

          <div className="modal-actions col-span-2">
            <div className="flex items-center justify-between w-full">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAnother}
                  onChange={(e) => setCreateAnother(e.target.checked)}
                  className="w-4 h-4"
                  disabled={submitting}
                />
                <span className="text-sm text-gray-700">Create another after this one</span>
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Purchase Order'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Purchase Order Details Component
function PurchaseOrderDetails({ po, onEdit, onApprove, onSend, onReject }) {
  const { hasPermission } = useAuth();
  const canEditPO = hasPermission('procurement.purchase_orders.edit');
  const canApprovePO = hasPermission('procurement.purchase_orders.approve');
  const canSendPO = hasPermission('procurement.purchase_orders.send');
  const canRejectPO = hasPermission('procurement.purchase_orders.reject');
  const hasLineData = Array.isArray(po.lines) && po.lines.length > 0;
  const computedLineSubtotal = hasLineData
    ? po.lines.reduce((sum, line) => {
        const qty = Number(line.quantity_ordered || 0);
        const unit = Number(line.unit_price || line.unit_cost || 0);
        return sum + qty * unit;
      }, 0)
    : null;
  const subtotal = computedLineSubtotal ?? Number(po.subtotal ?? 0);
  const taxAmount = Number(po.tax_amount ?? 0);
  const shippingAmount = Number(po.shipping_amount ?? 0);
  const total = computedLineSubtotal !== null
    ? subtotal + taxAmount + shippingAmount
    : Number(po.total_amount ?? 0);
  return (
    <section className="po-detail-panel">
      <div className="po-detail-card">
        <header className="po-detail-header">
          <div>
            <h2>Purchase Order #{po.po_number || po.purchase_order_id}</h2>
            <p className="po-detail-subtitle">
              Last updated: {po.updated_at ? new Date(po.updated_at).toLocaleString() : '—'}
            </p>
          </div>
        <div className="po-detail-actions">
          {po.status === 'draft' && canApprovePO && (
            <button 
              className="btn btn-success"
              onClick={() => {
                if (window.confirm('Approve this purchase order? This will change its status to approved.')) {
                  onApprove(po.purchase_order_id);
                }
              }}
              title="Approve purchase order"
            >
              Approve
            </button>
          )}
          {po.status === 'draft' && canRejectPO && (
            <button 
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm('Reject this purchase order? This will mark the document as rejected.')) {
                  onReject(po.purchase_order_id);
                }
              }}
              title="Reject purchase order"
            >
              Reject
            </button>
          )}
          {po.status === 'approved' && canSendPO && (
            <button 
              className="btn btn-primary"
              onClick={() => {
                if (window.confirm('Mark this purchase order as sent to supplier? This will update the status and record when it was sent.')) {
                  onSend(po.purchase_order_id);
                }
              }}
              title="Mark as sent to supplier"
            >
              <Send size={16} /> Mark as Sent to Supplier
            </button>
          )}
          {po.status === 'draft' && (
            <button 
              className="btn btn-secondary" 
              onClick={onEdit}
              disabled={!canEditPO}
              title={!canEditPO ? "You don't have permission to edit purchase orders" : "Edit purchase order"}
            >
              Edit
            </button>
          )}
        </div>
        </header>

      <div className="po-detail-body">
        <div className="po-detail-table">
        <div className="po-detail-row">
          <span className="label">PO Number:</span>
          <span className="value">{po.po_number}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Status:</span>
          <span className="value"><StatusBadge status={po.status} /></span>
        </div>
        <div className="po-detail-row">
          <span className="label">Supplier:</span>
          <span className="value">{po.supplier_name} {po.supplier_code && `(${po.supplier_code})`}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Ship To:</span>
          <span className="value">{po.ship_to_location_name || 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Order Date:</span>
          <span className="value">{po.order_date ? new Date(po.order_date).toLocaleDateString() : 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Requested Delivery:</span>
          <span className="value">{po.requested_delivery_date ? new Date(po.requested_delivery_date).toLocaleDateString() : 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Payment Terms:</span>
          <span className="value">{po.terms || 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Shipping Method:</span>
          <span className="value">{po.shipping_method || 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Buyer:</span>
          <span className="value">{po.buyer_name || 'N/A'}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Created:</span>
          <span className="value">{new Date(po.created_at).toLocaleString()}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Updated:</span>
          <span className="value">{new Date(po.updated_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="po-summary-table">
        <div className="po-detail-row">
          <span className="label">Subtotal:</span>
          <span className="value font-semibold">${subtotal.toFixed(2)}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Tax:</span>
          <span className="value">${taxAmount.toFixed(2)}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Shipping:</span>
          <span className="value">${shippingAmount.toFixed(2)}</span>
        </div>
        <div className="po-detail-row">
          <span className="label">Total:</span>
          <span className="value font-bold text-lg">${total.toFixed(2)}</span>
        </div>
      </div>
      </div>
      </div>
    </section>
  );
}

// Purchase Order Edit Form Component
function PurchaseOrderForm({ po, onCancel, onSave }) {
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    supplier_id: po.supplier_id || '',
    ship_to_location_id: po.ship_to_location_id || '',
    order_date: po.order_date ? po.order_date.split('T')[0] : '',
    requested_delivery_date: po.requested_delivery_date ? po.requested_delivery_date.split('T')[0] : '',
    terms: po.terms || '',
    shipping_method: po.shipping_method || '',
    tax_amount: po.tax_amount || 0,
    shipping_amount: po.shipping_amount || 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const token = getAuthToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch suppliers
        const suppliersUrl = buildApiUrl('api/procurement/suppliers/search');
        const suppliersRes = await fetch(suppliersUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          }
        });
        
        // Fetch locations
        const locationsUrl = buildApiUrl('api/inventory/locations');
        const locationsRes = await fetch(locationsUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          }
        });

        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json();
          const filteredSuppliers = Array.isArray(suppliersData) 
            ? suppliersData 
            : (suppliersData.data || []);
          setSuppliers(filteredSuppliers.filter(s => s.is_active));
        }

        if (locationsRes.ok) {
          const locationsData = await locationsRes.json();
          const filteredLocations = Array.isArray(locationsData)
            ? locationsData
            : (locationsData.data || []);
          setLocations(filteredLocations.filter(l => l.is_active));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [token]);

  const change = (e) => {
    const { name, value } = e.target;
    const processedValue = (name === 'supplier_id' || name === 'ship_to_location_id')
      ? value === '' ? '' : Number(value)
      : value;
    setForm(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      await onSave({
        supplier_id: Number(form.supplier_id),
        ship_to_location_id: form.ship_to_location_id ? Number(form.ship_to_location_id) : null,
        order_date: form.order_date,
        requested_delivery_date: form.requested_delivery_date || null,
        terms: form.terms,
        shipping_method: form.shipping_method,
        tax_amount: parseFloat(form.tax_amount) || 0,
        shipping_amount: parseFloat(form.shipping_amount) || 0
      });
    } catch (error) {
      console.error('Error updating purchase order:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="detail-section">
      <div className="detail-header">
        <h2>Edit Purchase Order #{po.po_number || po.purchase_order_id}</h2>
      </div>

      <form onSubmit={handleSubmit} className="grid-2 gap-4">
        <label>Supplier *
          <select
            name="supplier_id"
            value={form.supplier_id}
            onChange={change}
            required
          >
            <option value="" disabled>Select supplier...</option>
            {suppliers.map(s => (
              <option key={s.supplier_id} value={s.supplier_id}>
                {s.supplier_name} {s.supplier_code && `(${s.supplier_code})`}
              </option>
            ))}
          </select>
        </label>
        <label>Ship To Location
          <select
            name="ship_to_location_id"
            value={form.ship_to_location_id}
            onChange={change}
          >
            <option value="">Select location...</option>
            {locations.map((location) => (
              <option key={location.location_id} value={location.location_id}>
                {location.location_name || `Location ${location.location_id}`}
              </option>
            ))}
          </select>
        </label>
        <label>Order Date *
          <input
            type="date"
            name="order_date"
            value={form.order_date}
            onChange={change}
            required
          />
        </label>
        <label>Requested Delivery Date
          <input
            type="date"
            name="requested_delivery_date"
            value={form.requested_delivery_date}
            onChange={change}
          />
        </label>
        <label>Payment Terms
          <input
            name="terms"
            value={form.terms}
            onChange={change}
            placeholder="e.g., Net 30, 2/10 Net 30"
          />
        </label>
        <label>Shipping Method
          <input
            name="shipping_method"
            value={form.shipping_method}
            onChange={change}
            placeholder="e.g., Ground, 2-Day Air"
          />
        </label>
        <label>Tax Amount
          <input
            type="number"
            step="0.01"
            name="tax_amount"
            value={form.tax_amount}
            onChange={change}
            placeholder="0.00"
          />
        </label>
        <label>Shipping Amount
          <input
            type="number"
            step="0.01"
            name="shipping_amount"
            value={form.shipping_amount}
            onChange={change}
            placeholder="0.00"
          />
        </label>

        <div className="flex gap-2 col-span-2 mt-4">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Main Component
export default function PurchaseOrders() {
  const { user, hasPermission } = useAuth();
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [typing, setTyping] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [openAdd, setOpenAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const token = getAuthToken();
  
  const canApprovePO = hasPermission('procurement.purchase_orders.approve');
  const canSendPO = hasPermission('procurement.purchase_orders.send');

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const debouncedQuery = useMemo(() => {
    const timerId = setTimeout(() => typing, 500);
    return () => clearTimeout(timerId);
  }, [typing]);

  useEffect(() => {
    debouncedQuery();
  }, [debouncedQuery]);

  const fetchPOs = async () => {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({
        q: typing,
        offset: String(offset),
        limit: String(PAGE_SIZE)
      });
      if (statusFilter) params.append('status', statusFilter);

      const url = `${API_BASE}/search?${params}`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = Array.isArray(json) ? json : (json.data || []);
      const pagination = json.pagination || {};

      setPos(data);
      setHasMore(pagination.hasMore ?? (data.length === PAGE_SIZE));
      setTotalCount(pagination.total ?? data.length);
    } catch (e) {
      setErr(e.message || 'Failed to load purchase orders');
      console.error('Error fetching POs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
  }, [offset, typing, statusFilter]);

  const fetchDetail = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelected({
        ...data.order,
        lines: data.lines || []
      });
    } catch (e) {
      console.error('Error fetching PO detail:', e);
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setSelected(null);
    }
  }, [selectedId]);

  const handleCreated = (created) => {
    setOffset(0);
    fetchPOs();
    setSelectedId(created.purchase_order_id);
    // Refresh details to show the newly created PO with lines
    if (created.purchase_order_id) {
      fetchDetail(created.purchase_order_id);
    }
  };

  const saveGeneral = async (id, patch) => {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error('Failed to update purchase order');
      await fetchDetail(id);
      await fetchPOs();
      setIsEditing(false);
    } catch (e) {
      setErr(e.message);
    }
  };
  
  const sendToSupplier = async (poId) => {
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }

      const response = await fetch(`${API_BASE}/${poId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to send purchase order to supplier');
      }

      // Refresh the purchase order details and list
      if (selectedId === poId) {
        fetchDetail(poId);
      }
      fetchPOs();
      
      alert('Purchase order sent to supplier successfully');
    } catch (error) {
      console.error('Error sending purchase order:', error);
      alert(`Error sending purchase order: ${error.message}`);
    }
  };

  const approvePO = async (poId) => {
    try {
      // First, get the PO details to check the number of items
      const poResponse = await fetch(`${API_BASE}/${poId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!poResponse.ok) {
        throw new Error('Failed to fetch PO details');
      }
      
      const poData = await poResponse.json();
      
      // Check if PO has 0 items
      if (!poData.lines || poData.lines.length === 0) {
        alert('Cannot approve a purchase order with 0 items');
        return;
      }

      // Proceed with approval if there are items
      const response = await fetch(`${API_BASE}/${poId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to approve purchase order');
      }

      // Refresh the purchase order details and list
      if (selectedId === poId) {
        fetchDetail(poId);
      }
      fetchPOs();
      
      alert('Purchase order approved successfully');
    } catch (error) {
      console.error('Error approving purchase order:', error);
      alert(`Error approving purchase order: ${error.message}`);
    }
  };

  const rejectPO = async (poId) => {
    try {
      const response = await fetch(`${API_BASE}/${poId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || data?.message || 'Failed to reject purchase order');
      }

      if (selectedId === poId) {
        fetchDetail(poId);
      }
      fetchPOs();

      alert('Purchase order rejected');
    } catch (error) {
      console.error('Error rejecting purchase order:', error);
      alert(`Error rejecting purchase order: ${error.message}`);
    }
  };

  // Generate biomedical purchase order PDF (client-side)
  // Generate biomedical purchase order PDF (client-side, NO autoTable)
  const generatePDF = () => {
    if (!selected) return;
    
    // Debug logs to inspect the selected object
    console.log('DEBUG PO OBJECT:', selected);
    console.log('ORDER DATE:', selected.order_date);
    console.log('REQUESTED DELIVERY DATE:', selected.requested_delivery_date);
    console.log('ORDER nested:', selected.order?.requested_delivery_date);
    
    // More robust normalization that checks if selected.order has any data
    const po = (selected.order && Object.keys(selected.order).length > 0)
      ? selected.order
      : selected;
    
    const lines = selected.lines ?? [];
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let y = 20;
      
      // Helper to check if we need new page
      const checkPage = (space) => {
        if (y + space > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }
      };
      
      // ===== HEADER =====
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' });
      y += 6;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(' Procurement', pageWidth / 2, y, { align: 'center' });
      y += 10;
      
      // FDA/ISO Compliance Notice - Critical
      doc.setFontSize(7);
      doc.setTextColor(153, 27, 27);
      doc.setFont('helvetica', 'bold');
      const complianceNotice = 'REGULATORY COMPLIANCE NOTICE: This purchase order is issued pursuant to FDA Quality System Regulation 21 CFR 820.50 and ISO 13485:2016 §7.4.2. All supplied products must meet specifications stated herein and comply with applicable FDA, CE/MDR, and ISO standards. Supplier must provide written notification of any design, material, or process changes as required by quality system regulations.';
      const complianceLines = doc.splitTextToSize(complianceNotice, pageWidth - 30);
      doc.text(complianceLines, 15, y);
      y += complianceLines.length * 2.5 + 8;
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      // ===== PO INFO BOX =====
      checkPage(40);
      
      // Header background
      doc.setFillColor(243, 244, 246);
      doc.rect(15, y, pageWidth - 30, 35, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.rect(15, y, pageWidth - 30, 35);
      
      doc.setFontSize(9);
      
      // Row 1
      doc.setFont('helvetica', 'bold');
      doc.text('PO Number:', 20, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.text(po.po_number || 'N/A', 50, y + 7);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Revision:', 110, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.text('Rev. 0', 135, y + 7);
      
      // Row 2
      doc.setFont('helvetica', 'bold');
      doc.text('Issue Date:', 20, y + 14);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(po.order_date).toLocaleDateString(), 50, y + 14);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Required Date:', 110, y + 14);
      doc.setFont('helvetica', 'normal');
      
      // Check multiple possible field names for required date
      const requiredDate = 
        selected.requested_delivery_date ?? 
        po.requested_delivery_date ?? 
        po.required_date ?? 
        null;
      
      doc.text(
        requiredDate
          ? new Date(requiredDate).toLocaleDateString()
          : 'TBD',
        145, y + 14
      );
      
      // Row 3
      doc.setFont('helvetica', 'bold');
      doc.text('Status:', 20, y + 21);
      doc.setFont('helvetica', 'normal');
      doc.text((po.status || 'draft').toUpperCase(), 50, y + 21);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Created By:', 110, y + 21);
      doc.setFont('helvetica', 'normal');
      doc.text(po.created_by_name || 'N/A', 135, y + 21);
      
      // Row 4 - Payment & Terms
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Terms:', 20, y + 28);
      doc.setFont('helvetica', 'normal');
      doc.text(po.terms || 'Net 30', 55, y + 28);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Incoterms:', 110, y + 28);
      doc.setFont('helvetica', 'normal');
      doc.text(po.shipping_method || 'FCA', 135, y + 28);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Currency:', 160, y + 28);
      doc.setFont('helvetica', 'normal');
      doc.text('USD', 180, y + 28);
      
      y += 45;
      
      // ===== ADDRESSES =====
      checkPage(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Supplier:', 20, y);
      doc.text('Ship To:', 110, y);
      y += 6;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(po.supplier_name ?? 'N/A', 20, y);
      doc.text(po.ship_to_location_name ?? 'N/A', 110, y);
      y += 20;
      
      // ===== LINE ITEMS TABLE =====
      checkPage(50);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Line Items', 20, y);
      y += 8;
      
      // Table header with better styling
      const headerY = y;
      doc.setFillColor(17, 24, 39);
      doc.rect(15, headerY, pageWidth - 30, 10, 'F');
      
      // Column positions computed from page width
      const tableX = 15;
      const tableW = pageWidth - 30;
      const gap = 1; // ultra-tight spacing between columns
      const skuW = 28;
      const gtinW = 35;
      const qtyW = 20;
      const uomW = 20;
      const priceW = 28;
      const fixedW = skuW + gtinW + qtyW + uomW + priceW + gap * 5; // 5 gaps between 6 cols
      const rightPad = 10; // minimal right padding
      const usableW = tableW - rightPad;
      const descW = Math.max(40, Math.min(90, usableW - fixedW)); // tighter cap so trailing cols sit closer
      const colStart = tableX + 2; // slightly reduce left padding
      const cols = {
        sku: colStart,
        desc: colStart + skuW + gap,
        gtin: colStart + skuW + gap + descW + gap,
        qty:  colStart + skuW + gap + descW + gap + gtinW + gap,
        uom:  colStart + skuW + gap + descW + gap + gtinW + gap + qtyW + gap,
        price: colStart + skuW + gap + descW + gap + gtinW + gap + qtyW + gap + uomW + gap,
        widths: { skuW, descW, gtinW, qtyW, uomW, priceW }
      };
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text('SKU', cols.sku, headerY + 6.5);
      doc.text('DESCRIPTION', cols.desc, headerY + 6.5);
      doc.text('GTIN', cols.gtin + cols.widths.gtinW / 2, headerY + 6.5, { align: 'center' });
      doc.text('QTY', cols.qty + cols.widths.qtyW / 2, headerY + 6.5, { align: 'center' });
      doc.text('UOM', cols.uom + cols.widths.uomW / 2, headerY + 6.5, { align: 'center' });
      doc.text('UNIT PRICE', cols.price + cols.widths.priceW, headerY + 6.5, { align: 'right' });
      
      y += 12;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      // Table rows
      const lines = selected.lines ?? [];
      doc.setFontSize(7.5);
      
      if (lines.length === 0) {
        // Empty state
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y, pageWidth - 30, 20, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.rect(15, y, pageWidth - 30, 20);
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9);
        doc.text('No line items found', pageWidth / 2, y + 12, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7.5);
        y += 20;
      } else {
        lines.forEach((line, idx) => {
          const hasNotes = line.line_notes && line.line_notes.trim().length > 0;
          const hasDescription = line.description && line.description.trim().length > 0;

          // Map line item data early so we can measure wrapped heights
          const sku = (line.sku ?? 'N/A').substring(0, 12);
          const partName = (line.part_name ?? '').substring(0, 120);
          const partDescription = (line.description ?? '').substring(0, 300);
          const gtin = line.gtin || '';
          const qty = Number(line.quantity_ordered ?? 0);
          const unitPrice = Number(line.unit_price ?? 0);
          const lineTotal = Number(line.line_total ?? qty * unitPrice);

          // Recompute columns (match header)
          const tableX = 15;
          const tableW = pageWidth - 30;
          const gap = 2; // match tighter spacing
          const skuW = 28;
          const gtinW = 35;
          const qtyW = 20;
          const uomW = 20;
          const priceW = 32;
          const fixedW = skuW + gtinW + qtyW + uomW + priceW + gap * 5;
          const rightPad = 20;
          const usableW = tableW - rightPad;
          const descW = Math.max(40, Math.min(100, usableW - fixedW));
          const colStart = tableX + 2; // match header padding
          const cols = {
            sku: colStart,
            desc: colStart + skuW + gap,
            gtin: colStart + skuW + gap + descW + gap,
            qty:  colStart + skuW + gap + descW + gap + gtinW + gap,
            uom:  colStart + skuW + gap + descW + gap + gtinW + gap + qtyW + gap,
            price: colStart + skuW + gap + descW + gap + gtinW + gap + qtyW + gap + uomW + gap,
            widths: { skuW, descW, gtinW, qtyW, uomW, priceW }
          };

          const descWidth = cols.widths.descW;
          // We will not show part name in description column
          const partNameLines = [];
          const descLines = hasDescription ? doc.splitTextToSize(partDescription, descWidth) : [];
          const noteText = hasNotes ? `Note: ${line.line_notes.substring(0, 200)}` : '';
          const noteLines = hasNotes ? doc.splitTextToSize(noteText, descWidth) : [];

          // Compute dynamic row height (first line holds description at 8pt)
          let rowHeight = 10; // base for first line
          if (descLines.length > 0) {
            rowHeight += 8; // first line
            const moreCount = Math.max(0, descLines.length - 1);
            if (moreCount > 0) rowHeight += moreCount * 7 + 2;
          }
          if (noteLines.length > 0) rowHeight += noteLines.length * 7 + 2;

          checkPage(rowHeight + 2);
          
          // Alternate row color
          if (idx % 2 === 1) {
            doc.setFillColor(249, 250, 251);
            doc.rect(15, y, pageWidth - 30, rowHeight, 'F');
          }
          
          // Border
          doc.setDrawColor(229, 231, 235);
          doc.rect(15, y, pageWidth - 30, rowHeight);
          
          // Main line data
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(sku, cols.sku, y + 6);

          // No part name in description column

          // GTIN
          if (gtin) {
            doc.setFont('helvetica', 'normal');
            doc.text(gtin, cols.gtin + cols.widths.gtinW / 2, y + 6, { align: 'center' });
          }

          // Quantity, UOM, and Unit Price
          doc.setFont('helvetica', 'normal');
          doc.text(String(qty), cols.qty + cols.widths.qtyW / 2 - 3, y + 6, { align: 'center' });
          doc.text('EA', cols.uom + cols.widths.uomW / 2, y + 6, { align: 'center' });
          doc.text(`$${unitPrice.toFixed(2)}`, cols.price + cols.widths.priceW / 2, y + 6, { align: 'center' });

          // First line baseline for description
          const firstLineY = y + 6;

          // Description (first line aligned with other columns) - NO PRICE HERE
          if (descLines.length > 0) {
            const firstLine = descLines[0];
            const moreLines = descLines.length > 1 ? descLines.slice(1) : [];
            // First line at 8pt on the main row baseline
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(55, 65, 81);
            doc.text(firstLine, cols.desc, firstLineY);
            // Additional wrapped lines below in 7pt
            if (moreLines.length > 0) {
              doc.setFontSize(7);
              doc.text(moreLines, cols.desc, firstLineY + 8, { lineHeightFactor: 1.1 });
            }
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(8);
          }

          // Add spec/notes below if they exist
          if (noteLines.length > 0) {
            doc.setFontSize(6.5);
            doc.setTextColor(107, 114, 128);
            const afterDescY = (() => {
              if (descLines.length === 0) return firstLineY;
              const moreCount = Math.max(0, descLines.length - 1);
              return moreCount > 0 ? (firstLineY + 8 + moreCount * 7) : (firstLineY + 8);
            })();
            const notesStartY = afterDescY + 2;
            doc.text(noteLines, cols.desc, notesStartY, { lineHeightFactor: 1.1 });
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(8);
          }

          y += rowHeight;
        });
      }
      
      // Bottom border of table
      doc.setDrawColor(17, 24, 39);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      doc.setLineWidth(0.2);
      
      y += 10;
      
      // ===== TOTALS =====
      checkPage(35);
      
      // Calculate from line items first, fall back to PO values if needed
      const calculatedSubtotal = lines.reduce((sum, line) => {
        const qty = Number(line.quantity_ordered ?? 0);
        const price = Number(line.unit_price ?? 0);
        return sum + qty * price;
      }, 0);
      
      // Use calculated values first, fall back to PO values if calculated is 0
      const subtotal = calculatedSubtotal || Number(po.subtotal ?? 0);
      const tax = Number(po.tax_amount ?? 0);
      const shipping = Number(po.shipping_amount ?? 0);
      const total = subtotal + tax + shipping;
      
      // Add line item count summary
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`${lines.length} item${lines.length !== 1 ? 's' : ''} total`, 20, y);
      doc.setTextColor(0, 0, 0);
      y += 8;

      // Totals box
      const totalsBoxY = y;
      doc.setFillColor(249, 250, 251);
      doc.rect(pageWidth - 95, totalsBoxY, 80, 28, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.rect(pageWidth - 95, totalsBoxY, 80, 28);

      doc.setFontSize(9);
      const labelX = pageWidth - 90;
      const valueX = pageWidth - 20;

      y = totalsBoxY + 6;

      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal:', labelX, y);
      doc.text(`$${subtotal.toFixed(2)}`, valueX, y, { align: 'right' });
      y += 6;

      doc.text('Tax:', labelX, y);
      doc.text(`$${tax.toFixed(2)}`, valueX, y, { align: 'right' });
      y += 6;

      doc.text('Shipping:', labelX, y);
      doc.text(`$${shipping.toFixed(2)}`, valueX, y, { align: 'right' });
      y += 6;

      // Total with separator line
      doc.setDrawColor(17, 24, 39);
      doc.line(labelX - 3, y - 2, valueX, y - 2);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL:', labelX, y + 4);
      doc.text(`$${total.toFixed(2)}`, valueX, y + 4, { align: 'right' });

      y = totalsBoxY + 35;

      // ===== TERMS & SHIPPING (if present) =====
      if (po.terms || po.shipping_method) {
        checkPage(35);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Terms & Shipping Information', 20, y);
        y += 7;
        
        // Terms box
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y, pageWidth - 30, 25, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.rect(15, y, pageWidth - 30, 25);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        let yOffset = y + 6;
        
        if (po.terms) {
          doc.setFont('helvetica', 'bold');
          doc.text('Payment Terms:', 20, yOffset);
          doc.setFont('helvetica', 'normal');
          doc.text(po.terms, 52, yOffset);
          yOffset += 5;
        }
        
        if (po.shipping_method) {
          doc.setFont('helvetica', 'bold');
          doc.text('Shipping/Incoterms:', 20, yOffset);
          doc.setFont('helvetica', 'normal');
          doc.text(po.shipping_method, 55, yOffset);
          yOffset += 5;
        }
        
        doc.setFont('helvetica', 'bold');
        doc.text('Freight Terms:', 20, yOffset);
        doc.setFont('helvetica', 'normal');
        doc.text('Prepaid & Add', 52, yOffset);
        yOffset += 5;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Acceptance:', 20, yOffset);
        doc.setFont('helvetica', 'normal');
        doc.text('Final inspection within 20 days of receipt. Nonconforming goods subject to rejection.', 52, yOffset);
        
        y += 32;
      }

      // ===== QUALITY & COMPLIANCE REQUIREMENTS =====
      checkPage(80);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Quality & Compliance Requirements', 20, y);
      y += 7;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');

      const qmsReqs = [
        '1. REGULATORY COMPLIANCE: All products must comply with FDA Quality System Regulation 21 CFR 820, ISO 13485:2016, and applicable CE/MDR requirements. Supplier warrants products meet all specifications and regulatory standards.',
        '',
        '2. CHANGE NOTIFICATION: Supplier must provide written notification of any design, material, or process changes at least 30 days in advance, as required by ISO 13485:2016 §7.4.2 and 21 CFR 820.50.',
        '',
        '3. CERTIFICATES REQUIRED WITH SHIPMENT:',
        '   • Certificate of Conformance (COA/COC) for each lot/batch',
        '   • Material Safety Data Sheets (MSDS/SDS) for hazardous materials',
        '   • Test reports and inspection certificates as applicable',
        '   • Certificate of Origin (for imported goods)',
        '   • ISO 13485 or FDA registration certificates (annually)',
        '',
        '4. TRACEABILITY: Supplier must provide lot/batch numbers, serial numbers (if applicable), and expiration dates on all shipments. Labels must include part number, quantity, lot, and expiry per UDI requirements.',
        '',
        '5. PACKAGING & LABELING: Products must be packaged to prevent damage and contamination. Sterile items require appropriate barrier packaging. All packages must be labeled with part number, lot number, quantity, and supplier identification.',
        '',
        '6. WARRANTY: Supplier warrants products are free from defects in material and workmanship for [12-24] months from date of shipment. Supplier agrees to cover costs of field recalls arising from warranty breach.',
        '',
        '7. NONCONFORMANCE: Buyer reserves the right to reject any nonconforming goods. Rejected goods will be returned at supplier\'s expense within 24 hours of notification.',
        '',
        '8. INSPECTION RIGHTS: Buyer may inspect supplier facilities and quality records with reasonable notice to verify compliance with purchase order requirements.',
      ];

      qmsReqs.forEach(req => {
        if (y > pageHeight - 15) {
          doc.addPage();
          y = 20;
        }
        if (req === '') {
          y += 2;
        } else {
          const lines = doc.splitTextToSize(req, pageWidth - 40);
          doc.text(lines, 20, y);
          y += lines.length * 2.8;
        }
      });

      y += 5;

      // ===== REQUIRED DOCUMENTATION =====
      checkPage(30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Required Documentation & Attachments', 20, y);
      y += 7;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');

      doc.text('☐ Technical Drawings/Specifications (with revision numbers)', 20, y);
      y += 4;
      doc.text('☐ Certificate of Analysis/Conformance (COA/COC)', 20, y);
      y += 4;
      doc.text('☐ Material Safety Data Sheets (MSDS/SDS)', 20, y);
      y += 4;
      doc.text('☐ ISO 13485 Certificate (current)', 20, y);
      y += 4;
      doc.text('☐ FDA Device Establishment Registration', 20, y);
      y += 4;
      doc.text('☐ Test Reports/Inspection Certificates', 20, y);
      y += 4;
      doc.text('☐ Certificate of Origin (if imported)', 20, y);
      y += 8;

      // ===== APPROVAL SIGNATURES =====
      checkPage(30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Authorized Approvals', 20, y);
      y += 7;

      // Signature boxes
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);

      // Buyer signature
      doc.rect(20, y, 75, 20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('BUYER APPROVAL', 22, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Signature: _______________________', 22, y + 12);
      doc.text('Name: ____________________________', 22, y + 16);
      doc.text('Date: ____________________________', 22, y + 20);

      // Supplier acceptance
      doc.rect(115, y, 75, 20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('SUPPLIER ACCEPTANCE', 117, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Signature: _______________________', 117, y + 12);
      doc.text('Name: ____________________________', 117, y + 16);
      doc.text('Date: ____________________________', 117, y + 20);

      y += 25;

      doc.setLineWidth(0.2);

      // ===== FOOTER =====
      doc.setFontSize(6);
      doc.setTextColor(107, 114, 128);
      const footerLine1 = `PO Number: ${po.po_number ?? 'N/A'} | Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} | Rev. 0`;
      const footerLine2 = 'This is a legally binding document. Acceptance of this order constitutes agreement to all terms and conditions stated herein.';
      const footerLine3 = 'Issued pursuant to FDA 21 CFR 820.50 and ISO 13485:2016. All specifications and quality requirements must be met.';
      
      doc.text(footerLine1, pageWidth / 2, pageHeight - 14, { align: 'center' });
      doc.text(footerLine2, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text(footerLine3, pageWidth / 2, pageHeight - 6, { align: 'center' });
      
      // Save
      doc.save(`PO_${po.po_number}_Biomedical.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Error generating PDF: ${error.message}`);
    }
  };


  // TODO: Re-implement submit and cancel functionality after approval workflow is added
  // const submitPO = async () => {
  //   if (!selected) return;
  //   if (!confirm('Submit this purchase order? It will change status to Pending.')) return;

  //   try {
  //     const res = await fetch(`${API_BASE}/${selected.purchase_order_id}/submit`, {
  //       method: 'POST',
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     if (!res.ok) throw new Error('Failed to submit purchase order');
  //     await fetchDetail(selected.purchase_order_id);
  //     await fetchPOs();
  //   } catch (e) {
  //     setErr(e.message);
  //   }
  // };

  // const cancelPO = async () => {
  //   if (!selected) return;
  //   if (!confirm('Cancel this purchase order? This action cannot be undone.')) return;

  //   try {
  //     const res = await fetch(`${API_BASE}/${selected.purchase_order_id}/cancel`, {
  //       method: 'POST',
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     if (!res.ok) throw new Error('Failed to cancel purchase order');
  //     await fetchDetail(selected.purchase_order_id);
  //     await fetchPOs();
  //   } catch (e) {
  //     setErr(e.message);
  //   }
  // };

  const totalResults = totalCount || pos.length || 0;
  const resultsLabel = loading
    ? 'Fetching purchase orders…'
    : `${totalResults} result${totalResults === 1 ? '' : 's'}`;
  const canCreatePO = hasPermission('procurement.purchase_orders.create');

  return (
    <div className="purchase-orders-page">
      <header className="po-page-header">
        <div>
          <h1>Purchase Orders</h1>
          <p className="po-page-subtitle">
            Track approvals, send orders to suppliers, and keep details aligned with Receiving.
          </p>
        </div>
        <div className="po-header-actions">
          <button
            className="add-purchase-order-btn"
            onClick={() => canCreatePO && setOpenAdd(true)}
            disabled={!canCreatePO}
          >
            <Plus size={18} /> New Purchase Order
          </button>
          {!canCreatePO && (
            <p className="po-permission-hint">
              Requires procurement.purchase_orders.create
            </p>
          )}
        </div>
      </header>

      <div className="parts-layout">
        <div className="part-list-panel">
          <div className="list-panel-header">
            <div>
              <h2>All Orders</h2>
              <p className="list-subtitle">{resultsLabel}</p>
            </div>
            <div className="list-controls">
              <div className="search-bar">
                <Search size={16} className="search-icon" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search purchase orders..."
                  value={typing}
                  onChange={(e) => setTyping(e.target.value)}
                />
              </div>
              <div className="filter-bar">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="sent_to_supplier">Sent to Supplier</option>
                  <option value="received">Received</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {err && <div className="error-banner">Error: {err}</div>}

          <div className="part-list">
            {loading ? (
              <div className="loading-row">Loading…</div>
            ) : pos.length === 0 ? (
              <div className="no-data">No purchase orders found</div>
            ) : (
              pos.map(po => {
                const details = [
                  po.supplier_name,
                  po.total_amount !== null ? `$${Number(po.total_amount).toFixed(2)}` : null,
                  new Date(po.order_date).toLocaleDateString()
                ];
                return (
                  <ListItem
                    key={po.purchase_order_id}
                    title={po.po_number}
                    details={details}
                    selected={selectedId === po.purchase_order_id}
                    onClick={() => { setSelectedId(po.purchase_order_id); setIsEditing(false); setActiveTab('general'); }}
                    badge={<StatusBadge status={po.status} />}
                  />
                );
              })
            )}
          </div>

          <div className="list-panel-footer">
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(prev => Math.max(0, prev - PAGE_SIZE))}
              >
                Prev
              </button>
              <span className="page-indicator">
                Page {currentPage}{totalPages ? ` of ${totalPages}` : ''} • {PAGE_SIZE} per page
              </span>
              <button
                className="pagination-btn"
                disabled={!hasMore || loading}
                onClick={() => setOffset(prev => prev + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="part-detail-panel">
          {!selected ? (
            <p className="po-detail-empty">Select a purchase order to see details.</p>
          ) : (
            <>
              <div className="detail-toolbar">
                <div className="part-tabs">
                  <button
                    className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                  >
                    General
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'lines' ? 'active' : ''}`}
                    onClick={() => setActiveTab('lines')}
                  >
                    Line Items
                  </button>
                </div>
                
                <div className="detail-actions">
                  <button 
                    className="btn-pdf" 
                    onClick={generatePDF}
                    title="Generate Biomedical Purchase Order PDF"
                  >
                    <FileText size={16} /> Generate PDF
                  </button>
                </div>
              </div>

              {activeTab === 'general' && (
                isEditing ? (
                  <PurchaseOrderForm
                    po={selected}
                    onCancel={() => setIsEditing(false)}
                    onSave={(patch) => saveGeneral(selected.purchase_order_id, patch)}
                  />
                ) : (
                <PurchaseOrderDetails 
                  po={selected} 
                  onEdit={() => setIsEditing(true)}
                  onApprove={approvePO}
                  onReject={rejectPO}
                  onSend={sendToSupplier}
                />
              )
            )}

              {activeTab === 'lines' && selected && (
                <LineItems
                  poId={selected.purchase_order_id}
                  status={selected.status}
                  lines={selected.lines || []}
                  onRefresh={() => fetchDetail(selected.purchase_order_id)}
                />
              )}
            </>
          )}
        </div>
      </div>

      <AddPurchaseOrderModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
        authTokenStr={token}
      />
    </div>
  );
}
