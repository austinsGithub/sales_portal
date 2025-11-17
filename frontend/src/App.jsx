import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/contexts/AuthContext';
import Sidebar from './components/Sidebar/Sidebar';
import TopBar from './components/TopBar/TopBar';
import LoginPage from './pages/modules/auth/Login';
import Dashboard from './dashboards/Dashboard';
import { AccountSettings, AdminSettings, UsersPage, RolesPage } from './pages/modules/admin';

// Procurement Module
import {
  Dashboard as ProcurementDashboard,
  Suppliers,
  PurchaseOrders,
  Receiving
} from './pages/modules/procurement';

// Inventory Module
import {
  Inventory,
  Products,
  Parts,
  ContainerLoadouts,
  ContainersBlueprint,
  Locations,
  LocationGroups,
  TransferOrders
} from './pages/modules/inventory';

// Sales Module
import {
  Cases,
  NewOrder,
  AllOrders,
  InventoryOrders
} from './pages/modules/sales';

import './css/global/App.css';
import './css/global/Layout.css';
import './css/global/loading.css';
import './css/global/DetailPanels.css';

// -------------------- Protected Route --------------------
const ProtectedRoute = ({ children, requiredPermissions = [], requireAll = false }) => {
  const { user, isLoading, hasAnyPermission, hasAllPermissions, permissions } = useAuth();

  // Wait for both user AND permissions to load
  if (isLoading || !user?.role) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <div className="mt-4 text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If no permissions required, allow access
  if (requiredPermissions.length === 0) {
    return children;
  }

  const hasAccess = requireAll 
    ? hasAllPermissions(requiredPermissions)
    : hasAnyPermission(requiredPermissions);

  if (!hasAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// -------------------- AppContent --------------------
const AppContent = () => {
  const { user, logout, isLoading } = useAuth();
  const isLoggedIn = !!user;

  // CRITICAL FIX: Wait for auth to complete before routing
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <div className="mt-4 text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  const LoggedInLayout = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleToggleSidebar = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (isMobile) {
        setSidebarOpen(prev => !prev);
      } else {
        setIsCollapsed(prev => !prev);
      }
    };

    const handleLogout = () => {
      logout();
    };

    const handleCloseSidebar = () => {
      if (isMobile) {
        setSidebarOpen(false);
      }
    };

    // Track viewport size to switch between desktop and mobile behaviors
    useEffect(() => {
      const handleResize = () => {
        const mobile = window.innerWidth <= 1024;
        setIsMobile(mobile);

        if (!mobile) {
          setSidebarOpen(false);
        } else {
          setIsCollapsed(false);
        }
      };

      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Prevent background scroll when mobile sidebar is open
    useEffect(() => {
      if (isMobile && sidebarOpen) {
        document.body.classList.add('no-scroll');
      } else {
        document.body.classList.remove('no-scroll');
      }

      return () => {
        document.body.classList.remove('no-scroll');
      };
    }, [isMobile, sidebarOpen]);

    const mainContentClasses = [
      'main-content-container',
      !isMobile && isCollapsed ? 'sidebar-collapsed' : ''
    ].filter(Boolean).join(' ');

    const currentYear = new Date().getFullYear();
    const companyName = 'Traycase';

    return (
      <div className="app-container">
        <div className={`sidebar-container ${(!isMobile && isCollapsed) ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
          <Sidebar
            isCollapsed={isMobile ? false : isCollapsed}
            isOpen={isMobile ? sidebarOpen : false}
            onToggleCollapse={handleToggleSidebar}
            onNavigate={handleCloseSidebar}
            onLogout={handleLogout}
          />
        </div>

        {isMobile && (
          <div 
            className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
            onClick={handleCloseSidebar}
          />
        )}

        <div className={mainContentClasses}>
          <TopBar onLogout={handleLogout} onToggleSidebar={handleToggleSidebar} />

          <div className="content-scrollable">
            <Outlet />
          </div>
          
          <footer className="app-footer">
            <div className="footer-left">
              <span className="footer-title">{companyName}</span>
              <span className="footer-divider">•</span>
              <span>Operational Excellence</span>
            </div>
            <div className="footer-right">
              <span>© {currentYear} {companyName}</span>
            </div>
          </footer>
        </div>
      </div>
    );
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!isLoggedIn ? <LoginPage /> : <Navigate to="/dashboard" replace />} />

        <Route 
          path="/" 
          element={isLoggedIn ? <LoggedInLayout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          <Route path="unauthorized" element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>Access Denied</h1>
              <p>You don't have permission to access this page.</p>
              <button onClick={() => window.history.back()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Go Back
              </button>
            </div>
          } />

          <Route path="dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          {/* Procurement Module */}
          <Route path="procurement/dashboard" element={
            <ProtectedRoute requiredPermissions={['procurement.dashboard.view']}>
              <ProcurementDashboard />
            </ProtectedRoute>
          } />
          <Route path="procurement/containers-loadout" element={
            <ProtectedRoute requiredPermissions={['procurement.containers.view']}>
              <ContainerLoadouts />
            </ProtectedRoute>
          } />
          <Route path="procurement/suppliers" element={
            <ProtectedRoute requiredPermissions={['procurement.suppliers.view']}>
              <Suppliers />
            </ProtectedRoute>
          } />
          <Route path="procurement/purchase-orders" element={
            <ProtectedRoute requiredPermissions={['procurement.purchase_orders.view']}>
              <PurchaseOrders />
            </ProtectedRoute>
          } />
          <Route path="procurement/products" element={
            <ProtectedRoute requiredPermissions={['procurement.products.view']}>
              <Products />
            </ProtectedRoute>
          } />
          <Route path="procurement/receiving" element={
            <ProtectedRoute requiredPermissions={['procurement.receiving.view']}>
              <Receiving />
            </ProtectedRoute>
          } />
          <Route path="procurement/parts" element={
            <ProtectedRoute requiredPermissions={['procurement.parts.view']}>
              <Parts />
            </ProtectedRoute>
          } />
          <Route path="procurement/containers-blueprint" element={
            <ProtectedRoute requiredPermissions={['procurement.containers.view']}>
              <ContainersBlueprint />
            </ProtectedRoute>
          } />

          {/* Inventory Module */}
          <Route path="inventory" element={
            <ProtectedRoute requiredPermissions={['inventory.inventory.view']}>
              <Inventory />
            </ProtectedRoute>
          } />
          <Route path="inventory/products" element={
            <ProtectedRoute requiredPermissions={['inventory.products.view']}>
              <Products />
            </ProtectedRoute>
          } />
          <Route path="inventory/parts" element={
            <ProtectedRoute requiredPermissions={['inventory.parts.view']}>
              <Parts />
            </ProtectedRoute>
          } />
          <Route path="inventory/containers/loadouts" element={
            <ProtectedRoute requiredPermissions={['inventory.containers.view', 'inventory.loadouts.view']}>
              <ContainerLoadouts />
            </ProtectedRoute>
          } />
          <Route path="inventory/containers/blueprints" element={
            <ProtectedRoute requiredPermissions={['inventory.containers.view', 'inventory.blueprints.view']}>
              <ContainersBlueprint />
            </ProtectedRoute>
          } />
          <Route path="inventory/locations" element={
            <ProtectedRoute requiredPermissions={['inventory.locations.view']}>
              <Locations />
            </ProtectedRoute>
          } />
          <Route path="inventory/location-groups" element={
            <ProtectedRoute requiredPermissions={['inventory.locations.view']}>
              <LocationGroups />
            </ProtectedRoute>
          } />
          <Route path="inventory/transfer-orders" element={
            <ProtectedRoute requiredPermissions={['inventory.transfer_orders.view']}>
              <TransferOrders />
            </ProtectedRoute>
          } />

          {/* Sales Module */}
          <Route path="sales/cases" element={
            <ProtectedRoute requiredPermissions={['sales.cases.view']}>
              <Cases />
            </ProtectedRoute>
          } />

          {/* Admin pages */}
          <Route path="admin/settings" element={
            <ProtectedRoute requiredPermissions={['admin.settings.view']}>
              <AdminSettings />
            </ProtectedRoute>
          } />
          <Route path="admin/users" element={
            <ProtectedRoute requiredPermissions={['admin.users.view']}>
              <UsersPage />
            </ProtectedRoute>
          } />
          <Route path="admin/roles" element={
            <ProtectedRoute requiredPermissions={['admin.roles.view']}>
              <RolesPage />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
        
        <Route path="*" element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
