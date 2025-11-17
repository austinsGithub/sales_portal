import React, { useEffect } from 'react';
import '../../css/modules/admin/Toast.css';

export default function Toast({ message, type = 'info', onClose, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onClose && onClose(), duration);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div className={`toast ${type}`} onClick={() => onClose && onClose()}>
      {message}
    </div>
  );
}
