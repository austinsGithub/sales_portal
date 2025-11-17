import React from 'react';

/**
 * Shared list item component for consistent display across all list panels
 * @param {Object} props
 * @param {string} props.title - Main title/name to display
 * @param {Array<string|number>} props.details - Array of detail strings to display (will be joined with ' • ')
 * @param {boolean} props.selected - Whether this item is selected
 * @param {Function} props.onClick - Click handler
 * @param {React.ReactNode} props.badge - Optional badge component (e.g., StatusBadge)
 * @param {string} props.className - Additional CSS classes
 */
export default function ListItem({
  title,
  details = [],
  selected = false,
  onClick,
  badge = null,
  className = ''
}) {
  return (
    <div
      className={`part-list-item ${selected ? 'selected' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3>{title}</h3>
        {badge}
      </div>
      {details.length > 0 && (
        <p>{details.filter(Boolean).join(' • ')}</p>
      )}
    </div>
  );
}
