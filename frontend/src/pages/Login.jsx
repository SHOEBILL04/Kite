import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  FileSearch,
  GitCompare,
  Lock,
  Mail,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCog,
  Zap,
} from 'lucide-react';

import { USE_MOCK } from '../api/client.js';
import { Badge, Button, KiteIcon } from '../components/ui/index.js';
import { useAuth } from '../hooks/useAuth.js';
import { cn } from '../lib/cn.js';

const DEMO_PERSONAS = [
  {
    role: 'faculty',
    name: 'Prof. Monir',
    title: 'Exam Setter',
    description: 'CSE 2101 Lecturer & Course Coordinator',
    icon: UserCog,
    badgeVariant: 'warning',
  },
  {
    role: 'head_of_department',
    name: 'Dr. Amina',
    title: 'Department Head',
    description: 'HoD Computer Science & Engineering',
    icon: ShieldCheck,
    badgeVariant: 'pass',
  },
  {
    role: 'moderator',
    name: 'Sec. Moderator',
    title: 'Grading Moderator',
    description: 'Academic Quality & Moderation Committee',
    icon: Scale,
    badgeVariant: 'info',
  },
];

const MODULE_BULLETS = [
  {
    icon: Scale,
    title: 'Grading Parity Audit',
    description:
      'Pinpoint statistical marker drift and variance discrepancies between parallel course sections.',
  },
  {
    icon: GitCompare,
    title: 'Curriculum Harmonizer',
    description:
      'Uncover cross-semester redundancies and prevent missing prerequisite knowledge gaps.',
  },
  {
    icon: FileSearch,
    title: 'Exam Moderation Studio',
    description:
      'Flag Bloom’s taxonomy verb-level mismatches, question duplication, and mark sum defects.',
  },
  {
    icon: Radar,
    title: 'Student Early-Warning Radar',
    description:
      'Identify critical trajectory collapse and disengagement weeks before final exam publication.',
  },
];

