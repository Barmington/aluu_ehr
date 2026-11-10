export const PENDING = 'Checked In / Pending Triage';

export function ageFrom(dob) {
  if (!dob) return '';
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export function formatWait(minutes) {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const statusClass = (status) =>
  ({
    'Checked In / Pending Triage': 'badge badge-pending',
    'In Triage': 'badge badge-active',
    Triaged: 'badge badge-done',
    Cancelled: 'badge badge-muted',
  })[status] || 'badge';
