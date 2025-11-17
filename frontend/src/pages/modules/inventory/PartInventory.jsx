import React, { useEffect, useState, useMemo } from 'react';
import './PartInventory.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString();
};

const formatQuantity = (qty) =>
  qty !== null && qty !== undefined ? Number(qty).toLocaleString() : '0';

const computeStatus = (item) => {
  if (item?.status) return item.status;
  if (!item?.expiration_date) return 'Active';

  const now = new Date();
  const expirationDate = new Date(item.expiration_date);
  if (Number.isNaN(expirationDate.getTime())) return 'Active';

  if (expirationDate < now) return 'Expired';
  const soon = new Date(now);
  soon.setDate(now.getDate() + 30);
  if (expirationDate <= soon) return 'Expiring Soon';
  return 'Active';
};

export default function PartInventory({ partId, authToken }) {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!partId) return;

    const fetchInventory = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/inventory/items/${partId}`, {
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${res.status}`);
        }
        
        const { data } = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error loading inventory:', err);
        setError(err.message || 'Failed to load inventory data.');
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [partId, authToken]);

  const stats = useMemo(() => {
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(now.getDate() + 30);
    let total = 0,
      expiring = 0,
      expired = 0;

    for (const item of inventory) {
      const qty = Number(
        item.quantity_on_hand ??
          item.quantity_available ??
          item.quantity ??
          0
      );
      total += qty;
      if (item.expiration_date) {
        const exp = new Date(item.expiration_date);
        if (exp < now) expired += qty;
        else if (exp < soon) expiring += qty;
      }
    }
    return { total, expiring, expired };
  }, [inventory]);

  if (loading)
    return (
      <div className="part-inventory loading">
        <p>Loading inventory...</p>
      </div>
    );
  if (error)
    return (
      <div className="part-inventory error">
        <p>{error}</p>
      </div>
    );

  return (
    <div className="part-inventory">
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Total Quantity</div>
          <div className="value">{formatQuantity(stats.total)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Expiring Soon</div>
          <div className="value warning">{formatQuantity(stats.expiring)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Expired</div>
          <div className="value danger">{formatQuantity(stats.expired)}</div>
        </div>
      </div>

      <div className="inventory-table-container">
        <div className="table-header">
          <h3>Inventory Details</h3>
          <p>Lot-linked traceability for this part</p>
        </div>

        {inventory.length === 0 ? (
          <div className="empty-state">
            <h3>No Inventory Found</h3>
            <p>This part currently has no stock records.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Lot #</th>
                  <th>Location Name</th>
                  <th>Location Details</th>
                  <th className="align-right">On Hand</th>
                  <th className="align-right">Available</th>
                  <th>Received</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  // Handle both expiration_date and expiry_date field names
                  const expirationDate = item.expiration_date || item.expiry_date;
                  const status = computeStatus(item);
                  const expired = status === 'Expired';
                  const expiringSoon = status === 'Expiring Soon';
                  const locationDetails =
                    item.warehouse_name ||
                    item.location_details ||
                    item.location_name ||
                    '—';

                  return (
                    <tr
                      key={item.inventory_id || item.id}
                      className={`${expired ? 'row-expired' : ''} ${
                        expiringSoon ? 'row-expiring' : ''
                      }`}
                    >
                      <td>{item.supplier_name || '—'}</td>
                      <td>{item.lot_number || '—'}</td>
                      <td>{item.location_name || '—'}</td>
                      <td>{locationDetails}</td>
                      <td className="align-right">
                        {formatQuantity(
                          item.quantity_on_hand ?? item.quantity ?? 0
                        )}
                      </td>
                      <td className="align-right">
                        {formatQuantity(
                          item.quantity_available ??
                            item.availableQuantity ??
                            item.quantity ??
                            0
                        )}
                      </td>
                      <td>{formatDate(item.received_date || item.createdAt)}</td>
                      <td>{formatDate(expirationDate)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            expired
                              ? 'status-badge-expired'
                              : expiringSoon
                              ? 'status-badge-hold'
                              : 'status-badge-active'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
