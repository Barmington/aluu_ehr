const express = require('express');
const db = require('../db');
const { requireRole, requireAuth } = require('../middleware/auth'); // adjust

const router = express.Router();
const ROLES = ['registrar', 'nurse', 'doctor', 'admin'];

// Everything in this file is admin-only
router.use(requireAuth, requireRole('admin'));

// List users
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, full_name, username, role, created_at FROM users ORDER BY created_at DESC',
    );
    res.json(
      result.rows.map(u => ({
        id: u.id,
        fullName: u.full_name,
        username: u.username,
        role: u.role,
        createdAt: u.created_at,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Change a user's role
router.put('/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    // Stops an admin locking themselves out
    if (Number(req.params.id) === req.user.id) {
      return res
        .status(400)
        .json({ error: 'You cannot change your own role.' });
    }
    const result = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, username, role',
      [role, req.params.id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const u = result.rows[0];
    res.json({
      id: u.id,
      fullName: u.full_name,
      username: u.username,
      role: u.role,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
