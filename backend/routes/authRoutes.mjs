import express from 'express';
import { login, logout } from '../controllers/authController.mjs';

const router = express.Router();
/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
router.post('/login', login);
router.post('/logout', logout);

export default router;