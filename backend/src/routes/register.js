const express = require('express');
const bcrypt = require('bcrypt');

const db = require('../db'); // adjust the path to where db.js lives
const router = express.Router();

const BCRYPT_ROUNDS = 12;
const DEFAULT_ROLE = 'Registrar'; // always assigned server-side, never read from the request

function validate({ fullName, username, password }) {
  if (
    typeof fullName !== 'string' ||
    typeof username !== 'string' ||
    typeof password !== 'string'
  ) {
    return 'Full name, username and password are required.';
  }

  const name = fullName.trim();
  const user = username.trim();

  if (!name || name.length > 120)
    return 'Full name is required (max 120 characters).';
  if (user.length < 3 || user.length > 50)
    return 'Username must be 3 to 50 characters.';
  if (!/^[A-Za-z0-9._-]+$/.test(user)) {
    return 'Username may only contain letters, numbers, dots, underscores and hyphens.';
  }
  if (password.length < 10) return 'Password must be at least 10 characters.';
  // bcrypt silently ignores bytes beyond 72, so reject rather than truncate.
  if (Buffer.byteLength(password, 'utf8') > 72)
    return 'Password is too long (max 72 bytes).';

  return null;
}
router.post('/register', async (req, res) => {
  try {
    const problem = validate(req.body || {});
    if (problem) return res.status(400).json({ message: problem });

    // Ignore any "role" or other extra fields the client may send.
    const fullName = req.body.fullName.trim();
    const username = req.body.username.trim();
    const password = req.body.password;

    // Friendly duplicate check (case-insensitive).
    const existing = await db.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [username],
    );
    if (existing.rowCount > 0) {
      return res
        .status(409)
        .json({ message: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (full_name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, username, role, created_at`,
      [fullName, username, passwordHash, DEFAULT_ROLE],
    );

    const u = result.rows[0];
    return res.status(201).json({
      id: u.id,
      fullName: u.full_name,
      username: u.username,
      role: u.role,
      createdAt: u.created_at,
    });
  } catch (err) {
    // Two simultaneous sign-ups can both pass the check above; the unique index catches that.
    if (err.code === '23505') {
      return res
        .status(409)
        .json({ message: 'That username is already taken.' });
    }
    console.error('Register error:', err.message); // never log the request body
    return res.status(500).json({ message: 'Unable to create your account.' });
  }
});

module.exports = router;
