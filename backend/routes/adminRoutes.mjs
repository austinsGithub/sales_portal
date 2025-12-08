import express from 'express';
import { verifyToken } from '../controllers/authController.mjs';
import { superAdminOnly } from '../middleware/superAdminOnly.mjs';
import {
  getModuleAccess,
  updateModuleAccess,
  updateRolePermissions
} from '../controllers/admin/moduleAccessController.mjs';
import {
  getRoles,
  createRole,
  getPermissions,
  createPermission,
  getRolePermissions,
  assignRolePermission,
  removeRolePermission
} from '../controllers/admin/rolesPermissionsController.mjs';

// Existing imports - FIXED: Added getUserHandler to imports
import {
  getAllUsersHandler,
  getUserHandler,  // <-- ADDED: This was missing
  listRolesHandler,
  setSuperAdminHandler,
  assignRoleHandler,
  removeRoleHandler,
  listPermissionsHandler,
  assignPermissionToRoleHandler,
  removePermissionFromRoleHandler,
  setUserPermissionOverrideHandler,
  createRoleHandler,
  createPermissionHandler,
  getRolePermissionsHandler,
  updateUserHandler,
  createUserHandler,
  assignSubmoduleToRoleHandler,
  removeSubmoduleFromRoleHandler,
  listModulesHandler,
  createModuleHandler,
  listSubmodulesHandler,
  createSubmoduleHandler,
  resetUserPasswordHandler
} from '../controllers/admin/adminController.mjs';
import {
  listCompanies as listCompaniesHandler,
  getCompany as getCompanyHandler,
  createCompanyHandler,
  updateCompanyHandler,
  deactivateCompanyHandler,
  deleteCompanyHandler,
  companyMetadataHandler,
} from '../controllers/admin/companiesController.mjs';

const router = express.Router();

// Temporary debug middleware to log whether Authorization header is present
// and what verifyToken attached to req.user. Remove this in production.
function debugAuthPresence(req, res, next) {
  try {
    const authHeader = req.headers.authorization || null;
    console.log('[adminRoutes] Authorization header present:', !!authHeader);
    // If verifyToken ran before this middleware, req.user will be available.
    if (req.user) {
      console.log('[adminRoutes] req.user:', { user_id: req.user.user_id, is_super_admin: req.user.is_super_admin });
    }
  } catch (e) {
    console.error('[adminRoutes] debugAuthPresence error:', e);
  }
  next();
}

// Apply super admin middleware to all admin routes
router.use(verifyToken, superAdminOnly);

// User Management
router.get('/users', getAllUsersHandler);
router.get('/users/:id', getUserHandler);  // <-- Now properly imported
router.post('/users', createUserHandler);
router.put('/users/:id', updateUserHandler);
router.put('/users/:id/super', setSuperAdminHandler);
router.post('/users/:userId/reset-password', resetUserPasswordHandler);

// Role Management
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.post('/roles/assign', assignRoleHandler);
router.post('/roles/remove', removeRoleHandler);

// Permission Management
router.get('/permissions', getPermissions);
router.post('/permissions', createPermission);

// Module and Submodule Management
router.get('/modules', listModulesHandler);
router.post('/modules', createModuleHandler);
router.get('/modules/access', getModuleAccess);
router.post('/modules/access', updateModuleAccess);
router.get('/modules/:moduleId/submodules', listSubmodulesHandler);
router.post('/submodules', createSubmoduleHandler);

// Role-Permission Management
router.get('/roles/:roleId/permissions', getRolePermissions);
router.post('/role_permissions/update', updateRolePermissions);
router.post('/role_permissions/assign', assignPermissionToRoleHandler);
router.post('/role_permissions/remove', removePermissionFromRoleHandler);

// User Permission Overrides
router.post('/user_permissions/set', setUserPermissionOverrideHandler);

// Submodule Permissions
router.post('/roles/submodule/assign', assignSubmoduleToRoleHandler);
router.post('/roles/submodule/remove', removeSubmoduleFromRoleHandler);

// Companies Management
router.get('/companies/meta', companyMetadataHandler);
router.get('/companies', listCompaniesHandler);
router.post('/companies', createCompanyHandler);
router.get('/companies/:id', getCompanyHandler);
router.patch('/companies/:id', updateCompanyHandler);
router.post('/companies/:id/deactivate', deactivateCompanyHandler);
router.delete('/companies/:id', deleteCompanyHandler);

export default router;
