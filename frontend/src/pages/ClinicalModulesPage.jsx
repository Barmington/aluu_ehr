import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSearchParams } from 'react-router-dom';

const tabs = ['Notes', 'Laboratory', 'Prescriptions', 'Appointments'];
export default function ClinicalModulesPage() {
  const [params] = useSearchParams();
  const [patientId, setPatientId] = useState(params.get('patientId') || '');
  const [tab, setTab] = useState('Notes');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ noteType: 'Progress' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const base = '/clinical';
  async function load() {
    if (tab === 'Appointments' && !patientId) {
      try {
        const d = await api.get(`${base}/appointments`);
        setItems(d.items || []);
        setError('');
      } catch (e) {
        setError(e.message);
      }
      return;
    }
    if (!/^\d+$/.test(patientId)) {
      setItems([]);
      return;
    }
    const endpoint = {
      Notes: 'notes',
      Laboratory: 'labs',
      Prescriptions: 'prescriptions',
      Appointments: 'appointments',
    }[tab];
    try {
      const d = await api.get(`${base}/patients/${patientId}/${endpoint}`);
      setItems(d.items || []);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [tab, patientId]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let path,
        body = { ...form };
      if (tab === 'Notes') path = `${base}/patients/${patientId}/notes`;
      if (tab === 'Laboratory') path = `${base}/patients/${patientId}/labs`;
      if (tab === 'Prescriptions')
        path = `${base}/patients/${patientId}/prescriptions`;
      if (tab === 'Appointments') {
        path = `${base}/appointments`;
        body.patientId = Number(patientId);
        body.scheduledAt = new Date(body.scheduledAt).toISOString();
      }
      await api.post(path, body);
      setForm({ noteType: 'Progress' });
      setMessage('Saved successfully.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    label,
    key,
    placeholder = '',
    type = 'text',
    required = false,
  ) => (
    <label className="field">
      {label}
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={form[key] || ''}
        onChange={e => set(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="card clinical-page">
      <h2>Clinical records and appointments</h2>
      <p className="hint">
        Enter the internal patient database ID shown in the patient profile.
        Clinical entries must be recorded and verified by authorised health
        personnel.
      </p>
      <label className="field">
        Patient database ID
        <input
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          placeholder="e.g. 12"
          inputMode="numeric"
        />
      </label>
      <div className="module-tabs">
        {tabs.map(t => (
          <button
            key={t}
            className={`btn ${tab === t ? 'btn-primary' : ''}`}
            onClick={() => {
              setTab(t);
              setForm({ noteType: 'Progress' });
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {tab !== 'Appointments' || patientId ? (
        <form className="module-form" onSubmit={submit}>
          {tab === 'Notes' && (
            <>
              {field('Note type', 'noteType', '', 'text')}
              {field('Subject', 'subject', 'Optional subject')}
              <label className="field">
                Clinical note
                <textarea
                  required
                  rows="5"
                  value={form.body || ''}
                  onChange={e => set('body', e.target.value)}
                />
              </label>
            </>
          )}
          {tab === 'Laboratory' && (
            <>
              {field(
                'Test name',
                'testName',
                'e.g. Full blood count',
                'text',
                true,
              )}
              <label className="field">Clinical notes</label>
              <textarea
                rows="3"
                value={form.clinicalNotes || ''}
                onChange={e => set('clinicalNotes', e.target.value)}
              />
            </>
          )}
          {tab === 'Prescriptions' && (
            <>
              {field(
                'Medication name',
                'medicationName',
                'Medication as prescribed',
                'text',
                true,
              )}
              {field('Strength', 'strength', 'e.g. 500 mg')}
              {field('Dose', 'dose', 'As prescribed', 'text', true)}
              {field('Route', 'route', 'e.g. oral', 'text', true)}
              {field('Frequency', 'frequency', 'As prescribed', 'text', true)}
              {field('Duration', 'duration')}
              {field('Quantity', 'quantity')}
              <label className="field">
                Instructions
                <textarea
                  rows="2"
                  value={form.instructions || ''}
                  onChange={e => set('instructions', e.target.value)}
                />
              </label>
            </>
          )}
          {tab === 'Appointments' && (
            <>
              {field(
                'Date and time',
                'scheduledAt',
                '',
                'datetime-local',
                true,
              )}
              {field(
                'Reason',
                'reason',
                'Reason for appointment',
                'text',
                true,
              )}
              <label className="field">
                Notes
                <textarea
                  rows="2"
                  value={form.notes || ''}
                  onChange={e => set('notes', e.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || !/^\d+$/.test(patientId)}
          >
            {busy ? 'Saving…' : 'Save record'}
          </button>
        </form>
      ) : (
        <p className="muted">Select a patient ID to schedule an appointment.</p>
      )}
      <h3>Saved {tab.toLowerCase()}</h3>
      {items.length === 0 ? (
        <p className="muted">No records to display.</p>
      ) : (
        <div className="module-list">
          {items.map((x, i) => (
            <article className="module-record" key={x.id || i}>
              <strong>
                {x.test_name ||
                  x.medication_name ||
                  x.subject ||
                  x.reason ||
                  x.note_type ||
                  'Appointment'}
              </strong>
              <span className="muted">
                {' '}
                {x.status || ''} ·{' '}
                {x.created_at ||
                  x.ordered_at ||
                  x.prescribed_at ||
                  x.scheduled_at ||
                  ''}
              </span>
              {x.body && <p>{x.body}</p>}
              {x.result_text && (
                <p>
                  <b>Result:</b> {x.result_text} {x.result_unit || ''} (
                  {x.abnormal_flag || 'Not assessed'})
                </p>
              )}
              {x.dose && (
                <p>
                  {x.dose} · {x.route} · {x.frequency}
                </p>
              )}
              {x.first_name && (
                <p>
                  {x.first_name} {x.last_name} ({x.patient_number})
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
