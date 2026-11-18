import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { FaStaffSnake } from 'react-icons/fa6';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';

export default function RegisterPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('registrar');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/patients" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      await api.post('/auth/register', {
        fullName: fullName.trim(),
        username: username.trim(),
        password,
        requestedRole: role,
      });

      // Registrar accounts can sign in immediately.
      // Other roles require administrator approval.
      if (role === 'registrar') {
        await login(username.trim(), password);
        navigate('/patients', { replace: true });
      } else {
        navigate('/login', {
          replace: true,
          state: {
            message:
              'Registration successful. Your requested role ' +
              'requires administrator approval before access.',
          },
        });
      }
    } catch (err) {
      setError(err.message || 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        <Link to="/" className="back-home">
          ← Back to home
        </Link>

        <div className="login-brand">
          <FaStaffSnake size={38} />
          <div>
            <h2>Aluu Health Center EHR</h2>
            <p>Create your staff account</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <label>
          Full name
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            autoComplete="name"
            maxLength={120}
            required
          />
        </label>

        <label>
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={50}
            required
          />
        </label>

        <label>
          Select Role
          <select value={role} onChange={e => setRole(e.target.value)} required>
            <option value="registrar">Registrar</option>
            <option value="doctor">Doctor</option>
            <option value="nurse">Nurse</option>
            <option value="lab_technician">Lab Technician</option>
            <option value="pharmacist">Pharmacist</option>
            <option value="admin">Administrator</option>
          </select>
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
          <span className="hint">Use at least 10 characters.</span>
        </label>

        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <div className="registration-role-note">
          <strong>Account access</strong>
          <p>
            Registrar accounts receive standard access. Other staff roles
            require administrator approval before accessing the EHR system.
          </p>
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating account...' : 'Create account'}
        </button>

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
