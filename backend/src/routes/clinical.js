const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { httpError } = require('../errors');
const router = express.Router();
router.use(requireAuth);
const idSchema = z.coerce.number().int().positive();
const text = (n = 2000) => z.string().trim().max(n).optional().nullable();
const patientExists = async id => {
  const r = await db.query('SELECT id FROM patients WHERE id=$1', [id]);
  if (!r.rowCount) throw httpError(404, 'Patient not found');
};
const auditIt = (req, action, entity, id, details) =>
  audit({ userId: req.user.id, action, entity, entityId: id, details });
const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Clinical documentation
router.get(
  '/patients/:patientId/notes',
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    await patientExists(pid);
    const { rows } = await db.query(
      `SELECT n.*,u.full_name AS author FROM clinical_notes n JOIN users u ON u.id=n.created_by WHERE patient_id=$1 ORDER BY created_at DESC`,
      [pid],
    );
    await auditIt(req, 'VIEW', 'clinical_note', null, { patientId: pid });
    res.json({ items: rows });
  }),
);
router.post(
  '/patients/:patientId/notes',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    const b = z
      .object({
        visitId: z.number().int().positive().optional().nullable(),
        noteType: z
          .enum(['Progress', 'Assessment', 'Discharge', 'Other'])
          .default('Progress'),
        subject: text(160),
        body: z.string().trim().min(1).max(10000),
      })
      .parse(req.body);
    await patientExists(pid);
    if (b.visitId) {
      const v = await db.query(
        'SELECT id FROM visits WHERE id=$1 AND patient_id=$2',
        [b.visitId, pid],
      );
      if (!v.rowCount) throw httpError(400, 'Visit does not belong to patient');
    }
    const { rows } = await db.query(
      `INSERT INTO clinical_notes(patient_id,visit_id,note_type,subject,body,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        pid,
        b.visitId || null,
        b.noteType,
        b.subject || null,
        b.body,
        req.user.id,
      ],
    );
    await auditIt(req, 'CREATE', 'clinical_note', rows[0].id, {
      patientId: pid,
    });
    res.status(201).json({ item: rows[0] });
  }),
);

// Laboratory requests and results
router.get(
  '/patients/:patientId/labs',
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    await patientExists(pid);
    const { rows } = await db.query(
      `SELECT o.*,u.full_name AS ordered_by_name,r.result_text,r.result_unit,r.reference_range,r.abnormal_flag,r.reported_at FROM lab_orders o JOIN users u ON u.id=o.ordered_by LEFT JOIN lab_results r ON r.order_id=o.id WHERE o.patient_id=$1 ORDER BY o.ordered_at DESC`,
      [pid],
    );
    await auditIt(req, 'VIEW', 'lab_order', null, { patientId: pid });
    res.json({ items: rows });
  }),
);
router.post(
  '/patients/:patientId/labs',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    const b = z
      .object({
        visitId: z.number().int().positive().optional().nullable(),
        testName: z.string().trim().min(2).max(160),
        clinicalNotes: text(2000),
      })
      .parse(req.body);
    await patientExists(pid);
    if (b.visitId) {
      const v = await db.query(
        'SELECT id FROM visits WHERE id=$1 AND patient_id=$2',
        [b.visitId, pid],
      );
      if (!v.rowCount) throw httpError(400, 'Visit does not belong to patient');
    }
    const { rows } = await db.query(
      `INSERT INTO lab_orders(patient_id,visit_id,test_name,clinical_notes,ordered_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [
        pid,
        b.visitId || null,
        b.testName,
        b.clinicalNotes || null,
        req.user.id,
      ],
    );
    await auditIt(req, 'CREATE', 'lab_order', rows[0].id, { patientId: pid });
    res.status(201).json({ item: rows[0] });
  }),
);
router.post(
  '/labs/:orderId/result',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const oid = idSchema.parse(req.params.orderId);
    const b = z
      .object({
        resultText: z.string().trim().min(1).max(10000),
        resultUnit: text(50),
        referenceRange: text(100),
        abnormalFlag: z
          .enum(['Normal', 'Low', 'High', 'Critical', 'Not assessed'])
          .default('Not assessed'),
      })
      .parse(req.body);
    const order = await db.query('SELECT id FROM lab_orders WHERE id=$1', [
      oid,
    ]);
    if (!order.rowCount) throw httpError(404, 'Laboratory order not found');
    const { rows } = await db.query(
      `INSERT INTO lab_results(order_id,result_text,result_unit,reference_range,abnormal_flag,reported_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_id) DO UPDATE SET result_text=EXCLUDED.result_text,result_unit=EXCLUDED.result_unit,reference_range=EXCLUDED.reference_range,abnormal_flag=EXCLUDED.abnormal_flag,reported_by=EXCLUDED.reported_by,reported_at=now() RETURNING *`,
      [
        oid,
        b.resultText,
        b.resultUnit || null,
        b.referenceRange || null,
        b.abnormalFlag,
        req.user.id,
      ],
    );
    await db.query(
      `UPDATE lab_orders SET status='Completed',updated_at=now() WHERE id=$1`,
      [oid],
    );
    await auditIt(req, 'UPDATE', 'lab_result', rows[0].id, { orderId: oid });
    res.status(201).json({ item: rows[0] });
  }),
);
router.patch(
  '/labs/:orderId/status',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const oid = idSchema.parse(req.params.orderId);
    const { status } = z
      .object({
        status: z.enum(['Ordered', 'Collected', 'Processing', 'Cancelled']),
      })
      .parse(req.body);
    const { rows } = await db.query(
      'UPDATE lab_orders SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [status, oid],
    );
    if (!rows.length) throw httpError(404, 'Laboratory order not found');
    await auditIt(req, 'UPDATE', 'lab_order', oid, { status });
    res.json({ item: rows[0] });
  }),
);

