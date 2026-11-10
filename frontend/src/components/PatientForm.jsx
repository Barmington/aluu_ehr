import { createContext, useContext, useState } from 'react';

// Defined at module level (NOT inside PatientForm) so inputs keep focus while typing.
const ErrorsContext = createContext([]);

function Field({ name, label, children, required }) {
  const errors = useContext(ErrorsContext);
  const message = errors.find(d => d.field === name)?.message;
  return (
    <label className={message ? 'has-error' : ''}>
      {label}
      {required && <span className="req"> *</span>}
      {children}
      {message && <span className="field-error">{message}</span>}
    </label>
  );
}

const EMPTY = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  sex: '',
  phone: '',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  allergies: '',
};

/** New-patient registration form. `fieldErrors` is the API's validation details array. */
export default function PatientForm({
  initial = {},
  onSubmit,
  onCancel,
  busy,
  fieldErrors = [],
}) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      className="form-grid"
      onSubmit={e => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <ErrorsContext.Provider value={fieldErrors}>
        <Field name="firstName" label="First name" required>
          <input value={form.firstName} onChange={set('firstName')} required />
        </Field>
        <Field name="lastName" label="Last name" required>
          <input value={form.lastName} onChange={set('lastName')} required />
        </Field>
        <Field name="dateOfBirth" label="Date of birth" required>
          <input
            type="date"
            max={today}
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            required
          />
        </Field>
        <Field name="sex" label="Sex" required>
          <select value={form.sex} onChange={set('sex')} required>
            <option value="">Select...</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
            <option>Unknown</option>
          </select>
        </Field>
        <Field name="phone" label="Phone number" required>
          <input
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+44 7700 900123"
            required
          />
        </Field>
        <Field name="email" label="Email">
          <input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <div className="span-2">
          <Field name="address" label="Address">
            <input value={form.address} onChange={set('address')} />
          </Field>
        </div>
        <Field name="emergencyContactName" label="Emergency contact name">
          <input
            value={form.emergencyContactName}
            onChange={set('emergencyContactName')}
          />
        </Field>
        <Field name="emergencyContactPhone" label="Emergency contact phone">
          <input
            type="tel"
            value={form.emergencyContactPhone}
            onChange={set('emergencyContactPhone')}
          />
        </Field>
        <div className="span-2">
          <Field name="allergies" label="Known allergies">
            <input
              value={form.allergies}
              onChange={set('allergies')}
              placeholder="e.g. Penicillin"
            />
          </Field>
        </div>
        <div className="span-2 actions">
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving...' : 'Register patient'}
          </button>
        </div>
      </ErrorsContext.Provider>
    </form>
  );
}
