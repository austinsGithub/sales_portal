import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, User, Settings, Bug, LogOut } from 'lucide-react';
import { useAuth } from '../../shared/contexts/AuthContext.jsx';
import './TopBar.css';

const TopBar = ({ onToggleSidebar, sidebarCollapsed }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const brandName = user?.company_name || 'Traycase.com';
  const brandSubtitle = user?.company?.tagline || 'Sales Portal';
  const brandInitials = brandName
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();

  if (!user) return null;

  const handleLogout = async (e) => {
    e.preventDefault();
    try {
      await logout();
      localStorage.removeItem('auth_token');
      localStorage.removeItem('userData');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className={`top-bar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="top-bar-left">
        <button
          className="hamburger-button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        
      </div>

      <div className="top-bar-right">
        <div
          className="user-profile"
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
        >
          <div className="user-avatar-container">
            <img
              src={user?.avatar || '/vite.svg'}
              alt="User Avatar"
              className="user-avatar"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.errored) return;
                img.dataset.errored = '1';
                img.src =
                  'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 16 16\"><rect width=\"16\" height=\"16\" rx=\"8\" fill=\"%23111\"/><text x=\"8\" y=\"11\" font-size=\"8\" fill=\"%23fff\" text-anchor=\"middle\">U</text></svg>';
              }}
            />
          </div>

          <div className="user-info">
            <span className="user-email">{user.email || user.name || 'User'}</span>
          </div>

          <svg
            className={`dropdown-chevron ${showDropdown ? 'open' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>

        {showDropdown && (
          <div className="dropdown-menu">
            <Link
              to="/account-settings"
              className="dropdown-item"
              onClick={() => setShowDropdown(false)}
            >
              <User size={16} />
              <span>My Profile</span>
            </Link>
            {(user?.is_super_admin == 1 ||
              user.role === 'super_admin' ||
              user.role === 'operations_admin') && (
              <Link
                to="/admin/settings"
                className="dropdown-item"
                onClick={() => setShowDropdown(false)}
              >
                <Settings size={16} />
                <span>Admin Settings</span>
              </Link>
            )}
            <div
              className="dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                console.log('Auth debug (local only):', {
                  localStorageUser: localStorage.getItem('userData'),
                  authToken: localStorage.getItem('auth_token'),
                  inMemoryUser: user
                });
                setShowDropdown(false);
              }}
              style={{ cursor: 'pointer' }}
            >
              <Bug size={16} />
              <span>Show Auth Debug (local)</span>
            </div>
            <div className="dropdown-divider" />
            <button
              className="dropdown-item dropdown-item-danger"
              onClick={(e) => {
                e.stopPropagation();
                handleLogout(e);
              }}
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopBar;