// Prescriptions: structured transcription only; no automatic dose recommendations.
router.get(
  '/patients/:patientId/prescriptions',
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    await patientExists(pid);
    const { rows } = await db.query(
      'SELECT p.*,u.full_name AS prescriber FROM prescriptions p JOIN users u ON u.id=p.prescribed_by WHERE patient_id=$1 ORDER BY prescribed_at DESC',
      [pid],
    );
    await auditIt(req, 'VIEW', 'prescription', null, { patientId: pid });
    res.json({ items: rows });
  }),
);
router.post(
  '/patients/:patientId/prescriptions',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    const b = z
      .object({
        visitId: z.number().int().positive().optional().nullable(),
        medicationName: z.string().trim().min(2).max(160),
        strength: text(80),
        dose: z.string().trim().min(1).max(120),
        route: z.string().trim().min(1).max(40),
        frequency: z.string().trim().min(1).max(120),
        duration: text(80),
        quantity: text(80),
        instructions: text(2000),
      })
      .parse(req.body);
    await patientExists(pid);
    if (b.visitId) {
      const v = await db.query(
        'SELECT id FROM visits WHERE id=$1 AND patient_id=$2',
        [b.visitId, pid],
      );
      if (!v.rowCount) throw httpError(400, 'Visit does not belong to patient');
    }
    const { rows } = await db.query(
      `INSERT INTO prescriptions(patient_id,visit_id,medication_name,strength,dose,route,frequency,duration,quantity,instructions,prescribed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        pid,
        b.visitId || null,
        b.medicationName,
        b.strength || null,
        b.dose,
        b.route,
        b.frequency,
        b.duration || null,
        b.quantity || null,
        b.instructions || null,
        req.user.id,
      ],
    );
    await auditIt(req, 'CREATE', 'prescription', rows[0].id, {
      patientId: pid,
    });
    res.status(201).json({ item: rows[0] });
  }),
);
router.patch(
  '/prescriptions/:prescriptionId/status',
  requireRole('nurse', 'admin'),
  wrap(async (req, res) => {
    const id = idSchema.parse(req.params.prescriptionId);
    const { status } = z
      .object({
        status: z.enum(['Active', 'Dispensed', 'Discontinued', 'Cancelled']),
      })
      .parse(req.body);
    const { rows } = await db.query(
      'UPDATE prescriptions SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [status, id],
    );
    if (!rows.length) throw httpError(404, 'Prescription not found');
    await auditIt(req, 'UPDATE', 'prescription', id, { status });
    res.json({ item: rows[0] });
  }),
);

// Appointment scheduling
router.get(
  '/appointments',
  wrap(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const allowed = ['Scheduled', 'Completed', 'Cancelled', 'No-show'];
    if (status && !allowed.includes(status))
      throw httpError(400, 'Invalid appointment status');
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE a.status=$1';
    }
    const { rows } = await db.query(
      `SELECT a.*,p.patient_number,p.first_name,p.last_name FROM appointments a JOIN patients p ON p.id=a.patient_id ${where} ORDER BY a.scheduled_at ASC LIMIT 250`,
      params,
    );
    res.json({ items: rows });
  }),
);
router.get(
  '/patients/:patientId/appointments',
  wrap(async (req, res) => {
    const pid = idSchema.parse(req.params.patientId);
    await patientExists(pid);
    const { rows } = await db.query(
      'SELECT * FROM appointments WHERE patient_id=$1 ORDER BY scheduled_at DESC',
      [pid],
    );
    res.json({ items: rows });
  }),
);
router.post(
  '/appointments',
  requireRole('registrar', 'nurse', 'admin'),
  wrap(async (req, res) => {
    const b = z
      .object({
        patientId: z.number().int().positive(),
        scheduledAt: z.string().datetime({ offset: true }),
        reason: z.string().trim().min(2).max(300),
        notes: text(2000),
      })
      .parse(req.body);
    await patientExists(b.patientId);
    const { rows } = await db.query(
      'INSERT INTO appointments(patient_id,scheduled_at,reason,notes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [b.patientId, b.scheduledAt, b.reason, b.notes || null, req.user.id],
    );
    await auditIt(req, 'CREATE', 'appointment', rows[0].id, {
      patientId: b.patientId,
    });
    res.status(201).json({ item: rows[0] });
  }),
);
router.patch(
  '/appointments/:appointmentId/status',
  requireRole('registrar', 'nurse', 'admin'),
  wrap(async (req, res) => {
    const id = idSchema.parse(req.params.appointmentId);
    const { status } = z
      .object({
        status: z.enum(['Scheduled', 'Completed', 'Cancelled', 'No-show']),
      })
      .parse(req.body);
    const { rows } = await db.query(
      'UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [status, id],
    );
    if (!rows.length) throw httpError(404, 'Appointment not found');
    await auditIt(req, 'UPDATE', 'appointment', id, { status });
    res.json({ item: rows[0] });
  }),
);
module.exports = router;
