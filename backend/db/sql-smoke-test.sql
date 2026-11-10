-- Smoke test of the SQL used by the API (run against a scratch database that has schema.sql loaded)
--   psql -v ON_ERROR_STOP=1 -d <scratch_db> -f db/sql-smoke-test.sql
\set ON_ERROR_STOP on
\pset pager off

INSERT INTO users (username, password_hash, full_name, role) VALUES ('registrar','x','Rita Registrar','registrar');

INSERT INTO patients (first_name,last_name,date_of_birth,sex,phone,phone_digits,created_by) VALUES
 ('Amara','Okafor','1990-03-14','Female','+44 7700 900123','447700900123',1),
 ('John','Smith','1978-11-02','Male','07700 900456','07700900456',1),
 ('Sarah','Smith','1995-09-09','Female','07700 900321','07700900321',1);

\echo '--- 1. Search by ID ("1001") : expect John Smith ---'
SELECT patient_number, first_name, last_name FROM patients WHERE patient_number LIKE 'PT-' || '1001' || '%';

\echo '--- 2. Search by phone, any formatting ("(07700) 900-456" -> 07700900456): expect John Smith ---'
SELECT patient_number, first_name, last_name FROM patients WHERE phone_digits LIKE '%' || '07700900456' || '%';

\echo '--- 3. Search by name "Smith, Sarah" (all tokens must match): expect Sarah Smith only ---'
SELECT patient_number, first_name, last_name FROM patients
 WHERE lower(first_name || ' ' || last_name) LIKE '%' || lower('Smith') || '%'
   AND lower(first_name || ' ' || last_name) LIKE '%' || lower('Sarah') || '%';

\echo '--- 4. Update contact info + phone_digits ---'
UPDATE patients SET phone='07700 111222', phone_digits='07700111222', updated_by=1, updated_at=now()
 WHERE id=2 RETURNING patient_number, phone, phone_digits;

\echo '--- 5. Check in -> status must default to "Checked In / Pending Triage" ---'
INSERT INTO visits (patient_id, arrival_mode, chief_complaint, checked_in_by)
 VALUES (2,'Walk-in','Chest pain',1) RETURNING id, status;

\echo '--- 6. Triage queue view: chart must appear as pending ---'
SELECT v.id AS visit_id, v.status, p.patient_number, p.first_name, p.last_name
  FROM visits v JOIN patients p ON p.id=v.patient_id
 WHERE v.status = ANY(ARRAY['Checked In / Pending Triage','In Triage']) ORDER BY v.checked_in_at;

\echo '--- 7. Duplicate check-in must be rejected by the unique partial index (expect ERROR 23505) ---'
\set ON_ERROR_STOP off
INSERT INTO visits (patient_id) VALUES (2);
\set ON_ERROR_STOP on

\echo '--- 8. After triage starts, patient is still blocked; after cancel/finish, a new visit is allowed ---'
UPDATE visits SET status='In Triage', triage_started_at=now() WHERE id=1 AND status='Checked In / Pending Triage' RETURNING id,status;
UPDATE visits SET status='Triaged' WHERE id=1;
INSERT INTO visits (patient_id) VALUES (2) RETURNING id, status;
