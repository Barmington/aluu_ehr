/**
 * Automated run of the user story's VERIFICATION STEP against a running API:
 *
 *   "Search for a patient by ID, name, or phone number, retrieve their profile,
 *    update contact info if necessary, and send the record to the Triage queue.
 *    Confirm the chart appears as 'Checked In / Pending Triage'."
 *
 * Usage (API must be running and DB seeded):
 *   npm run verify                      # defaults to http://localhost:4000
 *   API_URL=http://localhost:4000 npm run verify
 *
 * Requires Node 18+ (built-in fetch). Safe to re-run: it creates its own unique patient.
 */
const API = process.env.API_URL || 'http://localhost:4000';
const EXPECTED_STATUS = 'Checked In / Pending Triage';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  if (r.status !== 200) throw new Error(`Login failed for ${username} (${r.status}) - is the DB seeded?`);
  return r.data.token;
}

(async () => {
  console.log(`\nVerifying user story against ${API}\n`);

  const registrar = await login('registrar', 'Registrar#2026');
  const nurse = await login('nurse', 'Nurse#2026');

  // Arrange: a unique, existing patient record (so the script is repeatable)
  const stamp = Date.now().toString().slice(-7);
  const lastName = `Verify${stamp}`;
  const phone = `+44 7${stamp.slice(0, 3)} ${stamp.slice(3)}00`;
  const created = await call('POST', '/api/patients', {
    token: registrar,
    body: {
      firstName: 'Returning',
      lastName,
      dateOfBirth: '1985-05-20',
      sex: 'Female',
      phone,
      email: 'old.email@example.com',
      address: '1 Old Address Road',
    },
  });
  check('Arrange: existing patient record created', created.status === 201, `status ${created.status}`);
  const seeded = created.data.patient;

  // Step 1 - Search by ID, name, and phone number
  console.log('\nStep 1: Search by ID, name, phone');
  const byId = await call('GET', `/api/patients/search?q=${encodeURIComponent(seeded.patientNumber)}`, { token: registrar });
  check('Search by patient ID finds the patient', byId.data?.results?.[0]?.id === seeded.id);

  const byName = await call('GET', `/api/patients/search?q=${encodeURIComponent(`${lastName}, Returning`)}`, { token: registrar });
  check('Search by name ("Last, First") finds the patient', byName.data?.results?.some((p) => p.id === seeded.id));

  const digits = phone.replace(/\D/g, '');
  const byPhone = await call('GET', `/api/patients/search?q=${encodeURIComponent(digits)}`, { token: registrar });
  check('Search by phone number finds the patient', byPhone.data?.results?.some((p) => p.id === seeded.id));

  // Same number typed the national way (07xxx...) must also find a record stored as +44 7xxx...
  const nationalFormat = `0${digits.slice(2)}`;
  const byNational = await call('GET', `/api/patients/search?q=${encodeURIComponent(nationalFormat)}`, { token: registrar });
  check('Search by phone in national format (07...) finds a +44 number', byNational.data?.results?.some((p) => p.id === seeded.id));

  // Step 2 - Retrieve profile
  console.log('\nStep 2: Retrieve profile');
  const profile = await call('GET', `/api/patients/${seeded.id}`, { token: registrar });
  check('Profile retrieved', profile.status === 200 && profile.data.patient.lastName === lastName);
  check('Profile shows no active visit yet', profile.data.activeVisit === null);

  // Step 3 - Update contact info
  console.log('\nStep 3: Update contact info');
  const newPhone = '+44 7999 123456';
  const updated = await call('PUT', `/api/patients/${seeded.id}`, {
    token: registrar,
    body: { phone: newPhone, email: 'new.email@example.com', address: '99 New Address Lane' },
  });
  check('Contact info updated', updated.status === 200 && updated.data.patient.phone === newPhone);
  check('Change tracked (phone, email, address)', ['phone', 'email', 'address'].every((f) => updated.data.changedFields?.includes(f)));

  const reFetched = await call('GET', `/api/patients/${seeded.id}`, { token: registrar });
  check('Updated values persisted', reFetched.data.patient.email === 'new.email@example.com');

  // Step 4 - Send to triage queue
  console.log('\nStep 4: Check in / send to triage queue');
  const checkIn = await call('POST', `/api/patients/${seeded.id}/check-in`, {
    token: registrar,
    body: { arrivalMode: 'Walk-in', chiefComplaint: 'Verification test - abdominal pain' },
  });
  check('Check-in accepted', checkIn.status === 201, `status ${checkIn.status}`);
  check(`Visit status is "${EXPECTED_STATUS}"`, checkIn.data?.visit?.status === EXPECTED_STATUS);

  // Step 5 - Confirm chart appears in triage queue as Checked In / Pending Triage
  console.log('\nStep 5: Confirm chart in triage queue (as the triage nurse)');
  const queue = await call('GET', '/api/triage/queue', { token: nurse });
  const entry = queue.data?.items?.find((i) => i.patient.id === seeded.id);
  check('Chart appears in the triage queue', !!entry);
  check(`Queue status is "${EXPECTED_STATUS}"`, entry?.status === EXPECTED_STATUS, `got "${entry?.status}"`);
  check('Queue shows the UPDATED phone number', entry?.patient.phone === newPhone);

  // Guard-rails
  console.log('\nGuard-rails');
  const dup = await call('POST', `/api/patients/${seeded.id}/check-in`, { token: registrar, body: {} });
  check('Duplicate check-in rejected (409)', dup.status === 409);
  const nurseCheckIn = await call('POST', `/api/patients/${seeded.id}/check-in`, { token: nurse, body: {} });
  check('Nurse role cannot check patients in (403)', nurseCheckIn.status === 403);
  const anon = await call('GET', '/api/triage/queue');
  check('Unauthenticated access rejected (401)', anon.status === 401);

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nVerification could not run:', err.message);
  process.exit(1);
});
