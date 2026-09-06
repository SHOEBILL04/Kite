import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Zap } from 'lucide-react';
import { ROLES, ROLE_LABELS } from '../api/contract.js';
import { USE_MOCK } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { Badge, Button } from '../components/ui/index.js';
import { cn } from '../lib/cn.js';

const FIELD =
  'focus-ring h-9 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-[13px] text-slate-200 placeholder:text-slate-600';

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-rose-400">{error}</span> : null}
    </label>
  );
}

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, demoLogin, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    role: 'faculty',
    department: 'CSE',
  });
  const [pending, setPending] = useState(null); // 'form' | a role slug
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const redirectTo = location.state?.from?.pathname ?? '/dashboard';

  if (isAuthenticated && !isLoading) return <Navigate to={redirectTo} replace />;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const run = async (key, action) => {
    setPending(key);
    setError(null);
    setFieldErrors({});
    try {
      await action();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message ?? 'Something went wrong.');
      setFieldErrors(err.errors ?? {});
    } finally {
      setPending(null);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    run('form', () =>
      mode === 'login'
        ? login({ email: form.email, password: form.password })
        : register(form)
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-sm font-bold text-slate-950">
            CF
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-slate-100">CogniFaculty</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Academic Integrity Audit
            </div>
          </div>
          {USE_MOCK ? <Badge variant="warning" className="ml-auto">MOCK DATA</Badge> : null}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900">
          {/* Mode switch */}
          <div className="flex border-b border-slate-800">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setFieldErrors({});
                }}
                className={cn(
                  'focus-ring flex-1 px-4 py-2.5 text-[13px] font-medium transition-colors',
                  mode === m
                    ? 'border-b-2 border-amber-400 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 p-4">
            {mode === 'register' ? (
              <Field label="Name" error={fieldErrors.name?.[0]}>
                <input
                  className={FIELD}
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Dr. Amina"
                  autoComplete="name"
                  required
                />
              </Field>
            ) : null}

            <Field label="Email" error={fieldErrors.email?.[0]}>
              <input
                className={FIELD}
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="monir@aust.edu"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password" error={fieldErrors.password?.[0]}>
              <input
                className={FIELD}
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </Field>

            {mode === 'register' ? (
              <>
                <Field label="Confirm password" error={fieldErrors.password_confirmation?.[0]}>
                  <input
                    className={FIELD}
                    type="password"
                    value={form.password_confirmation}
                    onChange={set('password_confirmation')}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field label="Role" error={fieldErrors.role?.[0]}>
                  <select className={FIELD} value={form.role} onChange={set('role')}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>{error}</span>
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={pending === 'form'}
              disabled={Boolean(pending)}
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
          </form>

          {/* One-click demo logins for judges */}
          <div className="border-t border-slate-800 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <Zap className="h-3 w-3 text-amber-400" strokeWidth={2} />
              Demo login
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ROLES.map((role) => (
                <Button
                  key={role}
                  variant="ghost"
                  size="sm"
                  className="justify-center"
                  loading={pending === role}
                  disabled={Boolean(pending)}
                  onClick={() => run(role, () => demoLogin(role))}
                >
                  {ROLE_LABELS[role]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-600">
          Seeded accounts use the password <code className="text-slate-500">password</code>.
        </p>
      </div>
    </div>
  );
}
