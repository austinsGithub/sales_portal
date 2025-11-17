import React, { useState } from 'react';
import { 
  Users, 
  Building, 
  Shield, 
  CreditCard, 
  Settings, 
  ChevronRight 
} from 'lucide-react';
import UserManagementAPI from './components/UserManagementAPI';
import RolesPermissions from './components/RolesPermissions.jsx';
import Companies from './components/Companies.jsx';
import "../../../css/modules/admin/AdminSettings.css";

// --- CONSTANTS ---

// Navigation items configuration
const adminNavItems = [
  { 
    id: 'users', 
    label: 'User Management', 
    icon: Users,
    description: 'Manage system users and their permissions'
  },
  { 
    id: 'roles', 
    label: 'Roles & Permissions', 
    icon: Shield,
    description: 'Configure roles and their access levels'
  },
  { 
    id: 'companies', 
    label: 'Companies', 
    icon: Building,
    description: 'Manage company accounts and settings'
  },
  { 
    id: 'billing', 
    label: 'Billing & Subscriptions', 
    icon: CreditCard,
    description: 'View and manage billing information'
  },
];

// Maps tab IDs to their corresponding components for cleaner rendering
const componentMap = {
  users: <UserManagementAPI />,
  roles: <RolesPermissions />,
  companies: <Companies />,
};

// --- MAIN COMPONENT ---

/**
 * Main component for the Admin Settings page.
 * Manages the active tab state and composes the layout.
 */
function AdminSettings() {
  const [activeTab, setActiveTab] = useState('users');
  const activeNavItem = adminNavItems.find(item => item.id === activeTab);

  return (
    <div className="admin-settings-container">
      <SettingsBreadcrumb activeLabel={activeNavItem?.label || 'Dashboard'} />
      
      <div className="admin-settings-layout">
        <SettingsNavigation
          items={adminNavItems}
          activeTab={activeTab}
          onTabClick={setActiveTab}
        />
        <SettingsContent
          activeTab={activeTab}
          activeNavItem={activeNavItem}
        />
      </div>
    </div>
  );
}

export default AdminSettings;

// --- SUB-COMPONENTS ---

/**
 * Renders the breadcrumb navigation.
 */
function SettingsBreadcrumb({ activeLabel }) {
  return (
    <div className="breadcrumb">
      <span>Admin</span>
      <ChevronRight size={16} />
      <span className="active">{activeLabel}</span>
    </div>
  );
}

/**
 * Renders the side navigation menu.
 */
function SettingsNavigation({ items, activeTab, onTabClick }) {
  return (
    <nav className="settings-nav">
      <div className="nav-header">
        <Settings size={20} />
        <span>Admin Panel</span>
      </div>
      <div className="nav-items">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onTabClick(item.id)}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}>
            <item.icon size={20} />
            <div className="nav-item-content">
              <span className="nav-item-label">{item.label}</span>
              <span className="nav-item-desc">{item.description}</span>
            </div>
            <ChevronRight size={16} className="nav-item-arrow" />
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Renders the main content panel based on the active tab.
 * Includes a "Coming Soon" fallback for unmapped tabs.
 */
function SettingsContent({ activeTab, activeNavItem }) {
  const ActiveComponent = componentMap[activeTab];

  return (
    <main className="settings-content">
      {ActiveComponent ? (
        ActiveComponent // Render the component if it's in the map
      ) : (
        // Default "Coming Soon" card
        <div className="settings-card">
          <div className="card-header">
            <h2 className="card-title">
              {activeNavItem?.icon && <activeNavItem.icon size={24} />}
              {activeNavItem?.label || 'Dashboard'}
            </h2>
            <p className="card-description">
              {activeNavItem?.description || 'Manage your account settings and preferences'}
            </p>
          </div>
          <div className="coming-soon">
            <div className="coming-soon-content">
              <Settings size={48} className="icon" />
              <h3>Coming Soon</h3>
              <p>This feature is currently under development.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}