# Electronic Health Record & Patient Information Retrieval System

A full-stack healthcare records application built with **React, Vite, Node.js, Express and PostgreSQL**. It supports patient registration and search, check-in and triage workflows, clinical documentation, laboratory requests/results, prescriptions, appointments and staff access administration.

> **Project status:** This repository contains application code and automated API tests. It is a project implementation, **not a certified or production-ready clinical system**. Do not use real patient data without a security, privacy, safety and regulatory review.

## Features

- **Patient records:** register, search by patient number/name/phone, retrieve profiles, update contact details and flag potential duplicates.
- **Patient check-in:** create visits and move patients into the triage queue, with safeguards against duplicate active visits.
- **Triage workflow:** view the queue, start triage, and cancel eligible check-ins according to staff permissions.
- **Clinical modules:** create/read clinical notes; manage laboratory orders, results and statuses; manage prescriptions and appointments.
- **Staff accounts:** registration/login with JWT authentication, role-based authorization and administrator approval management.
- **Audit trail:** backend audit logging for supported patient and clinical actions, with administrator access to audit records.

## Technology stack

| Layer                   | Technologies                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Frontend                | React 18, React Router 6, Vite 5, Tailwind CSS 4, CSS                                                    |
| Backend                 | Node.js, Express 4, REST APIs                                                                            |
| Database                | PostgreSQL, `pg`, `pg_trgm`                                                                              |
| Security and validation | JWT, bcrypt/bcryptjs, Helmet, CORS, Zod                                                                  |
| Testing and deployment  | Node.js built-in test runner, API verification script, GitHub Actions (frontend GitHub Pages deployment) |

## Architecture

```text
React SPA (frontend/src)
        | JSON requests / Bearer token
        v
Express REST API (backend/src)
  ├── Authentication / registration / staff approval
  ├── Patient search and check-in
  ├── Triage and audit logging
  └── Clinical notes, labs, prescriptions, appointments
        |
        v
PostgreSQL (backend/db)
```

The frontend uses `/api` by default and the Vite development server proxies that path to `http://localhost:4000`. A deployed frontend needs a separately hosted API and database; **GitHub Pages only hosts the static frontend**.

## Getting started (local development)

**Requirements:** Node.js 18+ (Node 22 is used in the GitHub Actions workflow), npm, PostgreSQL 14+ with permission to install the `pg_trgm` extension.

1. Create an empty PostgreSQL database and a database user with appropriate privileges. Avoid superuser access for the application account.
2. Configure backend environment variables in `backend/.env` (do not commit this file):

   ```dotenv
   DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/YOUR_DATABASE
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=4000
   CORS_ORIGIN=http://localhost:5173
   ```

   Alternatively, `backend/src/db.js` supports `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD` and `DB_PORT` instead of `DATABASE_URL`.

3. Install backend dependencies and initialise a **disposable development database**:

   ```bash
   cd backend
   npm install
   npm run db:setup
   ```

   **Warning:** `db:setup` executes `db/schema.sql`, which drops and recreates the core tables and seeds demonstration data. **Never run it against a database containing data you need to retain.**

4. Apply the additional SQL migrations to enable clinical modules and staff approvals (run from `backend/`, using your configured database connection):

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations_002_clinical_modules.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003_staff_approval.sql
   ```

   If you configured individual `DB_*` variables instead, supply the corresponding `psql` connection options. Review migration compatibility before applying to an existing database.

5. Start the API:

   ```bash
   npm start
   ```

   Check `http://localhost:4000/api/health`.

6. In a second terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open `http://localhost:5173`. For a separately deployed API, set `VITE_API_URL` to the correct API base URL when building the frontend.

### Demonstration credentials

The seed script creates demonstration registrar, nurse and administrator accounts. Inspect `backend/scripts/setup-db.js` for the local-only credentials. **Never use seed credentials or demonstration patient data in a production environment.**

## Main API route groups

| Prefix            | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `GET /api/health` | API health check                                       |
| `/api/auth`       | Register, log in, current account                      |
| `/api/patients`   | Search, create, retrieve, edit, check in               |
| `/api/triage`     | Queue and triage workflow                              |
| `/api/clinical`   | Notes, lab orders/results, prescriptions, appointments |
| `/api/users`      | Administrator staff account/role management            |
| `/api/audit`      | Audit records                                          |

Protected endpoints use `Authorization: Bearer <token>`. Exact methods, request bodies and role requirements are defined in `backend/src/routes/`.

## Verification and testing

With a correctly configured test database and the backend running where required:

```bash
cd backend
npm test          # Node.js API tests
npm run verify    # End-to-end user-story verification script
```

The verification script exercises patient search, profile updates, check-in, queue hand-off and authorization safeguards. These commands are **documented, not claimed to have passed** as part of this README update. Tests may create or change database records; use a disposable database.

## Project structure

```text
aluu_ehr/
├── README.md
├── CV_PROJECT_PROFILE.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx, AuthContext.jsx, api.js
│   │   ├── pages/          # home, auth, patients, triage, clinical, admin
│   │   └── components/     # patient forms, profile and header
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── app.js, server.js, db.js, audit.js
│   │   ├── middleware/
│   │   └── routes/         # auth, register, patients, triage, clinical, users, audit
│   ├── db/                 # schema and additive migrations
│   ├── scripts/            # setup and verification
│   ├── tests/              # API tests
│   └── package.json
└── .github/workflows/deploy.yml
```

## Security and deployment notes

- Use HTTPS, strong unique secrets, secure credential storage, least-privilege database access and appropriate rate limiting in production.
- Do not publish `.env` files, database dumps, generated patient data or private clinical information. Rotate any credentials that have been exposed.
- Review access permissions across all clinical routes, audit coverage, input validation, backups and retention before real-world use.
- The included GitHub Actions workflow builds and deploys the **frontend** to GitHub Pages; it does not deploy the Express API or PostgreSQL.
- The Vite configuration currently specifies `base: '/aluu_ehr/'`; adjust this if hosting under a different path.
- Healthcare deployments may require UK GDPR / Data Protection Act, NHS DSPT, clinical safety and other applicable compliance assessments.

## Known limitations / future work

- Database initialisation and later feature migrations are separate steps; a consolidated migration strategy would improve setup reliability.
- Add automated frontend/component tests and full clinical workflow integration tests.
- Introduce production-grade monitoring, deployment automation for the API/database, backups and security hardening.
- Consider interoperability with HL7 FHIR and stronger patient matching/identity verification.
