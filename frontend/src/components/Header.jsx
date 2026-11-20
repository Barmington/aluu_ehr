import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import upthLogo from '../assets/images.jpeg';

function Header() {
  const { logout, user } = useAuth();

  const navLinkClass = ({ isActive }) =>
    `whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-green-100 text-green-900'
        : 'text-gray-700 hover:bg-green-50 hover:text-green-900'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full bg-(--surface) border-b border-(--line)">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3">
        {/* Top section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          {/* Logo and title */}
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={upthLogo}
              alt="Clinic logo"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain shrink-0"
            />

            <div className="min-w-0">
              <h2 className="font-bold text-green-900 text-sm sm:text-base md:text-lg leading-tight">
                UPTH - Aluu Health Center Patient EHR Manager
              </h2>
            </div>
          </div>

          {/* User information and logout */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="text-sm min-w-0">
              <span className="font-semibold text-gray-800 wrap-break-words">
                {user?.fullName}
              </span>

              <span className="role ml-2 text-gray-500">{user?.role}</span>
            </div>

            <button className="btn btn-ghost shrink-0 text-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-2 mt-3 overflow-x-auto whitespace-nowrap pb-1">
          <NavLink to="/patients" className={navLinkClass}>
            Patient Search
          </NavLink>

          <NavLink to="/triage" className={navLinkClass}>
            Triage Queue
          </NavLink>

          <NavLink to="/clinical" className={navLinkClass}>
            Patient Records
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin/approvals" className={navLinkClass}>
              Staff Approvals
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
