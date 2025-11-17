import React, { useEffect } from 'react';

export default function MobileSupplierModal({ open, onClose, title = 'Supplier', children }) {
  if (!open) return null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const stop = (e) => e.stopPropagation();

  return (
    <div className="mobile-detail-backdrop" role="presentation" onClick={onClose}>
      <section
        className="mobile-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={stop}
      >
        <header className="mobile-detail-header">
          <h3 className="mobile-detail-title">{title}</h3>
          <button className="mobile-detail-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="mobile-detail-body">{children}</div>
      </section>
    </div>
  );
}
