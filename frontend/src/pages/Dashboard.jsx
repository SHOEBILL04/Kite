import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  FileSearch,
  GitCompare,
  PieChart as PieIcon,
  Play,
  Radar,
  RefreshCw,
  Scale,
  Sparkles,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { ENDPOINTS, QUERY_KEYS, ROLE_LABELS } from '../api/contract.js';
import { get } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SeverityPill,
  Skeleton,
  StatCard,
} from '../components/ui/index.js';
import { cn } from '../lib/cn.js';

// Module configuration for icons, routes, and labels
const MODULE_MAP = {
  grading: {
    title: 'Grading Parity',
    icon: Scale,
    path: '/grading-parity',
  },
  syllabus: {
    title: 'Curriculum Harmonizer',
    icon: GitCompare,
    path: '/curriculum-harmonizer',
  },
  exam: {
    title: 'Exam Moderation',
    icon: FileSearch,
    path: '/exam-moderation',
  },
  student_risk: {
    title: 'Student Radar',
    icon: Radar,
    path: '/student-radar',
  },
};

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-[8px] border border-border-default bg-surface px-3 py-2 text-xs shadow-elevation">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: item.payload.color }}
        />
        <span className="font-medium text-secondary">{item.name} Severity:</span>
        <span className="font-mono font-semibold text-primary">{item.value}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { resolved } = useTheme();
  const navigate = useNavigate();

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.dashboardSummary,
    queryFn: () => get(ENDPOINTS.dashboardSummary),
  });

  const greeting = useMemo(() => getTimeGreeting(), []);

  const SEVERITY_COLORS = useMemo(() => {
    return { low: 'var(--pass-text)', medium: 'var(--warning-text)', high: 'var(--critical-text)' };
  }, []);

  // Compute severity data for Recharts donut
  const { donutData, totalSeverityCount } = useMemo(() => {
    const sb = summary?.severity_breakdown ?? { low: 0, medium: 0, high: 0 };
    const low = sb.low ?? 0;
    const medium = sb.medium ?? 0;
    const high = sb.high ?? 0;
    const total = low + medium + high;

    return {
      totalSeverityCount: total,
      donutData: [
        { name: 'Low', value: low, color: SEVERITY_COLORS.low, key: 'low' },
        { name: 'Medium', value: medium, color: SEVERITY_COLORS.medium, key: 'medium' },
        { name: 'High', value: high, color: SEVERITY_COLORS.high, key: 'high' },
      ].filter((d) => d.value > 0),
    };
  }, [summary, SEVERITY_COLORS]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-20" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-5" />
          <Skeleton className="h-80 lg:col-span-7" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardBody className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-critical-bg text-critical-text">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-heading">
            Failed to load dashboard summary
          </h2>
          <p className="mt-1 text-xs text-secondary max-w-sm mx-auto">
            {error?.message ?? 'The backend API did not respond with dashboard metrics.'}
          </p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            Retry Loading
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <EmptyState
          title="No summary metrics available"
          description="Click retry or check backend seed database connection."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </Card>
    );
  }

  const recentReports = summary.recent_reports?.slice(0, 6) ?? [];

  return (
    <div className="space-y-6">
      {/* 1. GREETING ROW */}
      <section aria-label="Greeting Header" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-heading sm:text-2xl">
              {greeting}, {user?.name ?? 'Dr. Amina'}
            </h1>
          </div>
          <p className="text-xs text-muted sm:text-sm">
            Continuous academic quality audit posture and cross-sectional monitoring.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="uppercase tracking-wider">
            {ROLE_LABELS[user?.role] ?? 'Faculty'}
          </Badge>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface px-3 py-1 text-xs font-medium text-secondary shadow-elevation">
            <Calendar className="h-3.5 w-3.5 text-green-500" />
            <span>Fall 2025 / Spring 2026</span>
          </span>
        </div>
      </section>

      {/* 2. FOUR STATCARDS IN RESPONSIVE GRID */}
      <section aria-label="Key Audit Statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Audited Exams"
          value={summary.audited_exams}
          icon={FileSearch}
          tone="neutral"
          delta="+1 draft pending"
          hint="Questions evaluated across Bloom's levels"
          onClick={() => navigate('/exam-moderation')}
          className="cursor-pointer"
        />

        <StatCard
          label="Active Sections"
          value={summary.active_sections}
          icon={Scale}
          tone={summary.active_sections > 0 ? 'warning' : 'neutral'}
          delta="2 cohorts compared"
          hint="Parallel sections analyzed for grading drift"
          onClick={() => navigate('/grading-parity')}
          className="cursor-pointer"
        />

        <StatCard
          label="Harmonization Alerts"
          value={summary.harmonization_alerts}
          icon={GitCompare}
          tone={summary.harmonization_alerts > 0 ? 'warning' : 'pass'}
          delta="3 overlaps · 2 gaps"
          hint="Curriculum redundancies & missing prerequisites"
          onClick={() => navigate('/curriculum-harmonizer')}
          className="cursor-pointer"
        />

        <StatCard
          label="Students at Risk"
          value={summary.students_at_risk}
          icon={Radar}
          tone={summary.students_at_risk > 0 ? 'critical' : 'pass'}
          delta="3 high-urgency"
          hint="Mid-semester collapse & disengagement cases"
          onClick={() => navigate('/student-radar')}
          className="cursor-pointer"
        />
      </section>

      {/* 3. RUN AN AUDIT QUICK-ACTION BAR */}
      <section aria-label="Quick Action Audits" className="rounded-[8px] border border-border-default bg-surface p-4 shadow-elevation">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Run an Audit
            </h2>
          </div>
          <span className="text-[11px] text-muted">
            One-click automated analysis
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/grading-parity?autorun=1')}
            className="group flex w-full items-center justify-between border border-border-default bg-subtle px-3 py-2.5 hover:bg-hover"
          >
            <span className="flex items-center gap-2 truncate text-primary">
              <Scale className="h-4 w-4 shrink-0 text-green-500" />
              <span className="truncate text-xs font-medium">Grading Parity</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/exam-moderation?autorun=1')}
            className="group flex w-full items-center justify-between border border-border-default bg-subtle px-3 py-2.5 hover:bg-hover"
          >
            <span className="flex items-center gap-2 truncate text-primary">
              <FileSearch className="h-4 w-4 shrink-0 text-green-500" />
              <span className="truncate text-xs font-medium">Exam Moderation</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/curriculum-harmonizer?autorun=1')}
            className="group flex w-full items-center justify-between border border-border-default bg-subtle px-3 py-2.5 hover:bg-hover"
          >
            <span className="flex items-center gap-2 truncate text-primary">
              <GitCompare className="h-4 w-4 shrink-0 text-green-500" />
              <span className="truncate text-xs font-medium">Curriculum Harmonizer</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/student-radar?autorun=1')}
            className="group flex w-full items-center justify-between border border-border-default bg-subtle px-3 py-2.5 hover:bg-hover"
          >
            <span className="flex items-center gap-2 truncate text-primary">
              <Radar className="h-4 w-4 shrink-0 text-green-500" />
              <span className="truncate text-xs font-medium">Student Radar</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </Button>
        </div>
      </section>

      {/* 4. TWO-COLUMN LOWER SECTION */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: RECHARTS DONUT OF SEVERITY BREAKDOWN */}
        <section aria-label="Severity Breakdown Chart" className="lg:col-span-5">
          <Card className="h-full flex flex-col">
            <CardHeader
              icon={PieIcon}
              title="Severity Breakdown"
              subtitle="Distribution of detected academic anomalies"
            />
            <CardBody className="flex flex-1 flex-col items-center justify-center p-6">
              {totalSeverityCount === 0 ? (
                <EmptyState
                  title="No Anomalies Flagged"
                  description="All course and exam standards currently pass audit requirements."
                />
              ) : (
                <div className="w-full flex flex-col items-center">
                  {/* Donut Container with Center Text */}
                  <div className="relative h-56 w-full max-w-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip content={<CustomTooltip />} />
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={88}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="var(--bg-surface)"
                          strokeWidth={2}
                        >
                          {donutData.map((entry) => (
                            <Cell key={`cell-${entry.key}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Centered Total Label */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-bold tabular-nums tracking-tight text-heading">
                        {totalSeverityCount}
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        Total Issues
                      </span>
                    </div>
                  </div>

                  {/* Breakdown Legend */}
                  <div className="mt-4 grid w-full grid-cols-3 gap-2 border-t border-border-default pt-4 text-center">
                    <div className="rounded-[8px] border border-border-default bg-subtle p-2">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-pass-text">
                        <span className="h-2 w-2 rounded-full bg-pass-text" />
                        <span className="font-medium">Low</span>
                      </div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-primary">
                        {summary.severity_breakdown.low}
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-border-default bg-subtle p-2">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-warning-text">
                        <span className="h-2 w-2 rounded-full bg-warning-text" />
                        <span className="font-medium">Medium</span>
                      </div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-primary">
                        {summary.severity_breakdown.medium}
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-border-default bg-subtle p-2">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-critical-text">
                        <span className="h-2 w-2 rounded-full bg-critical-text" />
                        <span className="font-medium">High</span>
                      </div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-primary">
                        {summary.severity_breakdown.high}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </section>

        {/* RIGHT COLUMN: RECENT FINDINGS LIST */}
        <section aria-label="Recent Findings Feed" className="lg:col-span-7">
          <Card className="h-full flex flex-col">
            <CardHeader
              icon={Sparkles}
              title="Recent Findings"
              subtitle="Latest anomalies detected across active modules"
              action={
                <span className="text-xs text-muted">
                  Showing {recentReports.length} results
                </span>
              }
            />

            <CardBody className="p-0 flex-1">
              {recentReports.length === 0 ? (
                <EmptyState
                  title="No Recent Findings"
                  description="No audit events have been logged yet."
                  actionLabel="Run an Audit"
                  onAction={() => navigate('/grading-parity?autorun=1')}
                />
              ) : (
                <ul className="divide-y divide-border-default">
                  {recentReports.map((report) => {
                    const mod = MODULE_MAP[report.module] ?? {
                      title: 'General',
                      icon: FileSearch,
                      path: '/dashboard',
                    };
                    const ModIcon = mod.icon;

                    return (
                      <li key={report.id}>
                        <button
                          type="button"
                          onClick={() => navigate(mod.path)}
                          className="group flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-hover cursor-pointer"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-border-default bg-subtle text-green-500">
                            <ModIcon className="h-4 w-4" strokeWidth={1.75} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-xs font-semibold text-heading group-hover:text-primary">
                                {report.title}
                              </span>
                              <SeverityPill severity={report.severity} />
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                              <span className="font-medium text-secondary">
                                {report.subject}
                              </span>
                              <span>•</span>
                              <span>{formatRelativeTime(report.created_at)}</span>
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
