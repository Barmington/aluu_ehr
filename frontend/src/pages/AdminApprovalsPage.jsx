import { useEffect, useState } from 'react';
import { api } from '../api.js';
const roles = [
  'registrar',
  'nurse',
  'doctor',
  'lab_technician',
  'pharmacist',
  'admin',
];
export default function AdminApprovalsPage() {
  const [users, setUsers] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(null),
    [rolesById, setRolesById] = useState({});
  async function load() {
    try {
      const list = await api.get('/users');
      setUsers(list);
      setRolesById(old =>
        Object.fromEntries(
          list.map(u => [u.id, old[u.id] || u.requestedRole || 'registrar']),
        ),
      );
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function decide(u, decision) {
    setBusy(u.id);
    try {
      await api.put(`/users/${u.id}/approval`, {
        decision,
        role: rolesById[u.id],
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="card">
      <h2>Staff approvals</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {users
        .filter(u => u.approvalStatus === 'pending')
        .map(u => (
          <article className="module-record" key={u.id}>
            <strong>{u.fullName}</strong> ({u.username})
            <p>Requested: {u.requestedRole}</p>
            <label>
              Approved role{' '}
              <select
                value={rolesById[u.id] || 'registrar'}
                onChange={e =>
                  setRolesById(s => ({ ...s, [u.id]: e.target.value }))
                }
              >
                {roles.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => decide(u, 'approved')}
            >
              Approve
            </button>{' '}
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => decide(u, 'rejected')}
            >
              Reject
            </button>
          </article>
        ))}
    </div>
  );
}
