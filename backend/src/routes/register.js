const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();
const ROLES = [
  'registrar',
  'nurse',
  'doctor',
  'lab_technician',
  'pharmacist',
  'admin',
];
router.post('/register', async (req, res, next) => {
  try {
    const { fullName, username, password, requestedRole } = req.body || {};
    if (
      typeof fullName !== 'string' ||
      !fullName.trim() ||
      fullName.trim().length > 120 ||
      typeof username !== 'string' ||
      !/^[A-Za-z0-9._-]{3,50}$/.test(username.trim()) ||
      typeof password !== 'string' ||
      password.length < 10 ||
      Buffer.byteLength(password, 'utf8') > 72 ||
      !ROLES.includes(requestedRole)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid registration details or requested role.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.query(
      `INSERT INTO users (full_name,username,password_hash,role,requested_role,approval_status)
      VALUES ($1,$2,$3,'registrar',$4,'pending')`,
      [fullName.trim(), username.trim(), passwordHash, requestedRole],
    );
    return res
      .status(201)
      .json({
        message:
          'Registration submitted. An administrator must approve your account before you can sign in.',
      });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'That username is already taken.' });
    next(err);
  }
});
module.exports = router;
