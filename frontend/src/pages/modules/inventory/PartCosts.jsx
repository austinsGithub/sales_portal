import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api`;

const getAuthToken = () => {
  return localStorage.getItem('auth_token') || '';
};

export default function PartCosts({ partId, authToken }) {
  const [costs, setCosts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCost, setEditingCost] = useState(null);

  // Fetch costs for this part
  useEffect(() => {
    if (!partId) return;
    fetchCosts();
  }, [partId]);

  // Fetch all suppliers for the dropdown
  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchCosts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/procurement/part-costs/by-part/${partId}`, {
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

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_BASE}/procurement/suppliers?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${authToken || getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuppliers(data);
    } catch (e) {
      console.error('Failed to fetch suppliers:', e);
    }
  };

  const handleDelete = async (costId) => {
    if (!confirm('Delete this supplier cost?')) return;
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
    <div className="part-costs-content">
      <div className="costs-header">
        <h3>Supplier Costs for this Part</h3>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> Add Supplier Cost
        </button>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}

      {loading ? (
        <div>Loading costs...</div>
      ) : costs.length === 0 ? (
        <div className="empty-state">No supplier costs defined for this part.</div>
      ) : (
        <table className="costs-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Supplier Code</th>
              <th>Unit Cost</th>
              <th>Effective Date</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {costs.map(cost => (
              <tr key={cost.cost_id}>
                <td>{cost.supplier_name}</td>
                <td>{cost.supplier_code || '-'}</td>
                <td>${Number(cost.unit_cost).toFixed(2)}</td>
                <td>{cost.effective_date ? new Date(cost.effective_date).toLocaleDateString() : '-'}</td>
                <td>{cost.notes || '-'}</td>
                <td>
                  <button
                    className="icon-btn"
                    onClick={() => setEditingCost(cost)}
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className="icon-btn delete-btn"
                    onClick={() => handleDelete(cost.cost_id)}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && (
        <CostModal
          partId={partId}
          suppliers={suppliers}
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
          partId={partId}
          suppliers={suppliers}
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

function CostModal({ partId, suppliers, authToken, existingCost, onClose, onSaved }) {
  const [form, setForm] = useState({
    supplier_id: existingCost?.supplier_id || '',
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

    if (!form.supplier_id) {
      setError('Supplier is required.');
      return;
    }
    if (!form.unit_cost) {
      setError('Unit cost is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        part_id: partId,
        supplier_id: Number(form.supplier_id),
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
          <h2>{existingCost ? 'Edit Supplier Cost' : 'Add Supplier Cost'}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="error-banner">Error: {error}</div>}

        <form onSubmit={submit} className="modal-body">
          <label>
            Supplier *
            <select name="supplier_id" value={form.supplier_id} onChange={change} required disabled={!!existingCost}>
              <option value="">Select a supplier</option>
              {suppliers.map(s => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name} {s.supplier_code ? `(${s.supplier_code})` : ''}
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
