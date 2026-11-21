const express = require('express');
const db = require('../db');
const { requireRole, requireAuth } = require('../middleware/auth');
const { audit } = require('../audit');
const router = express.Router();
const ROLES = [
  'registrar',
  'nurse',
  'doctor',
  'lab_technician',
  'pharmacist',
  'admin',
];
router.use(requireAuth, requireRole('admin'));
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id,full_name,username,role,requested_role,approval_status,created_at FROM users ORDER BY created_at DESC',
    );
    res.json(
      rows.map(u => ({
        id: u.id,
        fullName: u.full_name,
        username: u.username,
        role: u.role,
        requestedRole: u.requested_role,
        approvalStatus: u.approval_status,
        createdAt: u.created_at,
      })),
    );
  } catch (err) {
    next(err);
  }
});
router.put('/:id/approval', async (req, res, next) => {
  const id = Number(req.params.id);
  const { decision, role } = req.body || {};

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !['approved', 'rejected'].includes(decision) ||
    (decision === 'approved' && !ROLES.includes(role))
  ) {
    return res.status(400).json({
      error: 'Invalid approval decision or role',
    });
  }

  if (id === Number(req.user.id)) {
    return res.status(400).json({
      error: 'Cannot approve or reject your own account',
    });
  }

  try {
    const result = await db.withTransaction(async client => {
      const { rows } = await client.query(
        'SELECT id, approval_status FROM users WHERE id=$1 FOR UPDATE',
        [id],
      );

      if (!rows.length) {
        return { status: 404, error: 'User not found' };
      }

      if (rows[0].approval_status !== 'pending') {
        return {
          status: 409,
          error: 'Account has already been reviewed',
        };
      }

      const { rows: updated } = await client.query(
        `UPDATE users
   SET
     approval_status = $1::varchar,
     role = CASE
       WHEN $1::varchar = 'approved'
       THEN $2::varchar
       ELSE role
     END,
     approved_by = CASE
       WHEN $1::varchar = 'approved'
       THEN $3::integer
       ELSE NULL
     END,
     approved_at = CASE
       WHEN $1::varchar = 'approved'
       THEN now()
       ELSE NULL
     END,
     rejected_at = CASE
       WHEN $1::varchar = 'rejected'
       THEN now()
       ELSE NULL
     END
   WHERE id = $4::integer
   RETURNING id, username, role, approval_status`,
        [decision, role || null, req.user.id, id],
      );

      await audit(
        {
          userId: req.user.id,
          action: decision === 'approved' ? 'APPROVE_USER' : 'REJECT_USER',
          entity: 'user',
          entityId: id,
          details: {
            role: decision === 'approved' ? role : null,
          },
        },
        client,
      );

      return { user: updated[0] };
    });

    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
      });
    }

    res.json(result.user);
  } catch (err) {
    next(err);
  }
});
router.put('/:id/role', async (req, res, next) => {
  const id = Number(req.params.id),
    { role } = req.body || {};
  if (!Number.isSafeInteger(id) || id <= 0 || !ROLES.includes(role))
    return res.status(400).json({ error: 'Invalid user or role' });
  if (id === Number(req.user.id))
    return res.status(400).json({ error: 'You cannot change your own role' });
  try {
    const result = await db.withTransaction(async client => {
      const { rows } = await client.query(
        "UPDATE users SET role=$1 WHERE id=$2 AND approval_status='approved' RETURNING id,full_name,username,role",
        [role, id],
      );
      if (rows.length)
        await audit(
          {
            userId: req.user.id,
            action: 'CHANGE_USER_ROLE',
            entity: 'user',
            entityId: id,
            details: { role },
          },
          client,
        );
      return rows[0];
    });
    if (!result)
      return res.status(404).json({ error: 'Approved user not found' });
    res.json({
      id: result.id,
      fullName: result.full_name,
      username: result.username,
      role: result.role,
    });
  } catch (err) {
    next(err);
  }
});
module.exports = router;
