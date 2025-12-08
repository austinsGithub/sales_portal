import { useAuth } from '../shared/contexts/AuthContext';

/**
 * Custom hook for permission-based UI rendering
 * Provides convenient methods for checking permissions in components
 */
export const usePermissions = () => {
  const { 
    user, 
    permissions, 
    hasPermission, 
    hasAnyPermission, 
    hasAllPermissions 
  } = useAuth();

  /**
   * Check if user can perform a specific action
   * Supports wildcard patterns like 'module.*'
   */
  const can = (permissionKey) => {
    return hasPermission(permissionKey);
  };

  /**
   * Check if user can perform any of the given actions
   */
  const canAny = (permissionKeys) => {
    return hasAnyPermission(permissionKeys);
  };

  /**
   * Check if user can perform all of the given actions
   */
  const canAll = (permissionKeys) => {
    return hasAllPermissions(permissionKeys);
  };

  /**
   * Check if user has access to a specific module
   */
  const canAccessModule = (moduleName) => {
    // Check for wildcard permission or specific module access
    return hasAnyPermission([
      '*',
      `${moduleName}.*`,
      `${moduleName}.dashboard.view`,
      `${moduleName}.view`
    ]);
  };

  /**
   * Get all permissions for debugging
   */
  const getAllPermissions = () => {
    return permissions;
  };

  /**
   * Check if user is super admin
   */
  const isSuperAdmin = () => {
    return user?.is_super_admin === 1 || user?.is_super_admin === true;
  };

  return {
    can,
    canAny,
    canAll,
    canAccessModule,
    getAllPermissions,
    isSuperAdmin,
    permissions,
    user
  };
};

/**
 * Example Usage in Components:
 * 
 * 1. Basic permission check:
 * ```jsx
 * function SuppliersList() {
 *   const { can } = usePermissions();
 *   
 *   return (
 *     <div>
 *       {can('procurement.suppliers.view') && (
 *         <SupplierTable />
 *       )}
 *       
 *       {can('procurement.suppliers.create') && (
 *         <button onClick={handleCreate}>Add Supplier</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 * 
 * 2. Multiple permission checks:
 * ```jsx
 * function UserManagement() {
 *   const { canAny, canAll } = usePermissions();
 *   
 *   return (
 *     <div>
 *       {canAny(['admin.users.view', 'admin.users.edit']) && (
 *         <UserList />
 *       )}
 *       
 *       {canAll(['admin.users.edit', 'admin.users.delete']) && (
 *         <DangerZone />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 * 
 * 3. Module access check:
 * ```jsx
 * function Sidebar() {
 *   const { canAccessModule } = usePermissions();
 *   
 *   return (
 *     <nav>
 *       {canAccessModule('procurement') && (
 *         <MenuItem to="/procurement">Procurement</MenuItem>
 *       )}
 *       
 *       {canAccessModule('sales') && (
 *         <MenuItem to="/sales">Sales</MenuItem>
 *       )}
 *       
 *       {canAccessModule('admin') && (
 *         <MenuItem to="/admin">Administration</MenuItem>
 *       )}
 *     </nav>
 *   );
 * }
 * ```
 * 
 * 4. Conditional rendering in tables:
 * ```jsx
 * function PurchaseOrderRow({ order }) {
 *   const { can } = usePermissions();
 *   
 *   return (
 *     <tr>
 *       <td>{order.id}</td>
 *       <td>{order.supplier}</td>
 *       <td>{order.total}</td>
 *       <td>
 *         {can('procurement.purchase_orders.edit') && (
 *           <button onClick={() => handleEdit(order)}>Edit</button>
 *         )}
 *         
 *         {can('procurement.purchase_orders.approve') && (
 *           <button onClick={() => handleApprove(order)}>Approve</button>
 *         )}
 *         
 *         {can('procurement.purchase_orders.delete') && (
 *           <button onClick={() => handleDelete(order)}>Delete</button>
 *         )}
 *       </td>
 *     </tr>
 *   );
 * }
 * ```
 * 
 * 5. Form field permissions:
 * ```jsx
 * function ProductForm({ product }) {
 *   const { can } = usePermissions();
 *   
 *   return (
 *     <form>
 *       <input 
 *         name="name" 
 *         value={product.name}
 *         disabled={!can('procurement.products.edit')}
 *       />
 *       
 *       <input 
 *         name="price" 
 *         value={product.price}
 *         disabled={!can('procurement.products.edit_price')}
 *       />
 *       
 *       {can('procurement.products.edit') && (
 *         <button type="submit">Save</button>
 *       )}
 *     </form>
 *   );
 * }
 * ```
 * 
 * 6. Debug permissions:
 * ```jsx
 * function DebugPanel() {
 *   const { getAllPermissions, isSuperAdmin, user } = usePermissions();
 *   
 *   if (process.env.NODE_ENV !== 'development') return null;
 *   
 *   return (
 *     <div style={{ background: '#f0f0f0', padding: '1rem' }}>
 *       <h3>Debug: User Permissions</h3>
 *       <p>User: {user?.username}</p>
 *       <p>Super Admin: {isSuperAdmin() ? 'Yes' : 'No'}</p>
 *       <p>Permissions:</p>
 *       <ul>
 *         {getAllPermissions().map(perm => (
 *           <li key={perm}>{perm}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
