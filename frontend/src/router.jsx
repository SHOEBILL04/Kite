import { useCallback, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { Spinner } from './components/ui/index.js';
import { useAuth } from './hooks/useAuth.js';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GradingParityPage from './pages/GradingParityPage.jsx';
import GradingBatches from './pages/GradingBatches.jsx';
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
      <div className="flex min-h-screen items-center justify-center bg-canvas">
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

/**
 * Wraps one route in its own error boundary.
 *
 * Retry bumps `key`, which remounts the page subtree from scratch — clearing
 * not just the boundary's captured error but any wedged component state that
 * caused it. Without the remount, "Retry" would re-render the same broken tree
 * and fail again immediately.
 */
function RouteBoundary({ label, children }) {
  const [attempt, setAttempt] = useState(0);
  const handleRetry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <ErrorBoundary key={attempt} label={label} onRetry={handleRetry}>
      {children}
    </ErrorBoundary>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
          path="/login"
          element={
            <RouteBoundary label="Sign in">
              <LoginPage />
            </RouteBoundary>
          }
        />
      <Route
          path="/register"
          element={
            <RouteBoundary label="Registration">
              <RegisterPage />
            </RouteBoundary>
          }
        />

      <Route
        element={
          <ProtectedRoute>
            <RouteBoundary label="Application shell">
              <AppShell />
            </RouteBoundary>
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard"
          element={
            <RouteBoundary label="Dashboard">
              <DashboardPage />
            </RouteBoundary>
          }
        />
        <Route
          path="/grading-batches"
          element={
            <RouteBoundary label="Mark Collection">
              <GradingBatches />
            </RouteBoundary>
          }
        />
        <Route
          path="/grading-parity"
          element={
            <RouteBoundary label="Grading Parity">
              <GradingParityPage />
            </RouteBoundary>
          }
        />
        <Route
          path="/exam-moderation"
          element={
            <RouteBoundary label="Exam Moderation">
              <ExamModerationPage />
            </RouteBoundary>
          }
        />
        <Route
          path="/curriculum-harmonizer"
          element={
            <RouteBoundary label="Curriculum Harmonizer">
              <CurriculumHarmonizerPage />
            </RouteBoundary>
          }
        />
        <Route
          path="/student-radar"
          element={
            <RouteBoundary label="Student Radar">
              <StudentRadarPage />
            </RouteBoundary>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

