import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import { Spinner } from './components/ui/index.js';
import { useAuth } from './hooks/useAuth.js';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GradingParityPage from './pages/GradingParityPage.jsx';
import ExamModerationPage from './pages/ExamModerationPage.jsx';
import CurriculumHarmonizerPage from './pages/CurriculumHarmonizerPage.jsx';
import StudentRadarPage from './pages/StudentRadarPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

/**
 * Blocks a route until the session is known. While `isLoading` is true the
 * session is still being restored from localStorage — redirecting then would
 * bounce an authenticated user out on every refresh.
 *
 * Supports an optional `roles` prop to restrict access by role.
 */
export function ProtectedRoute({ roles, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Spinner size="lg" label="Restoring session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0 && (!user?.role || !roles.includes(user.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/grading-parity" element={<GradingParityPage />} />
        <Route path="/exam-moderation" element={<ExamModerationPage />} />
        <Route path="/curriculum-harmonizer" element={<CurriculumHarmonizerPage />} />
        <Route path="/student-radar" element={<StudentRadarPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

