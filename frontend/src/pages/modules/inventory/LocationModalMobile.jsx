import React from 'react';
import './Locations.css';

/**
 * MobileLocationModal
 * Full-screen modal for location details on mobile devices
 */
export default function MobileLocationModal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="mobile-location-backdrop">
      <div className="mobile-location-sheet">
        {/* Header */}
        <div className="mobile-location-header">
          <h2 className="mobile-location-title">{title}</h2>
          <button 
            className="mobile-location-close" 
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mobile-location-body">
          {children}
        </div>
      </div>
    </div>
  );
}
