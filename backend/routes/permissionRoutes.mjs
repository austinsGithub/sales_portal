import express from 'express';
import { verifyToken } from '../controllers/authController.mjs';
import { getMyPermissionKeysHandler } from '../controllers/security/permissionsController.mjs';

const router = express.Router();

// Get current user's permission keys
router.get('/my-keys', verifyToken, getMyPermissionKeysHandler);

export default router;
