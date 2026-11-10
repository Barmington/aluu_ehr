const express = require('express');
const db = require('../db');
const { withTransaction } = require('../db');
const { audit } = require('../audit');
const { httpError } = require('../errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PENDING = 'Checked In / Pending Triage';
const IN_TRIAGE = 'In Triage';
const ALL_STATUSES = [PENDING, IN_TRIAGE, 'Triaged', 'Cancelled'];

const mapQueueItem = (r) => ({
  visitId: r.visit_id,
  status: r.status,
  arrivalMode: r.arrival_mode,
  chiefComplaint: r.chief_complaint,
  checkedInAt: r.checked_in_at,
  triageStartedAt: r.triage_started_at,
  waitMinutes: Math.floor(Number(r.wait_minutes)),
  patient: {
    id: r.patient_id,
    patientNumber: r.patient_number,
    firstName: r.first_name,
    lastName: r.last_name,
    dateOfBirth: r.date_of_birth,
    sex: r.sex,
    phone: r.phone,
    allergies: r.allergies,
  },
});

/* GET /api/triage/queue?status=...  (default: pending + in triage, oldest first) */
router.get('/queue', async (req, res, next) => {
  try {
    let statuses = [PENDING, IN_TRIAGE];
    if (req.query.status) {
      statuses = String(req.query.status).split(',').map((s) => s.trim());
      if (!statuses.every((s) => ALL_STATUSES.includes(s))) {
        throw httpError(400, 'Unknown status filter');
      }
    }

    const { rows } = await db.query(
      `SELECT v.id AS visit_id, v.status, v.arrival_mode, v.chief_complaint,
              v.checked_in_at, v.triage_started_at,
              EXTRACT(EPOCH FROM (now() - v.checked_in_at)) / 60 AS wait_minutes,
              p.id AS patient_id, p.patient_number, p.first_name, p.last_name,
              p.date_of_birth, p.sex, p.phone, p.allergies
         FROM visits v
         JOIN patients p ON p.id = v.patient_id
        WHERE v.status = ANY($1)
        ORDER BY v.checked_in_at ASC`,
      [statuses]
    );

    const items = rows.map(mapQueueItem);
    res.json({
      counts: {
        pending: items.filter((i) => i.status === PENDING).length,
        inTriage: items.filter((i) => i.status === IN_TRIAGE).length,
        total: items.length,
      },
      items,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /api/triage/:visitId/start  -- nurse picks up the patient */
router.post('/:visitId(\\d+)/start', requireRole('nurse', 'admin'), async (req, res, next) => {
  try {
    const visitId = Number(req.params.visitId);
    const visit = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE visits
            SET status = $2, triage_started_by = $3, triage_started_at = now(), updated_at = now()
          WHERE id = $1 AND status = $4
        RETURNING *`,
        [visitId, IN_TRIAGE, req.user.id, PENDING]
      );
      if (!rows.length) {
        throw httpError(409, 'Visit not found or no longer pending triage');
      }
      await audit(
        { userId: req.user.id, action: 'START_TRIAGE', entity: 'visit', entityId: visitId },
        client
      );
      return rows[0];
    });
    res.json({ message: 'Triage started', visitId: visit.id, status: visit.status });
  } catch (err) {
    next(err);
  }
});

/* POST /api/triage/:visitId/cancel  -- undo a mistaken check-in */
router.post('/:visitId(\\d+)/cancel', requireRole('registrar', 'admin'), async (req, res, next) => {
  try {
    const visitId = Number(req.params.visitId);
    const visit = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE visits SET status = 'Cancelled', updated_at = now()
          WHERE id = $1 AND status = $2 RETURNING *`,
        [visitId, PENDING]
      );
      if (!rows.length) {
        throw httpError(409, 'Only visits that are still pending triage can be cancelled');
      }
      await audit(
        { userId: req.user.id, action: 'CANCEL_CHECK_IN', entity: 'visit', entityId: visitId },
        client
      );
      return rows[0];
    });
    res.json({ message: 'Check-in cancelled', visitId: visit.id, status: visit.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
