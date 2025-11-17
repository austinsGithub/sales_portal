import React, { useEffect, useRef } from 'react';

// Simple X icon as SVG (no dependency needed)
const XIcon = () => (
  <svg 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ display: 'block' }}
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

/**
 * Universal Mobile Modal Component
 * Use this for all mobile slide-in panels
 * 
 * @param {boolean} open - Whether the modal is open
 * @param {function} onClose - Function to call when closing
 * @param {string} title - Modal title
 * @param {ReactNode} children - Modal content
 * @param {boolean} allowBackdropClose - Allow closing by clicking backdrop (default: false)
 * @param {string} maxWidth - Max width of modal (default: '450px')
 */
export default function MobileModal({ 
  open, 
  onClose, 
  title = '', 
  children,
  allowBackdropClose = false,
  maxWidth = '450px'
}) {
  const previousFocusRef = useRef(null);
  const modalRef = useRef(null);

  // Handle body scroll lock
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    
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

    previousFocusRef.current = document.activeElement;

    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        modalRef.current.focus();
      }
    }, 100);

    return () => {
      clearTimeout(focusTimer);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        try {
          previousFocusRef.current.focus();
        } catch (err) {
          // Ignore
        }
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
    
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusableElements = modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      );
      
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
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
    e.stopPropagation();
    if (!allowBackdropClose) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const stopPropagation = (e) => {
    e.stopPropagation();
  };

  const handleCloseClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  return (
    <div 
      role="presentation" 
      onClick={handleBackdropClick}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'stretch'
      }}
    >
      <section
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby="mobile-modal-title"
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: maxWidth,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100000,
          overflowY: 'auto',
          boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header with title and close button */}
        <header 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            position: 'sticky',
            top: 0,
            backgroundColor: '#ffffff',
            zIndex: 100,
            flexShrink: 0,
            minHeight: '60px',
            gap: '12px'
          }}
        >
          <h2 
            id="mobile-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              flex: 1,
              color: '#111827',
              lineHeight: '1.4'
            }}
          >
            {title}
          </h2>
          
          {/* Close button - always visible */}
          <button 
            onClick={handleCloseClick}
            onTouchEnd={handleCloseClick}
            type="button"
            aria-label="Close"
            style={{
              all: 'unset',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              flexShrink: 0,
              cursor: 'pointer',
              color: '#6b7280',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              border: 'none',
              padding: 0,
              margin: 0,
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
              zIndex: 101,
              boxSizing: 'border-box',
              transition: 'background-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
              e.currentTarget.style.color = '#111827';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            <XIcon />
          </button>
        </header>
        
        {/* Body content */}
        <div 
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {children}
        </div>
      </section>
    </div>
  );
}