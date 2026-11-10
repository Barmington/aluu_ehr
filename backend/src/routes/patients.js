const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { withTransaction } = require('../db');
const { audit } = require('../audit');
const { httpError } = require('../errors');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Validation schemas                                                  */
/* ------------------------------------------------------------------ */
const digitsOf = s => String(s || '').replace(/\D/g, '');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD')
  .refine(s => {
    const d = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === s &&
      d <= new Date()
    );
  }, 'Invalid date, or date is in the future');

const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    p => digitsOf(p).length >= 7 && digitsOf(p).length <= 15,
    'Phone must contain 7-15 digits',
  );

const optionalText = max => z.string().trim().max(max).optional().nullable();

const identityFields = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  dateOfBirth: isoDate,
  sex: z.enum(['Female', 'Male', 'Other', 'Unknown']),
  allergies: optionalText(1000),
});

const contactFields = z.object({
  phone,
  email: z
    .union([z.literal(''), z.string().trim().email('Invalid email').max(120)])
    .optional()
    .nullable(),
  address: optionalText(500),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(30),
});

const createPatientSchema = identityFields.merge(contactFields);

const updatePatientSchema = createPatientSchema
  .partial()
  .refine(
    o => Object.keys(o).length > 0,
    'Provide at least one field to update',
  );

const checkInSchema = z.object({
  arrivalMode: z
    .enum(['Walk-in', 'Ambulance', 'Referral', 'Transfer'])
    .default('Walk-in'),
  chiefComplaint: optionalText(500),
  // Optional contact changes applied atomically with the check-in
  contact: contactFields.partial().optional(),
});

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                     */
/* ------------------------------------------------------------------ */
const FIELD_TO_COLUMN = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  sex: 'sex',
  phone: 'phone',
  email: 'email',
  address: 'address',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  allergies: 'allergies',
};

