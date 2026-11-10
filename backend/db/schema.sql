-- ============================================================
-- EHR & Information Retrieval System - PostgreSQL schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP SEQUENCE IF EXISTS patient_number_seq;

-- ---------- Staff users (role-based access) ----------
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  role           VARCHAR(20)  NOT NULL
                 CHECK (role IN ('registrar', 'nurse', 'admin')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- Patients (master patient index) ----------
CREATE SEQUENCE patient_number_seq START 1000;

CREATE TABLE patients (
  id                        SERIAL PRIMARY KEY,
  patient_number            VARCHAR(20) NOT NULL UNIQUE
                            DEFAULT ('PT-' || nextval('patient_number_seq')),
  first_name                VARCHAR(80) NOT NULL,
  last_name                 VARCHAR(80) NOT NULL,
  date_of_birth             DATE        NOT NULL CHECK (date_of_birth <= CURRENT_DATE),
  sex                       VARCHAR(10) NOT NULL
                            CHECK (sex IN ('Female', 'Male', 'Other', 'Unknown')),
  phone                     VARCHAR(30) NOT NULL,
  phone_digits              VARCHAR(30) NOT NULL,          -- digits only, for fast search
  email                     VARCHAR(120),
  address                   TEXT,
  emergency_contact_name    VARCHAR(120),
  emergency_contact_phone   VARCHAR(30),
  allergies                 TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                INTEGER REFERENCES users(id),
  updated_by                INTEGER REFERENCES users(id)
);

-- Information-retrieval indexes: ID (unique), phone (prefix/substr), name (fuzzy)
CREATE INDEX idx_patients_phone_digits ON patients (phone_digits text_pattern_ops);
CREATE INDEX idx_patients_name_trgm
  ON patients USING gin ((lower(first_name || ' ' || last_name)) gin_trgm_ops);
CREATE INDEX idx_patients_last_first ON patients (lower(last_name), lower(first_name));

-- ---------- Visits (encounters / triage queue entries) ----------
CREATE TABLE visits (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER     NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  status           VARCHAR(40) NOT NULL DEFAULT 'Checked In / Pending Triage'
                   CHECK (status IN (
                     'Checked In / Pending Triage',
                     'In Triage',
                     'Triaged',
                     'Cancelled'
                   )),
  arrival_mode     VARCHAR(20) NOT NULL DEFAULT 'Walk-in'
                   CHECK (arrival_mode IN ('Walk-in', 'Ambulance', 'Referral', 'Transfer')),
  chief_complaint  TEXT,
  checked_in_by    INTEGER REFERENCES users(id),
  checked_in_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  triage_started_by INTEGER REFERENCES users(id),
  triage_started_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_status_time ON visits (status, checked_in_at);
CREATE INDEX idx_visits_patient ON visits (patient_id, checked_in_at DESC);

-- A patient may have only ONE active visit at a time (prevents duplicate check-in)
CREATE UNIQUE INDEX uq_one_active_visit_per_patient
  ON visits (patient_id)
  WHERE status IN ('Checked In / Pending Triage', 'In Triage');

-- ---------- Audit trail (who accessed / changed what) ----------
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      VARCHAR(40) NOT NULL,       -- SEARCH, VIEW, CREATE, UPDATE, CHECK_IN, START_TRIAGE, LOGIN
  entity      VARCHAR(30) NOT NULL,       -- patient, visit, user
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC);
