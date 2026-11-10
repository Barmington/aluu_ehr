const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/* GET /api/audit?limit=50&entity=patient&entityId=1 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const params = [];
    const where = [];
    if (req.query.entity) {
      params.push(String(req.query.entity));
      where.push(`a.entity = $${params.length}`);
    }
    if (req.query.entityId) {
      params.push(Number(req.query.entityId));
      where.push(`a.entity_id = $${params.length}`);
    }
    params.push(limit);

    const { rows } = await db.query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.created_at,
              u.username, u.full_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${params.length}`,
      params
    );

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        details: r.details,
        createdAt: r.created_at,
        user: r.username ? { username: r.username, fullName: r.full_name } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
