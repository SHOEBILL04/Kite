import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
} from 'lucide-react';

import { ROLES, ROLE_LABELS } from '../api/contract.js';
import { USE_MOCK } from '../api/client.js';
import { Badge, Button } from '../components/ui/index.js';
import { useAuth } from '../hooks/useAuth.js';
import { cn } from '../lib/cn.js';

export default function Register() {
  const { isAuthenticated, isLoading, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'faculty',
    department: 'CSE',
    password: '',
    password_confirmation: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  if (isAuthenticated && !isLoading) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'Full name is required.';
    }

    if (!form.email.trim()) {
      errors.email = 'Institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!form.password) {
      errors.password = 'Password is required.';
    } else if (form.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (!form.password_confirmation) {
      errors.password_confirmation = 'Please confirm your password.';
    } else if (form.password !== form.password_confirmation) {
      errors.password_confirmation = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        department: form.department,
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setApiError(err.message || 'Registration failed.');
      if (err.errors) {
        // Flatten Laravel { field: [msg1, msg2] } into { field: msg1 }
        const mapped = {};
        Object.entries(err.errors).forEach(([k, msgs]) => {
          mapped[k] = Array.isArray(msgs) ? msgs[0] : msgs;
        });
        setFieldErrors(mapped);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 text-slate-100 lg:flex-row">
      {/* ====================================================================
       * LEFT PANEL: 55% BRAND & ONBOARDING CONTEXT
       * ==================================================================== */}
      <div className="relative flex flex-col justify-between border-b border-slate-800/80 bg-slate-950 p-6 sm:p-10 lg:w-[50%] lg:border-b-0 lg:border-r lg:p-14">
        <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-base font-black tracking-wider text-slate-950 shadow-lg shadow-amber-400/20">
              CF
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-100">
                  CogniFaculty
                </span>
                {USE_MOCK ? (
                  <Badge variant="warning" className="text-[10px] uppercase">
                    Mock Active
                  </Badge>
                ) : (
                  <Badge variant="pass" className="text-[10px] uppercase">
                    Live Engine
                  </Badge>
                )}
              </div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Institutional Onboarding Portal
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="mt-10 lg:mt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1 text-xs font-medium text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              Faculty & Moderator Registration
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">
              Join the academic quality assurance{' '}
              <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
                network.
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Create an institutional account to participate in automated syllabus review,
              cross-section grading parity audits, and pre-examination quality moderation.
            </p>
          </div>

          {/* Institutional Highlights */}
          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3.5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h4 className="text-xs font-semibold text-slate-200">
                  Role-Gated Moderation Workflows
                </h4>
                <p className="text-xs text-slate-400">
                  Assigned permissions for exam setters, department chairs, and university
                  moderation committee members.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3.5">
              <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <h4 className="text-xs font-semibold text-slate-200">
                  Instant Institutional Access
                </h4>
                <p className="text-xs text-slate-400">
                  Automated token issuance allows immediate transition to the live quality
                  dashboard upon account creation.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 border-t border-slate-800/60 pt-4 text-xs text-slate-500">
          Department of Computer Science & Engineering · Academic Year 2025–2026
        </div>
      </div>

      {/* ====================================================================
       * RIGHT PANEL: 45% REGISTRATION FORM
       * ==================================================================== */}
      <div className="flex flex-1 flex-col justify-center p-6 sm:p-10 lg:w-[50%] lg:p-12">
        <div className="mx-auto w-full max-w-md">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Create Account</h2>
            <p className="mt-1 text-xs text-slate-400">
              Enter your official academic details to register.
            </p>
          </div>

          {/* API Error Banner */}
          {apiError ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="leading-snug">{apiError}</div>
            </div>
          ) : null}

          <div className="mt-6 space-y-3.5">
            {/* Name */}
            <div>
              <label
                htmlFor="reg-name"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Full Name
              </label>
              <div className="relative mt-1">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="reg-name"
                  type="text"
                  value={form.name}
                  onChange={handleChange('name')}
                  placeholder="Dr. Amina Rahman"
                  className={cn(
                    'w-full rounded-lg border bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1',
                    fieldErrors.name
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400'
                  )}
                />
              </div>
              {fieldErrors.name ? (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>
              ) : null}
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="reg-email"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Institutional Email
              </label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="reg-email"
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="amina@aust.edu"
                  className={cn(
                    'w-full rounded-lg border bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1',
                    fieldErrors.email
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400'
                  )}
                />
              </div>
              {fieldErrors.email ? (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.email}</p>
              ) : null}
            </div>

            {/* Role & Department (Side-by-side on sm+) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Role */}
              <div>
                <label
                  htmlFor="reg-role"
                  className="block text-xs font-medium uppercase tracking-wider text-slate-400"
                >
                  Academic Role
                </label>
                <select
                  id="reg-role"
                  value={form.role}
                  onChange={handleChange('role')}
                  className="mt-1 h-[38px] w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {fieldErrors.role ? (
                  <p className="mt-1 text-xs text-rose-400">{fieldErrors.role}</p>
                ) : null}
              </div>

              {/* Department (Default CSE, Disabled) */}
              <div>
                <label
                  htmlFor="reg-dept"
                  className="block text-xs font-medium uppercase tracking-wider text-slate-400"
                >
                  Department
                </label>
                <div className="relative mt-1">
                  <Building2 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
                  <input
                    id="reg-dept"
                    type="text"
                    disabled
                    value="CSE"
                    className="h-[38px] w-full rounded-lg border border-slate-800/60 bg-slate-950/80 py-2 pl-9 pr-3 text-xs text-slate-400 cursor-not-allowed opacity-80"
                  />
                  <Lock className="pointer-events-none absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-600" />
                </div>
                <span className="mt-1 block text-[10px] text-slate-500">
                  Fixed to CSE institutional instance
                </span>
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="reg-password"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Password
              </label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="reg-password"
                  type="password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="•••••••• (min 6 characters)"
                  className={cn(
                    'w-full rounded-lg border bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1',
                    fieldErrors.password
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400'
                  )}
                />
              </div>
              {fieldErrors.password ? (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.password}</p>
              ) : null}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="reg-password-confirm"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Confirm Password
              </label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="reg-password-confirm"
                  type="password"
                  value={form.password_confirmation}
                  onChange={handleChange('password_confirmation')}
                  placeholder="••••••••"
                  className={cn(
                    'w-full rounded-lg border bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1',
                    fieldErrors.password_confirmation
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400'
                  )}
                />
              </div>
              {fieldErrors.password_confirmation ? (
                <p className="mt-1 text-xs text-rose-400">
                  {fieldErrors.password_confirmation}
                </p>
              ) : null}
            </div>

            {/* Submit Button */}
            <Button
              variant="primary"
              size="lg"
              className="mt-2 w-full"
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              <span>Create Account</span>
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Back to Login */}
            <div className="pt-2 text-center text-xs text-slate-400">
              Already have an institutional account?{' '}
              <Link
                to="/login"
                className="font-medium text-amber-400 hover:text-amber-300 hover:underline"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
