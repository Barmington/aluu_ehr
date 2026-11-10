-- Additive migration. Do NOT run schema.sql again on an existing database: it drops existing data.
CREATE TABLE IF NOT EXISTS clinical_notes (
 id BIGSERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), visit_id INTEGER REFERENCES visits(id),
 note_type VARCHAR(30) NOT NULL DEFAULT 'Progress', subject VARCHAR(160), body TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id, created_at DESC);
CREATE TABLE IF NOT EXISTS lab_orders (
 id BIGSERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), visit_id INTEGER REFERENCES visits(id),
 test_name VARCHAR(160) NOT NULL, clinical_notes TEXT, status VARCHAR(20) NOT NULL DEFAULT 'Ordered' CHECK(status IN ('Ordered','Collected','Processing','Completed','Cancelled')),
 ordered_by INTEGER NOT NULL REFERENCES users(id), ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id, ordered_at DESC);
CREATE TABLE IF NOT EXISTS lab_results (
 id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES lab_orders(id), result_text TEXT NOT NULL,
 result_unit VARCHAR(50), reference_range VARCHAR(100), abnormal_flag VARCHAR(20) CHECK(abnormal_flag IN ('Normal','Low','High','Critical','Not assessed')),
 reported_by INTEGER NOT NULL REFERENCES users(id), reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prescriptions (
 id BIGSERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), visit_id INTEGER REFERENCES visits(id),
 medication_name VARCHAR(160) NOT NULL, strength VARCHAR(80), dose VARCHAR(120) NOT NULL, route VARCHAR(40) NOT NULL,
 frequency VARCHAR(120) NOT NULL, duration VARCHAR(80), quantity VARCHAR(80), instructions TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Dispensed','Discontinued','Cancelled')),
 prescribed_by INTEGER NOT NULL REFERENCES users(id), prescribed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id, prescribed_at DESC);
CREATE TABLE IF NOT EXISTS appointments (
 id BIGSERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), scheduled_at TIMESTAMPTZ NOT NULL,
 reason VARCHAR(300) NOT NULL, notes TEXT, status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled','No-show')),
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, scheduled_at DESC);
