const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../audit');
const { validate } = require('../middleware/validate');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [
      username,
    ]);
    const user = rows[0];

    // Same message for unknown user / wrong password (no user enumeration)
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok)
      return res.status(401).json({ error: 'Invalid username or password' });

    await audit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
    });

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
