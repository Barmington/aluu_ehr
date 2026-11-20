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
  const started = performance.now();

  try {
    const { username, password } = req.body;

    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [
      username,
    ]);

    const dbMs = performance.now() - started;
    const user = rows[0];

    const passwordStart = performance.now();

    const ok = user && (await bcrypt.compare(password, user.password_hash));

    const bcryptMs = performance.now() - passwordStart;

    if (!ok) {
      return res.status(401).json({
        error: 'Invalid username or password',
      });
    }
    if (user.approval_status !== 'approved') {
      return res.status(403).json({
        error: 'Account awaiting administrator approval or not approved.',
      });
    }
    const auditStart = performance.now();

    await audit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
    });

    const auditMs = performance.now() - auditStart;

    console.info('Login performance:', {
      dbMs: Math.round(dbMs),
      bcryptMs: Math.round(bcryptMs),
      auditMs: Math.round(auditMs),
      totalMs: Math.round(performance.now() - started),
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
