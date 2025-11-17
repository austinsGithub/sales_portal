import React from 'react';

const StatusBadge = ({ status }) => {
  const getStatusInfo = (currentStatus) => {
    switch(currentStatus) {
      case 'sent_to_supplier': 
        return { 
          text: 'Sent to Supplier', 
          bg: 'bg-gradient-to-r from-blue-50 to-indigo-100 border border-indigo-200', 
          textColor: 'text-indigo-800' 
        };
      case 'received': 
        return { text: 'Received', bg: 'bg-purple-100', textColor: 'text-purple-800' };
      case 'approved': 
        return { text: 'Approved', bg: 'bg-green-100', textColor: 'text-green-800' };
      case 'partial':
        return { text: 'Partial', bg: 'bg-amber-100', textColor: 'text-amber-800' };
      case 'pending': 
        return { text: 'Pending', bg: 'bg-blue-100', textColor: 'text-blue-800' };
      case 'cancelled': 
        return { text: 'Cancelled', bg: 'bg-red-100', textColor: 'text-red-800' };
      case 'rejected':
        return { text: 'Rejected', bg: 'bg-rose-50 border border-rose-200', textColor: 'text-rose-700' };
      case 'draft':
      default:
        return { text: 'Draft', bg: 'bg-gray-100', textColor: 'text-gray-800' };
    }
  };

  const { text, bg, textColor } = getStatusInfo(status);

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${bg} ${textColor}`}
    >
      {text}
    </span>
  );
};

export default StatusBadge;
