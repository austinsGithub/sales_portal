import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api`;

const getAuthToken = () => {
  return localStorage.getItem('auth_token') || '';
};

export default function SupplierCosts({ supplierId, authToken }) {
  const [costs, setCosts] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCost, setEditingCost] = useState(null);

  // Fetch costs for this supplier
  useEffect(() => {
    if (!supplierId) return;
    fetchCosts();
  }, [supplierId]);

  // Fetch all parts for the dropdown
  useEffect(() => {
    fetchParts();
  }, []);

  const fetchCosts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/procurement/part-costs/by-supplier/${supplierId}`, {
        headers: {
          'Authorization': `Bearer ${authToken || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCosts(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const fetchParts = async () => {
    try {
      const res = await fetch(`${API_BASE}/inventory/parts?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${authToken || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setParts(data);
    } catch (e) {
      console.error('Failed to fetch parts:', e);
    }
  };

  const handleDelete = async (costId) => {
    if (!confirm('Delete this part cost?')) return;
    try {
      const res = await fetch(`${API_BASE}/procurement/part-costs/${costId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchCosts();
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  return (
    <div className="supplier-costs-content">
      <div className="costs-header">
        <h3>Supplier Part Costs</h3>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> Add Part Cost
        </button>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      {loading ? (
        <div>Loading costs...</div>
      ) : costs.length === 0 ? (
        <div className="empty-state">No part costs defined for this supplier.</div>
      ) : (
        <table className="costs-table">
          <thead>
            <tr>
              <th>Part Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Unit Cost</th>
              <th>UOM</th>
              <th>Effective Date</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {costs.map(cost => (
              <tr key={cost.cost_id}>
                <td>{cost.product_name}</td>
                <td>{cost.sku}</td>
                <td>{cost.category || '-'}</td>
                <td>${Number(cost.unit_cost).toFixed(2)}</td>
                <td>{cost.unit_of_measure || '-'}</td>
                <td>{cost.effective_date ? new Date(cost.effective_date).toLocaleDateString() : '-'}</td>
                <td>{cost.notes || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.375rem',
                        background: 'white',
                        color: '#6b7280',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#9ca3af';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                      onClick={() => setEditingCost(cost)}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.375rem',
                        background: 'white',
                        color: '#ef4444',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#fef2f2';
                        e.currentTarget.style.borderColor = '#ef4444';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#fecaca';
                      }}
                      onClick={() => handleDelete(cost.cost_id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && (
        <CostModal
          supplierId={supplierId}
          parts={parts}
          authToken={authToken}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            fetchCosts();
          }}
        />
      )}

      {editingCost && (
        <CostModal
          supplierId={supplierId}
          parts={parts}
          authToken={authToken}
          existingCost={editingCost}
          onClose={() => setEditingCost(null)}
          onSaved={() => {
            setEditingCost(null);
            fetchCosts();
          }}
        />
      )}
    </div>
  );
}

function CostModal({ supplierId, parts, authToken, existingCost, onClose, onSaved }) {
  const [form, setForm] = useState({
    part_id: existingCost?.part_id || '',
    unit_cost: existingCost?.unit_cost || '',
    effective_date: existingCost?.effective_date ? existingCost.effective_date.split('T')[0] : '',
    notes: existingCost?.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.part_id) {
      setError('Part is required.');
      return;
    }
    if (!form.unit_cost) {
      setError('Unit cost is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        part_id: Number(form.part_id),
        supplier_id: supplierId,
        unit_cost: Number(form.unit_cost),
        effective_date: form.effective_date || null,
        notes: form.notes || null,
      };

      const url = existingCost
        ? `${API_BASE}/procurement/part-costs/${existingCost.cost_id}`
        : `${API_BASE}/procurement/part-costs`;

      const method = existingCost ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${authToken || getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          message = data?.error || data?.message || message;
        } catch {}
        throw new Error(message);
      }

      onSaved();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existingCost ? 'Edit Part Cost' : 'Add Part Cost'}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="error-banner">Error: {error}</div>}

        <form onSubmit={submit} className="modal-body">
          <label>
            Part *
            <select name="part_id" value={form.part_id} onChange={change} required disabled={!!existingCost}>
              <option value="">Select a part</option>
              {parts.map(p => (
                <option key={p.part_id} value={p.part_id}>
                  {p.product_name} ({p.sku})
                </option>
              ))}
            </select>
          </label>

          <label>
            Unit Cost *
            <input
              type="number"
              step="0.01"
              min="0"
              name="unit_cost"
              value={form.unit_cost}
              onChange={change}
              required
            />
          </label>

          <label>
            Effective Date
            <input
              type="date"
              name="effective_date"
              value={form.effective_date}
              onChange={change}
            />
          </label>

          <label>
            Notes
            <textarea
              name="notes"
              rows={3}
              value={form.notes}
              onChange={change}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : existingCost ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
