import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../shared/contexts/AuthContext.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  ShoppingCart, 
  DollarSign, 
  Package, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Warehouse
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ 
  isCollapsed = false, 
  isOpen = false, 
  onToggleCollapse, 
  onNavigate,
  user = {} 
}) => {
  const auth = useAuth();
  const currentUser = auth?.user || user || {};
  const userInitial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
  const brandName = currentUser?.company_name || 'Traycase.com';
  const brandInitials = "TC"
    .toUpperCase();
  const location = useLocation();
  const navigate = useNavigate();
  const [openSubmenus, setOpenSubmenus] = useState({});
  
  // Navigation items with permission keys matching your backend format
  // Format: module_name.submodule_name.action (e.g., "procurement.products.view")
  const navItems = [
    { 
      to: '/dashboard', 
      icon: <BarChart3 size={20} />, 
      label: 'Dashboard',
      // Check for any dashboard permission
      permissions: ['dashboard.overview.view', 'dashboard.overview.create', 'dashboard.overview.edit', 'dashboard.overview.delete']
    },
    { 
      label: 'Inventory ', 
      icon: <Package size={20} />,
      permissionPrefix: 'inventory.',
      submenu: [
        {
          to: '/inventory',
          label: 'Inventory',
          permissions: [
            'inventory.inventory.view',
            'inventory.inventory.search',
            'inventory.inventory.export'
          ]
        },
        {
          to: '/inventory/products',
          label: 'Products',
          permissions: ['inventory.products.view', 'inventory.products.manage']
        },
        {
          to: '/inventory/product-categories',
          label: 'Product Categories',
          permissions: ['inventory.products.view', 'inventory.products.manage']
        },
        {
          to: '/inventory/parts',
          label: 'Parts',
          permissions: ['inventory.parts.view', 'inventory.parts.manage']
        },
        { 
          label: 'Containers',
          permissions: ['inventory.containers.view', 'inventory.containers.manage'],
          submenu: [
            { 
              to: '/inventory/containers/loadouts', 
              label: 'Loadouts',
              permissions: ['inventory.loadouts.view', 'inventory.loadouts.manage']
            },
            { 
              to: '/inventory/containers/blueprints', 
              label: 'Blueprints',
              permissions: ['inventory.blueprints.view', 'inventory.blueprints.manage']
            }
          ]
        },
        {
          to: '/inventory/locations',
          label: 'Locations',
          permissions: ['inventory.locations.view', 'inventory.locations.manage']
        },
        {
          to: '/inventory/bins',
          label: 'Bins',
          permissions: ['inventory.bins.view', 'inventory.inventory.view']
        },
        {
          to: '/inventory/location-groups',
          label: 'Location Groups',
          permissions: ['inventory.locations.view', 'inventory.locations.manage']
        },
        {
          to: '/inventory/transfer-orders',
          label: 'Transfer Orders',
          permissions: [
            'inventory.transfer_orders.view',
            'inventory.transfer_orders.create',
            'inventory.transfer_orders.edit'
          ]
        }
      ]
    },
    { 
      label: 'Procurement', 
      icon: <ShoppingCart size={20} />,
      permissionPrefix: 'procurement.',
      submenu: [
        { 
          to: '/procurement/suppliers', 
          label: 'Suppliers',
          permissions: ['procurement.suppliers.view', 'procurement.suppliers.manage']
        },
        { 
          to: '/procurement/purchase-orders', 
          label: 'Purchase Orders',
          permissions: ['procurement.purchase_orders.view', 'procurement.purchase_orders.manage']
        },
        { 
          to: '/procurement/receiving', 
          label: 'Receiving',
          permissions: ['procurement.receiving.view', 'procurement.receiving.manage']
        },
        { 
          to: '/procurement/dashboard', 
          label: 'POs Dashboard',
          permissions: ['procurement.dashboard.view']
        }
      ]
    },
    { 
      label: 'Warehouse', 
      icon: <Warehouse size={20} />,
      permissionPrefix: 'warehouse.',
      submenu: []
    },
    { 
      label: 'Sales', 
      icon: <DollarSign size={20} />,
      permissionPrefix: 'sales.',
      submenu: [
        { 
          to: '/cases/orders', 
          label: 'Cases',
          permissions: ['sales.cases.view', 'sales.cases.create', 'sales.cases.edit', 'sales.cases.delete', 'cases.cases.view', 'cases.cases.create']
        }
      ]
    },
    { 
      label: 'Accounting', 
      icon: <Package size={20} />,
      permissionPrefix: 'accounting.',
      submenu: []
    },
    { 
      label: 'Admin', 
      icon: <Settings size={20} />,
      permissionPrefix: 'admin.',
      submenu: [
        { 
          to: '/admin/users', 
          label: 'Users',
          permissions: ['admin.users.view', 'admin.users.create', 'admin.users.edit', 'admin.users.delete']
        },
        { 
          to: '/admin/roles', 
          label: 'Roles & Permissions',
          permissions: ['admin.roles_&_permissions.view', 'admin.roles_permissions.view', 'admin.roles.view']
        },
        { 
          to: '/admin/settings', 
          label: 'System Settings',
          permissions: ['admin.system_settings.view', 'admin.settings.view']
        },
        { 
          to: '/admin/audit-logs', 
          label: 'Audit Logs',
          permissions: ['admin.audit_logs.view']
        },
      ]
    }
  ];

  // Check if user has permission for an item
  const hasItemPermission = (item) => {
    // Super admins see everything
    if (currentUser?.is_super_admin === 1 || 
        currentUser?.is_super_admin === true || 
        currentUser?.role === 'super_admin') {
      return true;
    }
    
    const userPermissions = auth?.permissions || [];
    
    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }
    
    // If this is a module-level check (parent menu like "Procurement")
    if (item.permissionPrefix) {
      // Check if user has ANY permission starting with this prefix
      return userPermissions.some(perm => 
        typeof perm === 'string' && perm.startsWith(item.permissionPrefix)
      );
    }
    
    // If no specific permissions defined, don't show it
    if (!item.permissions || item.permissions.length === 0) {
      return false;
    }
    
    // Check if user has ANY of the required permissions
    if (auth?.hasAnyPermission) {
      return auth.hasAnyPermission(item.permissions);
    }
    
    // Fallback: check manually
    return item.permissions.some(permission => userPermissions.includes(permission));
  };

  // Recursively filter submenu items
  const filterSubmenu = (submenu) => {
    if (!submenu || submenu.length === 0) return [];
    
    return submenu
      .filter(subItem => hasItemPermission(subItem))
      .map(subItem => {
        if (subItem.submenu) {
          const filteredNested = filterSubmenu(subItem.submenu);
          return {
            ...subItem,
            submenu: filteredNested
          };
        }
        return subItem;
      })
      .filter(subItem => {
        // Remove parents with no visible children
        if (subItem.submenu && !subItem.to) {
          return subItem.submenu.length > 0;
        }
        return true;
      });
  };

  // Filter nav items based on permissions
  const filteredNavItems = useMemo(() => {
    return navItems
      .filter(item => hasItemPermission(item))
      .map(item => {
        if (item.submenu) {
          const filteredSub = filterSubmenu(item.submenu);
          return {
            ...item,
            submenu: filteredSub
          };
        }
        return item;
      })
      .filter(item => {
        // Remove parents with empty submenus (unless they have a direct link)
        if (item.submenu && !item.to) {
          return item.submenu.length > 0;
        }
        return true;
      });
  }, [currentUser, auth?.permissions]);

  // Auto-open submenu if current path is within it
  useEffect(() => {
    filteredNavItems.forEach(item => {
      if (item.submenu) {
        const hasActiveSubmenuItem = item.submenu.some(subItem => {
          if (subItem.to) {
            return isActive(subItem.to);
          }
          if (subItem.submenu) {
            return subItem.submenu.some(nested => nested.to && isActive(nested.to));
          }
          return false;
        });
        
        if (hasActiveSubmenuItem && !openSubmenus[item.label]) {
          setOpenSubmenus(prev => ({
            ...prev,
            [item.label]: true
          }));
        }
      }
    });
  }, [location.pathname, filteredNavItems]);
  
  // Toggle submenu
  const toggleSubmenu = (label) => {
    setOpenSubmenus(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  // Check if current path matches a menu item
  const isActive = (path) => {
    if (!path) return false;
    // Avoid making the inventory root look active for every deeper inventory route
    if (path === '/inventory') {
      return location.pathname === path;
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  // Handle navigation
  const handleNavigation = (e, path) => {
    e.preventDefault();
    if (path) {
      navigate(path);
      if (typeof onNavigate === 'function') {
        onNavigate();
      }
    }
  };

  // Determine CSS classes
  const sidebarClasses = [
    'sidebar',
    isCollapsed && 'collapsed',
    isOpen && 'open'
  ].filter(Boolean).join(' ');

  return (
    <div className={sidebarClasses}>
      <div className="sidebar-top">
        <div className="sidebar-brand-card">
          <div className="sidebar-brand-icon">{brandInitials}</div>
          <div className="sidebar-brand-meta">
            
            <span className="sidebar-brand-title">{brandName} </span>
            <span className="sidebar-brand-subtitle">Workspace</span>
          </div>
        </div>
      
      </div>
  <button
          onClick={onToggleCollapse}
          className="sidebar-toggle-floating"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      {/* Navigation */}
      <nav className="sidebar-nav">
        {filteredNavItems.map((item, index) => (
          <div key={index} className="nav-item">
            {item.to ? (
              // Direct link (no submenu)
              <a
                href={item.to}
                onClick={(e) => handleNavigation(e, item.to)}
                className={`nav-link ${isActive(item.to) ? 'active' : ''}`}
                aria-label={item.label}
                >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">{item.label}</span>
              </a>
            ) : (
              // Parent with submenu
              <div>
                <button
                  onClick={() => toggleSubmenu(item.label)}
                  className={`nav-link ${item.submenu?.some(subItem => {
                    // Check if this submenu item is active
                    if (subItem.to) {
                      return isActive(subItem.to);
                    }
                    // Check nested submenu items
                    if (subItem.submenu) {
                      return subItem.submenu.some(nested => nested.to && isActive(nested.to));
                    }
                    return false;
                  }) ? 'active' : ''} ${openSubmenus[item.label] ? 'open' : ''}`}
                  type="button"
                  aria-label={item.label}
                  aria-expanded={!!openSubmenus[item.label]}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-text">{item.label}</span>
                  {item.submenu && item.submenu.length > 0 && (
                    <span className="nav-arrow">
                      {openSubmenus[item.label] ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </span>
                  )}
                </button>
                
                {/* Submenu items */}
                {item.submenu && item.submenu.length > 0 && (
                  <div className={`nav-submenu ${openSubmenus[item.label] ? 'open' : ''}`}>
                    {item.submenu.map((subItem, subIndex) => (
                      <React.Fragment key={subIndex}>
                        {subItem.submenu ? (
                          // Nested submenu
                          <div className="nested-submenu">
                            <button
                              onClick={() => toggleSubmenu(`${item.label}-${subItem.label}`)}
                              className={`nav-link ${subItem.submenu?.some(nested => nested.to && isActive(nested.to)) ? 'has-active-child' : ''}`}
                              type="button"
                              aria-label={subItem.label}
                              aria-expanded={!!openSubmenus[`${item.label}-${subItem.label}`]}
                            >
                              <span className="nav-icon">
                                {subItem.icon || <span className="nav-dot" />}
                              </span>
                              <span className="nav-text">{subItem.label}</span>
                              <span className="nav-arrow">
                                {openSubmenus[`${item.label}-${subItem.label}`] ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </span>
                            </button>
                            {subItem.submenu && (
                              <div className={`nested-submenu-items ${openSubmenus[`${item.label}-${subItem.label}`] ? 'open' : ''}`}>
                                {subItem.submenu.map((nestedItem, nestedIndex) => (
                                  <a
                                    key={nestedIndex}
                                    href={nestedItem.to}
                                    onClick={(e) => handleNavigation(e, nestedItem.to)}
                                    className={`nav-link ${isActive(nestedItem.to) ? 'active' : ''}`}
                                    aria-label={nestedItem.label}
                                  >
                                    <span className="nav-icon">
                                      {nestedItem.icon || <span className="nav-dot" />}
                                    </span>
                                    <span className="nav-text">{nestedItem.label}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          // Regular submenu item
                          <a
                            href={subItem.to}
                            onClick={(e) => handleNavigation(e, subItem.to)}
                            className={`nav-link ${isActive(subItem.to) ? 'active' : ''}`}
                            aria-label={subItem.label}
                          >
                            <span className="nav-icon">
                              {subItem.icon || <span className="nav-dot" />}
                            </span>
                            <span className="nav-text">{subItem.label}</span>
                          </a>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>
      
      {/* User section */}
      <div className="sidebar-user">
        <div className="user-avatar">
          {userInitial}
        </div>
        <div className="user-details">
          <div className="user-name">{currentUser?.name || 'User'}</div>
          <div className="user-role">{currentUser?.role || 'User'}</div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
