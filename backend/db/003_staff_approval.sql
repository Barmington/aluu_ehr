BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL;
ALTER TABLE users ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE users ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%' LOOP
   EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
 END LOOP;
END $$;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('registrar','nurse','doctor','lab_technician','pharmacist','admin'));
COMMIT;
