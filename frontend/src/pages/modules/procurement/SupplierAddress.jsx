import React, { useEffect, useState } from 'react';

const DEFAULTS = {
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'United States',
  phone: '',
};

export default function SupplierAddress({
  value,
  onUpdate,
  isEditing: isEditingProp = false,
  className = '',
}) {
  const [isEditing, setIsEditing] = useState(isEditingProp);
  const [addr, setAddr] = useState({ ...DEFAULTS, ...(value || {}) });
  const [errors, setErrors] = useState({});

  // keep in sync with parent changes
  useEffect(() => {
    setAddr({ ...DEFAULTS, ...(value || {}) });
  }, [value]);

  useEffect(() => setIsEditing(isEditingProp), [isEditingProp]);

  const change = (e) => {
    const { name, value } = e.target;
    setAddr((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const req = ['address_line1', 'city', 'state', 'postal_code', 'country'];
    const newErrors = {};
    for (const f of req) {
      if (!addr[f]?.trim()) newErrors[f] = 'Required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onUpdate?.(addr);
    setIsEditing(false);
  };

  const cancel = () => {
    setAddr({ ...DEFAULTS, ...(value || {}) });
    setErrors({});
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className={`supplier-address ${className}`}>
        <div>{addr.address_line1}</div>
        {addr.address_line2 && <div>{addr.address_line2}</div>}
        <div>{[addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ')}</div>
        <div>{addr.country}</div>
        {addr.phone && <div>📞 {addr.phone}</div>}
        {onUpdate && (
          <button onClick={() => setIsEditing(true)} aria-label="Edit address">
            Edit Address
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`supplier-address-form ${className}`}>
      <div className="form-group">
        <label htmlFor="address_line1">Address line 1 *</label>
        <input
          id="address_line1"
          name="address_line1"
          value={addr.address_line1}
          onChange={change}
          className={errors.address_line1 ? 'error' : ''}
          autoComplete="address-line1"
        />
        {errors.address_line1 && <div className="error-message">{errors.address_line1}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="address_line2">Address line 2</label>
        <input
          id="address_line2"
          name="address_line2"
          value={addr.address_line2}
          onChange={change}
          autoComplete="address-line2"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="city">City *</label>
          <input
            id="city"
            name="city"
            value={addr.city}
            onChange={change}
            className={errors.city ? 'error' : ''}
            autoComplete="address-level2"
          />
          {errors.city && <div className="error-message">{errors.city}</div>}
        </div>

        <div className="form-group">
          <label htmlFor="state">State/Province *</label>
          <input
            id="state"
            name="state"
            value={addr.state}
            onChange={change}
            className={errors.state ? 'error' : ''}
            autoComplete="address-level1"
          />
          {errors.state && <div className="error-message">{errors.state}</div>}
        </div>

        <div className="form-group">
          <label htmlFor="postal_code">Postal Code *</label>
          <input
            id="postal_code"
            name="postal_code"
            value={addr.postal_code}
            onChange={change}
            className={errors.postal_code ? 'error' : ''}
            autoComplete="postal-code"
          />
          {errors.postal_code && <div className="error-message">{errors.postal_code}</div>}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="country">Country *</label>
        <select
          id="country"
          name="country"
          value={addr.country}
          onChange={change}
          className={errors.country ? 'error' : ''}
          autoComplete="country"
        >
          <option>United States</option>
          <option>Canada</option>
          <option>Mexico</option>
          <option>United Kingdom</option>
          <option>Australia</option>
          <option>Germany</option>
        </select>
        {errors.country && <div className="error-message">{errors.country}</div>}
      </div>

      <div className="form-group">
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          value={addr.phone}
          onChange={change}
          placeholder="+1 (555) 123-4567"
          autoComplete="tel"
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save Address
        </button>
      </div>
    </form>
  );
}
