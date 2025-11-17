// middleware/requireAuth.mjs
import jwt from 'jsonwebtoken';
import pool from '../db/pool.mjs';

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (decoded?.user_id) {
      const [roleRows] = await pool.query(
        `
        SELECT r.role_name
        FROM user_roles ur
        JOIN roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = ?
        `,
        [decoded.user_id]
      );
      req.user.roles = roleRows.map(r => (r.role_name || '').toLowerCase());
    }

    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
