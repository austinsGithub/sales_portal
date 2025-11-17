import pool from '../db/pool.mjs';

export async function superAdminOnly(req, res, next) {
  try {
    // req.user should already be set by your auth middleware
    if (typeof req.user?.is_super_admin === 'undefined') {
      const [rows] = await pool.query('SELECT is_super_admin FROM users WHERE user_id = ? LIMIT 1', [req.user.user_id]);
      req.user.is_super_admin = rows?.[0]?.is_super_admin ?? 0;
    }
    if (req.user.is_super_admin === 1) return next();
    return res.status(403).json({ error: 'Super admin only' });
  } catch (err) {
    console.error('superAdminOnly error', err);
    return res.status(500).json({ error: 'Authz check failed' });
  }
}
