import React from 'react';
import MobileModal from './ProductModalMobile.jsx';

/**
 * Wrapper to keep the Parts screen using the shared mobile modal.
 * Defaults to allowing backdrop close to match previous behavior.
 */
export default function PartMobileModal({
  preventBackdropClose = false,
  title = 'Part',
  allowBackdropClose,
  ...rest
}) {
  const resolvedAllowBackdrop = allowBackdropClose ?? !preventBackdropClose;

  return (
    <MobileModal
      title={title}
      {...rest}
      allowBackdropClose={resolvedAllowBackdrop}
    />
  );
}
