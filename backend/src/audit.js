const db = require('./db');

/** Writes an audit entry. Accepts an optional client so it can join a transaction. */
async function audit({ userId, action, entity, entityId = null, details = null }, client = db) {
  await client.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { audit };
