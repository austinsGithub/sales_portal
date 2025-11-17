import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, X, Check, AlertCircle } from 'lucide-react';
import './PurchaseOrderLineItems.css';

const buildApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  const cleanBase = base.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return cleanEndpoint ? `${cleanBase}/${cleanEndpoint}` : cleanBase;
};

const getAuthToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) console.warn('No auth token found in localStorage');
  return token || '';
};

const LineItems = ({ poId, status, lines = [], onRefresh }) => {
  const [editingLine, setEditingLine] = useState(null);
  const [formData, setFormData] = useState({
    part_id: '',
    quantity_ordered: '',
    unit_cost: '',  // Changed from unit_price to match backend
    notes: ''       // Changed from line_notes to match backend
  });
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load parts for dropdown
  useEffect(() => {
    const fetchParts = async () => {
      try {
        const response = await fetch(buildApiUrl('api/inventory/parts'), {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to load parts');
        }
        const data = await response.json();
        
        // --- FIX: Handle both flat array and { data: [...] } responses ---
        const partsList = Array.isArray(data) ? data : (data.data || []);
        console.log('Parts data:', partsList);
        
        if (!partsList || !Array.isArray(partsList)) {
          throw new Error('Invalid parts data format received from server');
        }
        
        // Map the data to a consistent format
        const formattedParts = partsList.map(part => ({
          id: part.part_id || part.id,
          part_id: part.part_id || part.id,
          part_number: part.gtin || part.part_number || part.partNumber || `ID: ${part.part_id || part.id}`,
          name: part.product_name || part.name || part.part_name || '',
          description: part.description || '',
          unit_cost: part.unit_cost || part.unitCost || 0,
          unit_price: part.unit_price || part.unitPrice || 0
        }));
        
        console.log('Formatted parts:', formattedParts);
        setParts(formattedParts);
      } catch (err) {
        console.error('Error loading parts:', err);
        setError('Failed to load parts');
      }
    };

    fetchParts();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // If part is selected, try to auto-fill the unit cost
    if (name === 'part_id' && value) {
      const selectedPart = parts.find(p => p.id.toString() === value);
      // Note: Your part mapping doesn't include unit_cost.
      // If it did (e.g., from part.unit_cost), this would work.
      if (selectedPart && selectedPart.unit_cost) {
        setFormData(prev => ({
          ...prev,
          unit_cost: selectedPart.unit_cost.toString()
        }));
      }
    }
  };

  const handleEditLine = (line) => {
    console.log('Editing line:', line);
    setEditingLine(line.po_line_id);
    setFormData({
      part_id: line.part_id?.toString() || '',
      part_name: line.part_name || line.part_number || '',
      quantity_ordered: line.quantity_ordered?.toString() || '1',
      unit_price: (line.unit_price || line.unit_cost || 0).toString(),
      unit_cost: (line.unit_cost || line.unit_price || 0).toString(),
      notes: line.notes || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingLine(null);
    setFormData({
      part_id: '',
      part_name: '',
      quantity_ordered: '1',
      unit_price: '0.00',
      notes: ''
    });
    setError(''); // Clear error on cancel
  };

  const handleSaveLine = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Make sure poId is a number and exists
      const purchaseOrderId = parseInt(poId);
      if (isNaN(purchaseOrderId)) {
        throw new Error('Invalid purchase order ID');
      }

      // Find the selected part
      const selectedPart = parts.find(p => p.id.toString() === formData.part_id.toString());
      
      // Validate part selection for new lines
      if (!selectedPart && editingLine === 'new') {
        throw new Error('Please select a valid part');
      }

      // --- FIX: Use buildApiUrl for consistency ---
      const isNew = editingLine === 'new';
      
      const endpoint = isNew 
        ? `api/procurement/purchase_orders/${purchaseOrderId}/lines` 
        : `api/procurement/purchase_orders/${purchaseOrderId}/lines/${editingLine}`;
      
      const url = buildApiUrl(endpoint);
      const method = isNew ? 'POST' : 'PUT';
      // --- END FIX ---
      
      // Only include fields that exist in the database
      // The part information is already associated via part_id
      const payload = {
        purchase_order_id: purchaseOrderId,
        part_id: parseInt(formData.part_id),
        quantity_ordered: parseInt(formData.quantity_ordered) || 1,
        unit_cost: parseFloat(formData.unit_price) || 0,
        notes: formData.notes || ''
      };
      
      // For backward compatibility, include unit_price if it's different from unit_cost
      if (parseFloat(formData.unit_price) !== parseFloat(formData.unit_cost || 0)) {
        payload.unit_price = parseFloat(formData.unit_price) || 0;
      }
      
      // --- FIX: Removed redundant payload.id, it's now in the URL for PUT ---

      console.log('Sending request to:', url);
      console.log('Method:', method);
      console.log('Payload:', payload);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);
      
      // Try to parse response, even if it's an error
      const responseData = await response.json();

      if (!response.ok) {
        console.error('API Error:', responseData);
        throw new Error(responseData.message || 'Failed to save line item');
      }

      onRefresh();
      handleCancelEdit();
    } catch (err) {
      console.error('Error saving line item:', err);
      setError(err.message || 'Failed to save line item');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLine = async (lineId) => {
    if (!window.confirm('Are you sure you want to delete this line item?')) return;
    
    try {
      const response = await fetch(buildApiUrl(`api/procurement/purchase_orders/${poId}/lines/${lineId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });

      if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.message || 'Failed to delete line item');
      }
      onRefresh();
    } catch (err) {
      console.error('Error deleting line item:', err);
      setError(err.message || 'Failed to delete line item');
    }
  };

  // Calculate subtotal
  const subtotal = lines.reduce((sum, line) => {
    return sum + (parseFloat(line.quantity_ordered || 0) * parseFloat(line.unit_price || 0));
  }, 0);

  return (
    <div className="po-line-items">
      <div className="header">
        <h3>Line Items</h3>
        {status === 'draft' && !editingLine && (
          <button
            onClick={() => {
              setEditingLine('new');
              // Set defaults for a new line
              setFormData({
                part_id: '',
                quantity_ordered: '1',
                unit_price: '0.00',
                line_notes: ''
              });
            }}
            className="btn btn-primary"
          >
            <Plus size={16} />
            Add Line Item
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          <div className="icon">
            <AlertCircle size={20} />
          </div>
          <p>{error}</p>
        </div>
      )}

      {editingLine && (
        <form onSubmit={handleSaveLine} className="line-form">
          <div className="form-grid">
            <div>
              <label htmlFor="part_id">Part</label>
              <select
                id="part_id"
                name="part_id"
                value={formData.part_id}
                onChange={handleInputChange}
                required
              >
                <option value="">Select a part</option>
                {/* This uses the formatted parts data */}
                {parts.map(part => {
                  const partNumber = part.part_number || 'N/A';
                  const partName = part.name || part.description || '';
                  const displayText = partName ? `${partNumber} - ${partName}` : partNumber;
                  
                  return (
                    <option key={part.id} value={part.id}>
                      {displayText}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="quantity_ordered">Quantity</label>
              <input
                type="number"
                id="quantity_ordered"
                name="quantity_ordered"
                value={formData.quantity_ordered}
                onChange={handleInputChange}
                min="1"
                required
              />
            </div>
            <div>
              <label htmlFor="unit_price">Unit Price</label>
              <div className="price-input-wrapper">
                <span className="price-input-prefix">$</span>
                <input
                  type="number"
                  id="unit_price"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="price-input"
                  required
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="line_notes">Notes</label>
            <textarea
              id="line_notes"
              name="line_notes"
              value={formData.line_notes}
              onChange={handleInputChange}
              rows={2}
              placeholder="Optional notes about this line item"
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="btn btn-outline"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              <Check size={16} />
              {loading ? 'Saving...' : 'Save Line'}
            </button>
          </div>
        </form>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Unit Price</th>
              <th className="numeric">Total</th>
              {status === 'draft' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={status === 'draft' ? 6 : 5} className="empty-state-cell">
                  No line items have been added yet.
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                console.log('Line item data:', line); // Debug log to check the actual data structure
                
                // Get part information - check all possible fields for part details
                const partNumber = line.part_number || line.sku || 'N/A';
                const partName = line.part_name || line.name || '';
                const partDescription = line.description || line.notes || '';
                const gtin = line.gtin || line.upc || '';
                
                return (
                  <tr key={line.po_line_id} className={editingLine === line.po_line_id ? 'is-editing' : ''}>
                    <td>
                      <div className="part-number">{partNumber}</div>
                      {gtin && (
                        <div className="text-xs text-gray-500">GTIN: {gtin}</div>
                      )}
                    </td>
                    <td>
                      {partName && (
                        <div className="font-medium">{partName}</div>
                      )}
                      {partDescription && partDescription !== partName && (
                        <div className="text-sm text-gray-600 mt-1">{partDescription}</div>
                      )}
                      {line.notes && (
                        <p className="notes text-xs text-gray-500 mt-1">{line.notes}</p>
                      )}
                  </td>
                  <td className="numeric">
                    {line.quantity_ordered || 0}
                  </td>
                  <td className="numeric">
                    ${Number(line.unit_price || line.unit_cost || 0).toFixed(2)}
                  </td>
                  <td className="numeric font-medium">
                    ${(Number(line.quantity_ordered || 0) * Number(line.unit_price || line.unit_cost || 0)).toFixed(2)}
                  </td>
                  {status === 'draft' && (
                    <td>
                      <div className="actions">
                        <button
                          onClick={() => handleEditLine(line)}
                          className="action-btn edit"
                          aria-label="Edit line"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteLine(line.po_line_id)}
                          className="action-btn delete"
                          aria-label="Delete line"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                  </tr>
                );
              })
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={status === 'draft' ? 4 : 3}>
                  Subtotal
                </td>
                <td className="numeric">
                  ${subtotal.toFixed(2)}
                </td>
                {status === 'draft' && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default LineItems;