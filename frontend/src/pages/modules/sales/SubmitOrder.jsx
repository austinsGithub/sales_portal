import React, { useMemo, useState } from 'react';
import '../../../css/modules/sales/SubmitOrder.css';

const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random()}`);
const blankItem = () => ({
  id: makeId(),
  product: '',
  sku: '',
  quantity: 1,
  unitPrice: 0,
  notes: '',
});

const DEFAULT_ORDER = {
  orderName: '',
  customerName: '',
  customerEmail: '',
  salesRep: '',
  orderDate: new Date().toISOString().split('T')[0],
  paymentTerms: 'Net 30',
  shippingMethod: 'Standard',
  notes: '',
};

function SubmitOrder() {
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [lineItems, setLineItems] = useState([blankItem()]);
  const [shippingCost, setShippingCost] = useState(0);
  const [taxRate, setTaxRate] = useState(7.5);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
    const tax = subtotal * (Number(taxRate) / 100 || 0);
    const shipping = Number(shippingCost) || 0;
    const total = subtotal + tax + shipping;

    return { subtotal, tax, shipping, total };
  }, [lineItems, shippingCost, taxRate]);

  const updateOrder = (field) => (e) => {
    const value = e.target.value;
    setOrder((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => setLineItems((prev) => [...prev, blankItem()]);

  const removeItem = (id) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setStatus('');

    if (!order.orderName || !order.customerName || !order.customerEmail) {
      setError('Order name, customer name, and email are required.');
      return;
    }

    const payload = {
      ...order,
      lineItems: lineItems.map((item) => ({
        product: item.product,
        sku: item.sku,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        notes: item.notes,
      })),
      totals,
    };

    console.log('Order submitted', payload);
    setStatus('Order captured locally. Hook up API to persist.');
  };

  const handleDraft = () => {
    setStatus('Draft saved locally. Connect persistence to store it.');
  };

  return (
    <div className="submit-order-page">
      <div className="page-header">
        <div className="page-title">Submit Order</div>
        <button type="button" className="back-btn" onClick={() => window.history.back()}>
          ← Back
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {status && <div className="status-banner">{status}</div>}

      <form className="form-container" onSubmit={handleSubmit}>
        <div className="form-card">
          <div className="card-header">
            <div className="card-title">Order Details</div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Order Name</label>
              <input
                className="form-input"
                value={order.orderName}
                onChange={updateOrder('orderName')}
                placeholder="Quarterly restock for Clinic A"
                required
              />
            </div>
            <div className="form-group">
              <label>Order Date</label>
              <input
                className="form-input"
                type="date"
                value={order.orderDate}
                onChange={updateOrder('orderDate')}
              />
            </div>
            <div className="form-group">
              <label>Customer Name</label>
              <input
                className="form-input"
                value={order.customerName}
                onChange={updateOrder('customerName')}
                placeholder="Acme Health"
                required
              />
            </div>
            <div className="form-group">
              <label>Customer Email</label>
              <input
                className="form-input"
                type="email"
                value={order.customerEmail}
                onChange={updateOrder('customerEmail')}
                placeholder="ops@customer.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Sales Rep</label>
              <input
                className="form-input"
                value={order.salesRep}
                onChange={updateOrder('salesRep')}
                placeholder="Jane Doe"
              />
            </div>
            <div className="form-group">
              <label>Payment Terms</label>
              <select
                className="form-select"
                value={order.paymentTerms}
                onChange={updateOrder('paymentTerms')}
              >
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 45</option>
                <option>Due on Receipt</option>
              </select>
            </div>
            <div className="form-group">
              <label>Shipping Method</label>
              <select
                className="form-select"
                value={order.shippingMethod}
                onChange={updateOrder('shippingMethod')}
              >
                <option>Standard</option>
                <option>Expedited</option>
                <option>Overnight</option>
                <option>Local Pickup</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notes <span className="optional">(optional)</span></label>
              <textarea
                className="form-textarea"
                value={order.notes}
                onChange={updateOrder('notes')}
                placeholder="Add delivery instructions or internal notes"
              />
            </div>
          </div>
        </div>

        <div className="form-card">
          <div className="card-header">
            <div className="card-title">Line Items</div>
            <button type="button" className="add-item-btn" onClick={addItem}>
              + Add Item
            </button>
          </div>

          <div className="line-items-container">
            {lineItems.map((item, idx) => (
              <div className="line-item" key={item.id}>
                <div className="form-group">
                  <label>Product</label>
                  <input
                    className="form-input"
                    value={item.product}
                    onChange={(e) => updateItem(item.id, 'product', e.target.value)}
                    placeholder="Gauze Pads"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>SKU</label>
                  <input
                    className="form-input"
                    value={item.sku}
                    onChange={(e) => updateItem(item.id, 'sku', e.target.value)}
                    placeholder="SKU-123"
                  />
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Unit Price</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="remove-item-btn"
                  aria-label={`Remove item ${idx + 1}`}
                  onClick={() => removeItem(item.id)}
                  disabled={lineItems.length === 1}
                  title={lineItems.length === 1 ? 'At least one item required' : 'Remove item'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="order-summary">
            <div className="summary-item">
              <span>Subtotal</span> ${totals.subtotal.toFixed(2)}
            </div>
            <div className="summary-item">
              <span>Tax Rate</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                style={{ maxWidth: '120px', display: 'inline-block', marginLeft: '0.5rem' }}
              />%
            </div>
            <div className="summary-item">
              <span>Tax</span> ${totals.tax.toFixed(2)}
            </div>
            <div className="summary-item">
              <span>Shipping</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                style={{ maxWidth: '160px', display: 'inline-block', marginLeft: '0.5rem' }}
              />
            </div>
            <div className="summary-total">
              <span>Total</span> ${totals.total.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="action-btn submit-btn">Submit Order</button>
          <button type="button" className="action-btn draft-btn" onClick={handleDraft}>Save as Draft</button>
          <div className="action-notes">
            Totals are calculated locally. Wire this form to your API to persist the order.
          </div>
        </div>
      </form>
    </div>
  );
}

export default SubmitOrder;