const mapPatient = r => ({
  id: r.id,
  patientNumber: r.patient_number,
  firstName: r.first_name,
  lastName: r.last_name,
  dateOfBirth: r.date_of_birth,
  sex: r.sex,
  phone: r.phone,
  email: r.email,
  address: r.address,
  emergencyContactName: r.emergency_contact_name,
  emergencyContactPhone: r.emergency_contact_phone,
  allergies: r.allergies,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapVisit = r => ({
  id: r.id,
  patientId: r.patient_id,
  status: r.status,
  arrivalMode: r.arrival_mode,
  chiefComplaint: r.chief_complaint,
  checkedInAt: r.checked_in_at,
  triageStartedAt: r.triage_started_at,
});

const ACTIVE_STATUSES = ['Checked In / Pending Triage', 'In Triage'];

/**
 * Applies a partial update to a patient row inside a transaction.
 * Returns { patient (raw row), changes } where changes = { field: {from, to} }.
 */
async function applyPatientUpdate(client, existingRow, input, userId) {
  const sets = [];
  const params = [];
  const changes = {};

  for (const [field, rawValue] of Object.entries(input)) {
    const column = FIELD_TO_COLUMN[field];
    if (!column) continue;
    const value = rawValue === '' ? null : rawValue;
    const before = existingRow[column];
    if ((before ?? null) === (value ?? null)) continue; // unchanged

    params.push(value);
    sets.push(`${column} = $${params.length}`);
    changes[field] = { from: before ?? null, to: value ?? null };

    if (field === 'phone') {
      params.push(digitsOf(value));
      sets.push(`phone_digits = $${params.length}`);
    }
  }

  if (sets.length === 0) return { patient: existingRow, changes };

  params.push(userId);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');
  params.push(existingRow.id);

  const { rows } = await client.query(
    `UPDATE patients SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return { patient: rows[0], changes };
}

/* ------------------------------------------------------------------ */
/* GET /api/patients/search?q=  -- search by ID, name or phone         */
/* ------------------------------------------------------------------ */
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res
        .status(400)
        .json({ error: 'Enter at least 2 characters to search' });
    }

    const params = [];
    const add = v => {
      params.push(v);
      return `$${params.length}`;
    };
    const clauses = [];
    const hasLetters = /[a-z]/i.test(q);
    const digits = digitsOf(q);

    // 1) Patient ID  (e.g. "PT-1001" or "1001")
    const idMatch = q.match(/^(?:pt-?)?(\d+)$/i);
    let idParam = null;
    if (idMatch) {
      idParam = add(idMatch[1]);
      clauses.push(`p.patient_number LIKE 'PT-' || ${idParam} || '%'`);
    }
    const exactIdSql = idParam
      ? `p.patient_number = 'PT-' || ${idParam}`
      : 'false';

    // 2) Phone number. Matches any formatting ("+44 7700-900123", "(07700) 900123") AND the
    //    same number written with/without the country code or trunk "0" (+447700900123 vs
    //    07700900123): for full-length numbers we compare the last 9 digits.
    let phoneParam = null;
    let exactPhoneSql = 'false';
    if (!hasLetters && digits.length >= 3) {
      phoneParam = add(digits);
      const suffixMatch = `right(p.phone_digits, 9) = right(${phoneParam}, 9)`;
      if (digits.length >= 9) {
        clauses.push(
          `(p.phone_digits LIKE '%' || ${phoneParam} || '%' OR ${suffixMatch})`,
        );
        exactPhoneSql = suffixMatch;
      } else {
        clauses.push(`p.phone_digits LIKE '%' || ${phoneParam} || '%'`);
        exactPhoneSql = `p.phone_digits = ${phoneParam}`;
      }
    }

    // 3) Name -- every word must appear in "first last" (handles "Smith, John")
    if (hasLetters) {
      const tokens = q
        .replace(/,/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.replace(/[\\%_]/g, '\\$&'));
      const nameConds = tokens.map(
        t =>
          `lower(p.first_name || ' ' || p.last_name) LIKE '%' || lower(${add(t)}) || '%'`,
      );
      clauses.push(`(${nameConds.join(' AND ')})`);
    }

    const { rows } = await db.query(
      `SELECT p.*, v.id AS active_visit_id, v.status AS active_visit_status,
              CASE WHEN ${exactIdSql} THEN 0 WHEN ${exactPhoneSql} THEN 1 ELSE 2 END AS rank
         FROM patients p
         LEFT JOIN visits v
                ON v.patient_id = p.id AND v.status = ANY(ARRAY['${ACTIVE_STATUSES.join("','")}'])
        WHERE ${clauses.join(' OR ')}
        ORDER BY rank, p.last_name, p.first_name
        LIMIT 25`,
      params,
    );

    await audit({
      userId: req.user.id,
      action: 'SEARCH',
      entity: 'patient',
      details: { query: q, results: rows.length },
    });

    res.json({
      query: q,
      count: rows.length,
      results: rows.map(r => ({
        ...mapPatient(r),
        activeVisit: r.active_visit_id
          ? { id: r.active_visit_id, status: r.active_visit_status }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients/:id  -- retrieve full profile + visit history     */
/* ------------------------------------------------------------------ */
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query('SELECT * FROM patients WHERE id = $1', [
      id,
    ]);
    if (!rows.length) throw httpError(404, 'Patient not found');

    const visits = await db.query(
      'SELECT * FROM visits WHERE patient_id = $1 ORDER BY checked_in_at DESC LIMIT 20',
      [id],
    );

    await audit({
      userId: req.user.id,
      action: 'VIEW',
      entity: 'patient',
      entityId: id,
    });

    const visitList = visits.rows.map(mapVisit);
    res.json({
      patient: mapPatient(rows[0]),
      activeVisit:
        visitList.find(v => ACTIVE_STATUSES.includes(v.status)) || null,
      visits: visitList,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/patients  -- register a new patient                       */
/* Responds 409 with possible duplicates unless ?force=true            */
/* ------------------------------------------------------------------ */
router.post(
  '/',
  requireRole('registrar', 'admin'),
  validate(createPatientSchema),
  async (req, res, next) => {
    try {
      const p = req.body;

      if (req.query.force !== 'true') {
        const dup = await db.query(
          `SELECT * FROM patients
            WHERE lower(first_name) = lower($1) AND lower(last_name) = lower($2)
              AND date_of_birth = $3`,
          [p.firstName, p.lastName, p.dateOfBirth],
        );
        if (dup.rows.length) {
          throw httpError(
            409,
            'A patient with the same name and date of birth already exists',
            { duplicates: dup.rows.map(mapPatient) },
          );
        }
      }

      const { rows } = await db.query(
        `INSERT INTO patients
           (first_name, last_name, date_of_birth, sex, phone, phone_digits, email, address,
            emergency_contact_name, emergency_contact_phone, allergies, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
         RETURNING *`,
        [
          p.firstName,
          p.lastName,
          p.dateOfBirth,
          p.sex,
          p.phone,
          digitsOf(p.phone),
          p.email || null,
          p.address || null,
          p.emergencyContactName || null,
          p.emergencyContactPhone || null,
          p.allergies || null,
          req.user.id,
        ],
      );

      await audit({
        userId: req.user.id,
        action: 'CREATE',
        entity: 'patient',
        entityId: rows[0].id,
        details: { patientNumber: rows[0].patient_number },
      });

      res.status(201).json({ patient: mapPatient(rows[0]) });
    } catch (err) {
      next(err);
    }
  },
);

/* ------------------------------------------------------------------ */
/* PUT /api/patients/:id  -- update profile (e.g. contact info)        */
/* ------------------------------------------------------------------ */
router.put(
  '/:id(\\d+)',
  requireRole('registrar', 'admin'),
  validate(updatePatientSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const result = await withTransaction(async client => {
        const { rows } = await client.query(
          'SELECT * FROM patients WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!rows.length) throw httpError(404, 'Patient not found');

        const { patient, changes } = await applyPatientUpdate(
          client,
          rows[0],
          req.body,
          req.user.id,
        );
        if (Object.keys(changes).length) {
          await audit(
            {
              userId: req.user.id,
              action: 'UPDATE',
              entity: 'patient',
              entityId: id,
              details: { changes },
            },
            client,
          );
        }
        return { patient, changes };
      });

      res.json({
        patient: mapPatient(result.patient),
        changedFields: Object.keys(result.changes),
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ------------------------------------------------------------------ */
/* POST /api/patients/:id/check-in  -- send active profile to triage   */
/* (optionally updates contact info in the same transaction)           */
/* ------------------------------------------------------------------ */
router.post(
  '/:id(\\d+)/check-in',
  requireRole('registrar', 'admin'),
  validate(checkInSchema),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { arrivalMode, chiefComplaint, contact } = req.body;

      const result = await withTransaction(async client => {
        const { rows } = await client.query(
          'SELECT * FROM patients WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!rows.length) throw httpError(404, 'Patient not found');

        // Block duplicate check-ins
        const active = await client.query(
          `SELECT id, status FROM visits WHERE patient_id = $1 AND status = ANY($2)`,
          [id, ACTIVE_STATUSES],
        );
        if (active.rows.length) {
          throw httpError(
            409,
            `Patient is already in the queue (${active.rows[0].status})`,
            {
              visitId: active.rows[0].id,
            },
          );
        }

        let patient = rows[0];
        let changes = {};
        if (contact && Object.keys(contact).length) {
          ({ patient, changes } = await applyPatientUpdate(
            client,
            patient,
            contact,
            req.user.id,
          ));
          if (Object.keys(changes).length) {
            await audit(
              {
                userId: req.user.id,
                action: 'UPDATE',
                entity: 'patient',
                entityId: id,
                details: { changes },
              },
              client,
            );
          }
        }

        const v = await client.query(
          `INSERT INTO visits (patient_id, arrival_mode, chief_complaint, checked_in_by)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [id, arrivalMode, chiefComplaint || null, req.user.id],
        );

        await audit(
          {
            userId: req.user.id,
            action: 'CHECK_IN',
            entity: 'visit',
            entityId: v.rows[0].id,
            details: { patientId: id, status: v.rows[0].status },
          },
          client,
        );

        return { patient, visit: v.rows[0], changes };
      });

      res.status(201).json({
        message: 'Patient checked in and sent to the triage queue',
        patient: mapPatient(result.patient),
        visit: mapVisit(result.visit),
        updatedFields: Object.keys(result.changes),
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
