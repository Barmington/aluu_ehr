import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { PENDING, ageFrom, formatDate, formatDateTime, statusClass } from '../utils.js';

const CONTACT_FIELDS = ['phone', 'email', 'address', 'emergencyContactName', 'emergencyContactPhone'];
const norm = (v) => (v == null ? '' : String(v).trim());

// Defined at module level (NOT inside PatientProfile) so inputs keep focus while typing.
const ContactContext = createContext(null);

function ContactInput({ name, label, type = 'text' }) {
  const { draft, set, disabled, err } = useContext(ContactContext);
  return (
    <label className={err(name) ? 'has-error' : ''}>
      {label}
      <input type={type} value={draft[name] ?? ''} onChange={set(name)} disabled={disabled} />
      {err(name) && <span className="field-error">{err(name)}</span>}
    </label>
  );
}

export default function PatientProfile({ patientId, canEdit, onChanged }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text, link? }
  const [fieldErrors, setFieldErrors] = useState([]);
  const [arrivalMode, setArrivalMode] = useState('Walk-in');
  const [chiefComplaint, setChiefComplaint] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await api.get(`/patients/${patientId}`);
      setData(res);
      setDraft(Object.fromEntries(CONTACT_FIELDS.map((f) => [f, res.patient[f] ?? ''])));
    } catch (err) {
      setLoadError(err.message);
    }
  }, [patientId]);

  useEffect(() => {
    setData(null);
    setNotice(null);
    setFieldErrors([]);
    setChiefComplaint('');
    load();
  }, [load]);

  // Only the contact fields the user actually changed
  const changes = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(
      CONTACT_FIELDS.filter((f) => norm(draft[f]) !== norm(data.patient[f])).map((f) => [f, norm(draft[f])])
    );
  }, [draft, data]);
  const dirty = Object.keys(changes).length > 0;

  const err = (k) => fieldErrors.find((d) => d.field === k || d.field === `contact.${k}`)?.message;

  function handleApiError(e) {
    setFieldErrors(e.data?.details || []);
    setNotice({ type: 'error', text: e.message });
  }

  async function saveChanges() {
    setBusy(true);
    setNotice(null);
    setFieldErrors([]);
    try {
      await api.put(`/patients/${patientId}`, changes);
      await load();
      setNotice({ type: 'success', text: 'Contact information updated.' });
      onChanged?.();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function sendToTriage() {
    setBusy(true);
    setNotice(null);
    setFieldErrors([]);
    try {
      // Contact edits (if any) are saved atomically together with the check-in
      const res = await api.post(`/patients/${patientId}/check-in`, {
        arrivalMode,
        chiefComplaint: chiefComplaint.trim() || null,
        contact: dirty ? changes : undefined,
      });
      await load();
      setNotice({
        type: 'success',
        text: `${res.patient.firstName} ${res.patient.lastName} is now "${res.visit.status}".`,
        link: { to: '/triage', label: 'Open triage queue' },
      });
      onChanged?.();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!data) return <div className="card muted">Loading patient chart...</div>;

  const { patient, activeVisit, visits } = data;
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="card profile">
      <div className="profile-head">
        <div>
          <h2>{patient.firstName} {patient.lastName}</h2>
          <div className="muted">
            {patient.patientNumber} · {patient.sex} · {ageFrom(patient.dateOfBirth)} yrs (DOB {formatDate(patient.dateOfBirth)})
          </div>
        </div>
        {activeVisit && <span className={statusClass(activeVisit.status)}>{activeVisit.status}</span>}
      </div>

      {patient.allergies && (
        <div className="alert alert-warn"><strong>Allergies:</strong> {patient.allergies}</div>
      )}

      {notice && (
        <div className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-error'}`} role="status">
          {notice.text}{' '}
          {notice.link && <Link to={notice.link.to}>{notice.link.label} →</Link>}
          {fieldErrors.length > 0 && (
            <ul>{fieldErrors.map((d, i) => <li key={i}>{d.field}: {d.message}</li>)}</ul>
          )}
        </div>
      )}

      <h3>Contact information</h3>
      <ContactContext.Provider value={{ draft, set, disabled: !canEdit || busy, err }}>
        <div className="form-grid">
          <ContactInput name="phone" label="Phone number" type="tel" />
          <ContactInput name="email" label="Email" type="email" />
          <div className="span-2"><ContactInput name="address" label="Address" /></div>
          <ContactInput name="emergencyContactName" label="Emergency contact name" />
          <ContactInput name="emergencyContactPhone" label="Emergency contact phone" type="tel" />
        </div>
      </ContactContext.Provider>
      {canEdit && (
        <div className="actions">
          <button className="btn" onClick={saveChanges} disabled={!dirty || busy}>
            Save contact changes
          </button>
          {dirty && <span className="muted">Unsaved changes: {Object.keys(changes).join(', ')}</span>}
        </div>
      )}

      {canEdit && (
        <>
          <h3>Check-in</h3>
          {activeVisit ? (
            <div className="alert alert-info">
              Already in the queue as <strong>{activeVisit.status}</strong> since {formatDateTime(activeVisit.checkedInAt)}.
            </div>
          ) : (
            <>
              <div className="form-grid">
                <label>
                  Arrival mode
                  <select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value)} disabled={busy}>
                    <option>Walk-in</option>
                    <option>Ambulance</option>
                    <option>Referral</option>
                    <option>Transfer</option>
                  </select>
                </label>
                <label>
                  Reason for visit
                  <input
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="e.g. chest pain"
                    disabled={busy}
                  />
                </label>
              </div>
              <div className="actions">
                <button className="btn btn-primary" onClick={sendToTriage} disabled={busy}>
                  {busy ? 'Sending...' : dirty ? 'Save changes & send to triage' : 'Check in & send to triage'}
                </button>
                <span className="muted">Status will be set to “{PENDING}”.</span>
              </div>
            </>
          )}
        </>
      )}

      <h3>Visit history</h3>
      {visits.length === 0 ? (
        <p className="muted">No previous visits.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Checked in</th><th>Arrival</th><th>Reason</th><th>Status</th></tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>{formatDateTime(v.checkedInAt)}</td>
                <td>{v.arrivalMode}</td>
                <td>{v.chiefComplaint || '-'}</td>
                <td><span className={statusClass(v.status)}>{v.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