export default function Login() {
  const { isAuthenticated, isLoading, login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDemoRole, setPendingDemoRole] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [clientErrors, setClientErrors] = useState({});

  const redirectTo = location.state?.from?.pathname ?? '/dashboard';

  if (isAuthenticated && !isLoading) {
    return <Navigate to={redirectTo} replace />;
  }

  const validateForm = () => {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleManualLogin = async (e) => {
    e?.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      await login({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setApiError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (role) => {
    setPendingDemoRole(role);
    setApiError(null);
    setClientErrors({});

    try {
      await demoLogin(role);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setApiError(err.message || 'Demo login failed.');
    } finally {
      setPendingDemoRole(null);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas text-primary lg:flex-row">
      {/* ====================================================================
       * LEFT PANEL: 60% BRAND & CAPABILITY SHOWCASE
       * ==================================================================== */}
      <div className="relative flex flex-col justify-between border-b border-border-default bg-surface p-6 sm:p-10 lg:w-[60%] lg:border-b-0 lg:border-r lg:p-14">
        <div className="relative z-10">
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface border border-border-default/80 shadow-elevation">
              <KiteIcon size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold tracking-wider text-heading font-mono">
                  KITE
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
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted">
                Academic Quality & Intelligence Audit
              </div>
            </div>
          </div>

          {/* Hero Tagline */}
          <div className="mt-10 lg:mt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-subtle px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5 text-green-500" />
              Continuous Quality Audit Suite
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-heading sm:text-4xl lg:text-5xl">
              Academic quality assurance,{' '}
              <span className="text-green-500 font-bold">
                audited.
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-secondary sm:text-base">
              Algorithmic verification across departmental course syllabi, draft examination defect
              screening, section-level grading bias detection, and predictive student risk modeling.
            </p>
          </div>

          {/* 4 Feature Bullets */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-14">
            {MODULE_BULLETS.map((bullet) => {
              const Icon = bullet.icon;
              return (
                <div
                  key={bullet.title}
                  className="group rounded-[8px] border border-border-default bg-surface p-4 transition-all hover:border-border-strong"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-border-default bg-subtle text-green-500">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <h3 className="text-xs font-semibold text-heading group-hover:text-primary">
                      {bullet.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-secondary">
                    {bullet.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Left Footer Meta */}
        <div className="relative z-10 mt-8 border-t border-border-default pt-4 text-xs text-muted">
          Built for Higher Education Quality Assurance Committees · AUST CSE Demonstration
        </div>
      </div>

      {/* ====================================================================
       * RIGHT PANEL: 40% SIGN IN FORM & 1-CLICK DEMO ACCESS
       * ==================================================================== */}
      <div className="flex flex-1 flex-col justify-center p-6 sm:p-10 lg:w-[40%] lg:p-12 bg-canvas">
        <div className="mx-auto w-full max-w-md">
          {/* Form Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-heading">Sign in</h2>
            <p className="mt-1 text-xs text-muted">
              Access your institutional dashboard and course audit evaluations.
            </p>
          </div>

          {/* API Error Banner */}
          {apiError ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-[8px] border border-critical-border bg-critical-bg p-3 text-xs text-critical-text"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical-text" />
              <div className="leading-snug">{apiError}</div>
            </div>
          ) : null}

          {/* Credentials Form */}
          <div className="mt-6 space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Institutional Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (clientErrors.email) {
                      setClientErrors((prev) => ({ ...prev, email: null }));
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualLogin()}
                  placeholder="monir@aust.edu"
                  className={cn(
                    'w-full h-9 rounded-[8px] border bg-surface py-2 pl-9 pr-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-border-focus',
                    clientErrors.email
                      ? 'border-critical-border'
                      : 'border-border-default'
                  )}
                />
              </div>
              {clientErrors.email ? (
                <p className="mt-1 text-xs text-critical-text">{clientErrors.email}</p>
              ) : null}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (clientErrors.password) {
                      setClientErrors((prev) => ({ ...prev, password: null }));
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualLogin()}
                  placeholder="••••••••"
                  className={cn(
                    'w-full h-9 rounded-[8px] border bg-surface py-2 pl-9 pr-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-border-focus',
                    clientErrors.password
                      ? 'border-critical-border'
                      : 'border-border-default'
                  )}
                />
              </div>
              {clientErrors.password ? (
                <p className="mt-1 text-xs text-critical-text">{clientErrors.password}</p>
              ) : null}
            </div>

            {/* Submit Button */}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={isSubmitting}
              disabled={isSubmitting || Boolean(pendingDemoRole)}
              onClick={handleManualLogin}
            >
              <span>Sign in</span>
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Link to Register */}
            <div className="text-center text-xs text-muted">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-primary hover:underline"
              >
                Create an account
              </Link>
            </div>
          </div>

          {/* ==================================================================
           * QUICK DEMO ACCESS BLOCK (JUDGE-FACING 1-CLICK CARDS)
           * ================================================================== */}
          <div className="mt-8 rounded-[8px] border border-border-strong bg-subtle p-4 shadow-elevation">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-action-primary text-action-text">
                  <Zap className="h-3.5 w-3.5 fill-current" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-heading">
                  Quick Demo Access
                </span>
              </div>
              <Badge variant="warning" className="text-[10px]">
                1-Click Judge Login
              </Badge>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-secondary">
              Select any seeded persona to test role-specific workflows immediately without typing:
            </p>

            {/* 3 One-Click Persona Cards */}
            <div className="mt-3 space-y-2">
              {DEMO_PERSONAS.map((persona) => {
                const Icon = persona.icon;
                const isPending = pendingDemoRole === persona.role;

                return (
                  <div
                    key={persona.role}
                    role="button"
                    tabIndex={0}
                    onClick={() => !pendingDemoRole && handleDemoLogin(persona.role)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        !pendingDemoRole && handleDemoLogin(persona.role);
                      }
                    }}
                    className={cn(
                      'group flex items-center justify-between rounded-[8px] border border-border-default bg-surface p-3 transition-all',
                      'hover:border-border-strong hover:bg-hover',
                      'focus-ring cursor-pointer',
                      isPending && 'opacity-60 pointer-events-none'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-border-default bg-subtle text-green-500">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold text-heading group-hover:text-primary">
                            {persona.name}
                          </span>
                          <Badge variant={persona.badgeVariant} className="text-[10px]">
                            {persona.title}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted">
                          {persona.description}
                        </p>
                      </div>
                    </div>

                    <div className="ml-2 shrink-0 text-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5">
                      {isPending ? (
                        <span className="text-[11px] font-medium text-primary">Loading…</span>
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-center text-[10px] text-muted">
              All accounts seeded with instant Sanctum tokens in SQLite WAL DB.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
