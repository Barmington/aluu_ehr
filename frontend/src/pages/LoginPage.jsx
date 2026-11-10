import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { FaStaffSnake } from 'react-icons/fa6';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/patients" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate('/patients', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="flex justify-center items-center">
          <div className="mr-3 text-(--primary)">
            {/* <span className="brand-mark" aria-hidden="true"> */}
            <FaStaffSnake size={40} />
            {/* </span> */}
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="font-bold pl-3 font-['Inter',sans-serif] not-italic">
              Aluu Health Center EHR
            </h2>
            <p>Electronic Health Record &amp; Information Retrieval System</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <label>
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <details className="demo-accounts">
          <summary>Demo accounts</summary>
          <ul>
            <li>
              <code>registrar</code> / <code>Registrar#2026</code> (search,
              register, check in)
            </li>
            <li>
              <code>nurse</code> / <code>Nurse#2026</code> (view queue, start
              triage)
            </li>
            <li>
              <code>admin</code> / <code>Admin#2026</code> (everything)
            </li>
          </ul>
        </details>
      </form>
    </div>
  );
}
