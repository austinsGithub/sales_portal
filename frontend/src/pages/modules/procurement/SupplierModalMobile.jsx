import React from 'react';
import MobileModal from '../inventory/ProductModalMobile.jsx';

/**
 * Supplier mobile modal now reuses the shared mobile modal shell.
 */
export default function MobileSupplierModal({
  title = 'Supplier',
  allowBackdropClose,
  ...rest
}) {
  return (
    <MobileModal
      title={title}
      {...rest}
      allowBackdropClose={allowBackdropClose ?? true}
    />
  );
}
