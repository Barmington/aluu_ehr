import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { ageFrom, formatDateTime, formatWait, statusClass } from '../utils.js';

const REFRESH_MS = 15000;

export default function TriagePage() {
  const { user } = useAuth();
  const canTriage = user.role === 'nurse' || user.role === 'admin';
  const canCancel = user.role === 'registrar' || user.role === 'admin';

  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      setQueue(await api.get('/triage/queue'));
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Auto-refresh so providers see new check-ins without reloading
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  async function act(visitId, action) {
    try {
      await api.post(`/triage/${visitId}/${action}`);
    } catch (e) {
      setError(e.message);
    }
    load();
  }

  return (
    <div className="card">
      <div className="queue-head">
        <h2>Triage queue</h2>
        <div className="muted">
          {updatedAt && `Updated ${updatedAt.toLocaleTimeString('en-GB')} · `}
          <button className="link" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {queue && (
        <div className="stats">
          <div className="stat"><strong>{queue.counts.pending}</strong><span>Pending triage</span></div>
          <div className="stat"><strong>{queue.counts.inTriage}</strong><span>In triage</span></div>
        </div>
      )}

      {!queue ? (
        <p className="muted">Loading queue...</p>
      ) : queue.items.length === 0 ? (
        <p className="muted">No patients are waiting for triage.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Wait</th>
                <th>Patient</th>
                <th>Reason / arrival</th>
                <th>Checked in</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {queue.items.map((i) => (
                <tr key={i.visitId}>
                  <td className="nowrap">{formatWait(i.waitMinutes)}</td>
                  <td>
                    <Link to={`/patients/${i.patient.id}`} className="patient-link">
                      {i.patient.lastName}, {i.patient.firstName}
                    </Link>
                    <div className="muted">
                      {i.patient.patientNumber} · {i.patient.sex} · {ageFrom(i.patient.dateOfBirth)} yrs · {i.patient.phone}
                    </div>
                    {i.patient.allergies && <div className="allergy">Allergies: {i.patient.allergies}</div>}
                  </td>
                  <td>
                    {i.chiefComplaint || <span className="muted">Not recorded</span>}
                    <div className="muted">{i.arrivalMode}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(i.checkedInAt)}</td>
                  <td><span className={statusClass(i.status)}>{i.status}</span></td>
                  <td className="row-actions">
                    {canTriage && i.status === 'Checked In / Pending Triage' && (
                      <button className="btn btn-primary btn-sm" onClick={() => act(i.visitId, 'start')}>Start triage</button>
                    )}
                    {canCancel && i.status === 'Checked In / Pending Triage' && (
                      <button className="btn btn-sm" onClick={() => act(i.visitId, 'cancel')}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
