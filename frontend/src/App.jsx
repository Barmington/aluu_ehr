import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import TriagePage from './pages/TriagePage.jsx';
import ClinicalModulesPage from './pages/ClinicalModulesPage.jsx';
import Header from './components/Header.jsx';

function Layout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div>
      <Header />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Layout />}>
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientsPage />} />
        <Route path="/triage" element={<TriagePage />} />
        <Route path="/clinical" element={<ClinicalModulesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
