const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../audit');
const { validate } = require('./validate');
const { requireAuth, signToken } = require('./auth');
const router = express.Router();
const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
router.post('/login', validate(loginSchema), async (req, res, next) => {
  const t0 = performance.now();
  try {
    const { username, password } = req.body;
    const { rows } = await db.query('SELECT * FROM users WHERE username=$1', [
      username,
    ]);
    const t1 = performance.now();
    const user = rows[0];
    const ok = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;
    const t2 = performance.now();
    if (!ok)
      return res.status(401).json({ error: 'Invalid username or password' });
    if (user.approval_status !== 'approved')
      return res.status(403).json({
        error: 'Account awaiting administrator approval or not approved.',
      });
    await audit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'user',
      entityId: user.id,
    });
    const t3 = performance.now();
    console.info('Login timings (ms)', {
      db: Math.round(t1 - t0),
      bcrypt: Math.round(t2 - t1),
      audit: Math.round(t3 - t2),
      total: Math.round(t3 - t0),
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
    next(err);
  }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
module.exports = router;
