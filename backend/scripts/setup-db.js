/**
 * Creates the schema and loads demo data.
 *   npm run db:setup
 * WARNING: schema.sql drops and recreates all tables.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');

const users = [
  {
    username: 'registrar',
    password: 'Registrar#2026',
    fullName: 'Rita Registrar',
    role: 'registrar',
  },
  {
    username: 'nurse',
    password: 'Nurse#2026',
    fullName: 'Nora Nurse',
    role: 'nurse',
  },
  {
    username: 'admin',
    password: 'Admin#2026',
    fullName: 'Adam Admin',
    role: 'admin',
  },
];

const patients = [
  [
    'Amara',
    'Okafor',
    '1990-03-14',
    'Female',
    '+44 7700 900123',
    'amara.okafor@example.com',
    '12 High Street, Hull HU1 1AA',
    'Chidi Okafor',
    '+44 7700 900124',
    'Penicillin',
  ],
  [
    'John',
    'Smith',
    '1978-11-02',
    'Male',
    '07700 900456',
    'john.smith@example.com',
    '45 Beverley Road, Hull HU3 1XX',
    'Mary Smith',
    '07700 900457',
    null,
  ],
  [
    'Fatima',
    'Hassan',
    '2001-07-25',
    'Female',
    '+44 1482 555010',
    null,
    '8 Park Avenue, Hull HU5 3AA',
    'Ali Hassan',
    '+44 1482 555011',
    'Latex',
  ],
  [
    'Michael',
    'Johnson',
    '1965-01-30',
    'Male',
    '(07700) 900789',
    'm.johnson@example.com',
    '3 Ferensway, Hull HU2 8NH',
    null,
    null,
    null,
  ],
  [
    'Sarah',
    'Smith',
    '1995-09-09',
    'Female',
    '07700 900321',
    'sarah.smith@example.com',
    '77 Anlaby Road, Hull HU3 2XX',
    'John Smith',
    '07700 900456',
    'Aspirin',
  ],
];

(async () => {
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, '../db/schema.sql'),
      'utf8',
    );
    await pool.query(schema);
    console.log('Schema created.');

    const ids = {};
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      const { rows } = await pool.query(
        'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id',
        [u.username, hash, u.fullName, u.role],
      );
      ids[u.username] = rows[0].id;
    }
    console.log(
      'Users created:',
      users.map(u => `${u.username} / ${u.password}`).join(', '),
    );

    for (const p of patients) {
      await pool.query(
        `INSERT INTO patients
           (first_name, last_name, date_of_birth, sex, phone, phone_digits, email, address,
            emergency_contact_name, emergency_contact_phone, allergies, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          p[0],
          p[1],
          p[2],
          p[3],
          p[4],
          p[4].replace(/\D/g, ''),
          p[5],
          p[6],
          p[7],
          p[8],
          p[9],
          ids.registrar,
        ],
      );
    }
    console.log(`${patients.length} demo patients created.`);
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
