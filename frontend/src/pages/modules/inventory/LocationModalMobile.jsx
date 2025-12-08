import React from 'react';
import MobileModal from './ProductModalMobile.jsx';
import './Locations.css';

/**
 * MobileLocationModal now reuses the shared mobile modal shell for consistency.
 */
export default function MobileLocationModal({ title = 'Location', maxWidth = '100%', ...rest }) {
  return (
    <MobileModal
      title={title}
      {...rest}
      maxWidth={maxWidth}
      allowBackdropClose={rest.allowBackdropClose ?? true}
    />
  );
}
