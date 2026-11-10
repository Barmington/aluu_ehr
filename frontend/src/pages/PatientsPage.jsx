import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PatientForm from '../components/PatientForm.jsx';
import PatientProfile from '../components/PatientProfile.jsx';
import { ageFrom, statusClass } from '../utils.js';

export default function PatientsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user.role === 'registrar' || user.role === 'admin';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [registering, setRegistering] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState('');
  const [regFieldErrors, setRegFieldErrors] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [pendingForm, setPendingForm] = useState(null);

  async function runSearch(q) {
    setSearching(true);
    setSearchError('');
    try {
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`);
      setResults(res.results);
    } catch (error) {
      setResults(null);
      setSearchError(error.message);
    } finally {
      setSearching(false);
    }
  }

  function onSearch(e) {
    e.preventDefault();
    if (query.trim()) runSearch(query.trim());
  }

  async function register(form, force = false) {
    setRegBusy(true);
    setRegError('');
    setRegFieldErrors([]);
    setDuplicates([]);
    setPendingForm(form);
    try {
      const res = await api.post(
        `/patients${force ? '?force=true' : ''}`,
        form,
      );
      setRegistering(false);
      setPendingForm(null);
      navigate(`/patients/${res.patient.id}`);
    } catch (e) {
      if (e.status === 409 && e.data.duplicates)
        setDuplicates(e.data.duplicates);
      else {
        setRegError(e.message);
        setRegFieldErrors(e.data?.details || []);
      }
    } finally {
      setRegBusy(false);
    }
  }

  return (
    <div className="two-col">
      <section className="col-left">
        <div className="card">
          <h2>Find a patient</h2>
          <form className="search-bar" onSubmit={onSearch} role="search">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Patient ID, name or phone number"
              aria-label="Search patients by ID, name or phone number"
              autoFocus
            />
            <button
              className="btn btn-primary"
              disabled={searching || query.trim().length < 2}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          <p className="hint">
            Try “PT-1000”, “Okafor”, “Smith, John” or “07700 900456”.
          </p>

          {searchError && (
            <div className="alert alert-error">{searchError}</div>
          )}

          {results && (
            <>
              <div className="results-head">
                {results.length} {results.length === 1 ? 'match' : 'matches'}
              </div>
              {results.length === 0 && (
                <p className="muted">No matching patient records.</p>
              )}
              <ul className="results">
                {results.map(p => (
                  <li key={p.id}>
                    <button
                      className={`result ${String(p.id) === id ? 'selected' : ''}`}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      <span className="result-name">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="muted">
                        {p.patientNumber} · {p.sex} · {ageFrom(p.dateOfBirth)}{' '}
                        yrs · {p.phone}
                      </span>
                      {p.activeVisit && (
                        <span className={statusClass(p.activeVisit.status)}>
                          {p.activeVisit.status}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {canEdit && (
            <div className="new-patient">
              <span className="muted">Not found?</span>
              <button
                className="btn"
                onClick={() => {
                  setRegistering(true);
                  setDuplicates([]);
                  setRegError('');
                }}
              >
                Register new patient
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="col-right">
        {registering ? (
          <div className="card">
            <h2>Register new patient</h2>
            {regError && <div className="alert alert-error">{regError}</div>}
            {duplicates.length > 0 && (
              <div className="alert alert-warn">
                <strong>Possible duplicate:</strong> a patient with the same
                name and date of birth already exists.
                <ul>
                  {duplicates.map(d => (
                    <li key={d.id}>
                      {d.firstName} {d.lastName} ({d.patientNumber}, {d.phone}){' '}
                      <button
                        className="link"
                        onClick={() => {
                          setRegistering(false);
                          navigate(`/patients/${d.id}`);
                        }}
                      >
                        Use existing record
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="btn"
                  onClick={() => register(pendingForm, true)}
                  disabled={regBusy}
                >
                  Create anyway (different person)
                </button>
              </div>
            )}
            <PatientForm
              onSubmit={form => register(form)}
              onCancel={() => setRegistering(false)}
              busy={regBusy}
              fieldErrors={regFieldErrors}
            />
          </div>
        ) : id ? (
          <PatientProfile
            key={id}
            patientId={id}
            canEdit={canEdit}
            onChanged={() =>
              query.trim().length >= 2 && runSearch(query.trim())
            }
          />
        ) : (
          <div className="card empty">
            <h2>No patient selected</h2>
            <p className="muted">
              Search by ID, name or phone number, then select a record to view
              the profile, update contact details and send the patient to
              triage.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
