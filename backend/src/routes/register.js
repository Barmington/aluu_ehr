const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const DEFAULT_ROLE = 'registrar';

const ALLOWED_ROLES = [
  'registrar',
  'doctor',
  'nurse',
  'lab_technician',
  'pharmacist',
  'admin',
];

function validate({ fullName, username, password, requestedRole }) {
  if (
    typeof fullName !== 'string' ||
    typeof username !== 'string' ||
    typeof password !== 'string'
  ) {
    return 'Full name, username and password are required.';
  }

  const name = fullName.trim();
  const user = username.trim();

  if (!name || name.length > 120) {
    return 'Full name is required (max 120 characters).';
  }

  if (user.length < 3 || user.length > 50) {
    return 'Username must be 3 to 50 characters.';
  }

  if (!/^[A-Za-z0-9._-]+$/.test(user)) {
    return 'Username may only contain letters, numbers, dots, underscores and hyphens.';
  }

  if (password.length < 10) {
    return 'Password must be at least 10 characters.';
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password is too long (max 72 bytes).';
  }

  if (requestedRole !== undefined && !ALLOWED_ROLES.includes(requestedRole)) {
    return 'Invalid role selected.';
  }

  return null;
}

router.post('/register', async (req, res) => {
  try {
    const problem = validate(req.body || {});

    if (problem) {
      return res.status(400).json({ error: problem });
    }

    const fullName = req.body.fullName.trim();
    const username = req.body.username.trim();
    const password = req.body.password;
    const requestedRole = req.body.requestedRole ?? DEFAULT_ROLE;

    const existing = await db.query(
      'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [username],
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: 'That username is already taken.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (
        full_name,
        username,
        password_hash,
        role,
        requested_role
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        full_name,
        username,
        role,
        requested_role,
        created_at`,
      [fullName, username, passwordHash, DEFAULT_ROLE, requestedRole],
    );

    const u = result.rows[0];

    return res.status(201).json({
      id: u.id,
      fullName: u.full_name,
      username: u.username,
      role: u.role,
      requestedRole: u.requested_role,
      createdAt: u.created_at,
      message: 'Registration successful.',
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'That username is already taken.',
      });
    }

    console.error('Register error:', err.message);

    return res.status(500).json({
      error: 'Unable to create your account.',
    });
  }
});

module.exports = router;
