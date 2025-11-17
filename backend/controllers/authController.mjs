// ============================================================================
// IMPORTS
// ============================================================================
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.mjs';
import { getUserByEmail } from '../models/userModel.mjs';

// ============================================================================
// HELPERS
// ============================================================================
function assertJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  return process.env.JWT_SECRET;
}
export function generateToken(payload, expiresIn = '14d') {
  return jwt.sign(payload, assertJwtSecret(), { expiresIn });
}

export function verifyTokenRaw(token) {
  return jwt.verify(token, assertJwtSecret());
}

// ============================================================================
// AUTH CONTROLLERS
// ============================================================================
/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, msg: 'Email and password are required' });
  }

  try {
    // 1) Load user by email
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, msg: 'Invalid credentials' });

    // 2) Optional account status check
    if (user.is_active === 0) {
      return res.status(403).json({ success: false, msg: 'Account is inactive' });
    }

    // 3) Compare password
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, msg: 'Invalid credentials' });

    // 4) Load roles (names + ids) via user_roles → roles
    const [roleRows] = await pool.query(
      `
      SELECT r.role_id, r.role_name
      FROM user_roles ur
      JOIN roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [user.user_id]
    );

    // 5) Sign JWT - This will create the login token - |||| TOKEN ||||

    const token = generateToken({
      user_id: user.user_id,
      company_id: user.company_id,
      email: user.email,
      is_super_admin: user.is_super_admin
    });

    return res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        company_id: user.company_id,
        email: user.email,
        username: user.username,
        is_super_admin: user.is_super_admin,
        roles: roleRows.map(r => ({ role_id: r.role_id, role_name: r.role_name })),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, msg: 'Server error during login' });
  }
}

/**
 * POST /api/auth/register
 * Body: { email, password, company_id, username?, first_name?, last_name?, role_name? }
 */
export async function register(req, res) {
  const {
    email,
    password,
    company_id,
    username = null,
    first_name = null,
    last_name = null,
    role_name = 'User',
  } = req.body || {};

  if (!email || !password || !company_id) {
    return res.status(400).json({ success: false, msg: 'email, password, and company_id are required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) ensure unique email
    const [exists] = await conn.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (exists.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, msg: 'User already exists' });
    }

    // 2) insert user
    const passwordHash = await bcrypt.hash(password, 10);
    const [ins] = await conn.query(
      `
      INSERT INTO users (
        company_id, username, email, password_hash, first_name, last_name,
        is_active, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
      `,
      [company_id, username, email, passwordHash, first_name, last_name]
    );
    const userId = ins.insertId;

    // 3) ensure role exists for company
    let roleId;
    const [roleRows] = await conn.query(
      `SELECT role_id FROM roles WHERE company_id = ? AND role_name = ?`,
      [company_id, role_name]
    );
    if (roleRows.length) {
      roleId = roleRows[0].role_id;
    } else {
      const [roleIns] = await conn.query(
        `INSERT INTO roles (company_id, role_name, created_at) VALUES (?, ?, NOW())`,
        [company_id, role_name]
      );
      roleId = roleIns.insertId;
    }

    // 4) map user → role
    await conn.query(
      `INSERT INTO user_roles (user_id, role_id, company_id, assigned_at) VALUES (?, ?, ?, NOW())`,
      [userId, roleId, company_id]
    );

    await conn.commit();
    return res.status(201).json({
      success: true,
      msg: 'User registered successfully',
      user_id: userId,
      role_id: roleId,
    });
  } catch (e) {
    await conn.rollback();
    console.error('Registration error:', e);
    return res.status(500).json({ success: false, msg: 'Registration failed' });
  } finally {
    conn.release();
  }
}

// ============================================================================
// REQUEST MIDDLEWARE
// ============================================================================
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    req.user = verifyTokenRaw(token); // { user_id, company_id, email, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * POST /api/auth/logout
 * Simple logout endpoint to clear any server-side session/cookie if present.
 */
export async function logout(req, res) {
  try {
    // If using an HTTP-only cookie for tokens, clear it here. For now return success.
    return res.json({ success: true });
  } catch (e) {
    console.error('Logout error:', e);
    return res.status(500).json({ success: false, msg: 'Logout failed' });
  }
}
