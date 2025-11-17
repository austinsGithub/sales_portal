import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function PartMobileModal({ 
  open, 
  onClose, 
  title = 'Part', 
  children,
  preventBackdropClose = false // Option to prevent closing by clicking backdrop
}) {
  const previousFocusRef = useRef(null);
  const modalRef = useRef(null);

  // Handle body scroll lock
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    
    // Calculate scrollbar width to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  // Handle focus management
  useEffect(() => {
    if (!open) return;

    // Store the element that had focus before modal opened
    previousFocusRef.current = document.activeElement;

    // Focus the modal when it opens
    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      // Restore focus when modal closes
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Handle focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    if (preventBackdropClose) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const stopPropagation = (e) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="mobile-detail-backdrop" 
      role="presentation" 
      onClick={handleBackdropClick}
      aria-hidden="true"
    >
      <section
        ref={modalRef}
        className="mobile-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby="modal-title"
        onClick={stopPropagation}
        tabIndex={-1}
      >
        <header className="mobile-detail-header">
          <h3 id="modal-title" className="mobile-detail-title">
            {title}
          </h3>
          <button 
            className="mobile-detail-close" 
            aria-label="Close modal" 
            onClick={onClose}
            type="button"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        
        <div className="mobile-detail-body">
          {children}
        </div>
      </section>
    </div>
  );
}