/**
 * API integration tests (Node's built-in test runner, no extra dependencies).
 * Requires the API running with a freshly seeded database:
 *   npm run db:setup && npm start     (terminal 1)
 *   npm test                           (terminal 2)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const API = process.env.API_URL || 'http://localhost:4000';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (u, p) => (await call('POST', '/api/auth/login', { body: { username: u, password: p } })).data.token;

const uniq = () => Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
const newPatientBody = (over = {}) => {
  const s = uniq();
  return {
    firstName: 'Test',
    lastName: `Case${s}`,
    dateOfBirth: '1992-02-02',
    sex: 'Male',
    phone: `+44 7${s.slice(0, 3)} ${s.slice(3, 9)}`,
    ...over,
  };
};

let registrar, nurse, admin;
test.before(async () => {
  registrar = await login('registrar', 'Registrar#2026');
  nurse = await login('nurse', 'Nurse#2026');
  admin = await login('admin', 'Admin#2026');
});

test('rejects wrong password', async () => {
  const r = await call('POST', '/api/auth/login', { body: { username: 'registrar', password: 'nope' } });
  assert.equal(r.status, 401);
});

test('requires authentication', async () => {
  assert.equal((await call('GET', '/api/patients/search?q=smith')).status, 401);
});

test('search requires at least 2 characters', async () => {
  assert.equal((await call('GET', '/api/patients/search?q=a', { token: registrar })).status, 400);
});

test('create validates input', async () => {
  const r = await call('POST', '/api/patients', { token: registrar, body: newPatientBody({ phone: '123', dateOfBirth: '2999-01-01' }) });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.some((d) => d.field === 'phone'));
  assert.ok(r.data.details.some((d) => d.field === 'dateOfBirth'));
});

test('create, duplicate detection, and force override', async () => {
  const body = newPatientBody();
  const first = await call('POST', '/api/patients', { token: registrar, body });
  assert.equal(first.status, 201);
  assert.match(first.data.patient.patientNumber, /^PT-\d+$/);

  const dup = await call('POST', '/api/patients', { token: registrar, body });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.duplicates.length, 1);

  const forced = await call('POST', '/api/patients?force=true', { token: registrar, body });
  assert.equal(forced.status, 201);
});

test('search by ID, name and phone (any phone formatting)', async () => {
  const body = newPatientBody();
  const { data } = await call('POST', '/api/patients', { token: registrar, body });
  const p = data.patient;

  const byId = await call('GET', `/api/patients/search?q=${p.patientNumber}`, { token: registrar });
  assert.equal(byId.data.results[0].id, p.id);

  const byName = await call('GET', `/api/patients/search?q=${encodeURIComponent(p.lastName.toUpperCase())}`, { token: registrar });
  assert.ok(byName.data.results.some((r) => r.id === p.id));

  const byPhone = await call('GET', `/api/patients/search?q=${encodeURIComponent(body.phone.replace(/\s/g, '-'))}`, { token: registrar });
  assert.ok(byPhone.data.results.some((r) => r.id === p.id));

  // +44 7xxx... stored, typed as national 07xxx...
  const national = `0${body.phone.replace(/\D/g, '').slice(2)}`;
  const byNational = await call('GET', `/api/patients/search?q=${national}`, { token: registrar });
  assert.ok(byNational.data.results.some((r) => r.id === p.id));
});

test('update contact info records changed fields; no-op update changes nothing', async () => {
  const { data } = await call('POST', '/api/patients', { token: registrar, body: newPatientBody() });
  const id = data.patient.id;

  const upd = await call('PUT', `/api/patients/${id}`, { token: registrar, body: { email: 'a@b.co', address: '5 Road' } });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.data.changedFields.sort(), ['address', 'email']);

  const same = await call('PUT', `/api/patients/${id}`, { token: registrar, body: { email: 'a@b.co' } });
  assert.deepEqual(same.data.changedFields, []);
});

test('full flow: check-in lands in queue as "Checked In / Pending Triage"', async () => {
  const { data } = await call('POST', '/api/patients', { token: registrar, body: newPatientBody() });
  const id = data.patient.id;

  const ci = await call('POST', `/api/patients/${id}/check-in`, {
    token: registrar,
    body: { chiefComplaint: 'Headache', contact: { phone: '+44 7000 000111' } },
  });
  assert.equal(ci.status, 201);
  assert.equal(ci.data.visit.status, 'Checked In / Pending Triage');
  assert.deepEqual(ci.data.updatedFields, ['phone']);

  const q = await call('GET', '/api/triage/queue', { token: nurse });
  const entry = q.data.items.find((i) => i.patient.id === id);
  assert.equal(entry.status, 'Checked In / Pending Triage');
  assert.equal(entry.patient.phone, '+44 7000 000111');
});

test('double check-in blocked; nurse cannot check in; nurse can start triage', async () => {
  const { data } = await call('POST', '/api/patients', { token: registrar, body: newPatientBody() });
  const id = data.patient.id;

  assert.equal((await call('POST', `/api/patients/${id}/check-in`, { token: nurse, body: {} })).status, 403);

  const ci = await call('POST', `/api/patients/${id}/check-in`, { token: registrar, body: {} });
  assert.equal(ci.status, 201);
  assert.equal((await call('POST', `/api/patients/${id}/check-in`, { token: registrar, body: {} })).status, 409);

  const start = await call('POST', `/api/triage/${ci.data.visit.id}/start`, { token: nurse });
  assert.equal(start.status, 200);
  assert.equal(start.data.status, 'In Triage');
  assert.equal((await call('POST', `/api/triage/${ci.data.visit.id}/start`, { token: nurse })).status, 409);
});

test('audit log is admin-only and records actions', async () => {
  assert.equal((await call('GET', '/api/audit', { token: registrar })).status, 403);
  const r = await call('GET', '/api/audit?limit=20', { token: admin });
  assert.equal(r.status, 200);
  assert.ok(r.data.items.length > 0);
});
