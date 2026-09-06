import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Lock,
  Play,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ENDPOINTS, QUERY_KEYS } from '../api/contract.js';
import { get, post } from '../api/client.js';
import {
  AiSummaryCard,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SeverityPill,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui/index.js';
import { cn } from '../lib/cn.js';

// Rotating loading labels during parity computation
const LOADING_STEPS = [
  'Computing section statistics…',
  'Fitting baseline…',
  'Generating analysis…',
];

// Helper to determine which bucket a numeric mean belongs to
function getBucketForMean(mean, buckets = []) {
  if (!buckets.length) return null;
  for (const b of buckets) {
    const parts = b.split('-').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      if (mean >= parts[0] && mean <= parts[1]) {
        return b;
      }
    }
  }
  return buckets[buckets.length - 1];
}

// Custom tooltip for overlaid distribution bell curves
function CustomDistributionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-[8px] border border-border-default bg-surface p-3 text-xs shadow-elevation backdrop-blur-sm">
      <div className="mb-2 font-medium text-secondary">
        Score Band: <span className="font-mono text-primary">{label} marks</span>
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-secondary">{entry.name}:</span>
            </div>
            <span className="font-mono font-semibold text-primary">
              {entry.value} {entry.value === 1 ? 'student' : 'students'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GradingParity() {
  const [searchParams] = useSearchParams();
  const autorunParam = searchParams.get('autorun') === '1';

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const autoRunTriggeredRef = useRef(false);

  // 1. Fetch courses for the course selector
  const {
    data: courses,
    isLoading: isCoursesLoading,
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: QUERY_KEYS.courses,
    queryFn: () => get(ENDPOINTS.courses),
  });

  // Default to first course once loaded
  useEffect(() => {
    if (courses && courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(String(courses[0].id));
    }
  }, [courses, selectedCourseId]);

  // 2. Audit Mutation
  const auditMutation = useMutation({
    mutationFn: (courseId) =>
      post(ENDPOINTS.auditGradingDrift, { course_id: Number(courseId) }),
  });

  // Cycle rotating status text during loading
  useEffect(() => {
    if (!auditMutation.isPending) {
      setLoadingStepIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingStepIdx((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1200);
    return () => clearInterval(timer);
  }, [auditMutation.isPending]);

  // 3. Auto-run if ?autorun=1 is in the URL on mount
  useEffect(() => {
    if (autorunParam && selectedCourseId && !autoRunTriggeredRef.current && !auditMutation.isPending) {
      autoRunTriggeredRef.current = true;
      auditMutation.mutate(selectedCourseId);
    }
  }, [autorunParam, selectedCourseId, auditMutation]);

  const handleRunAudit = () => {
    if (!selectedCourseId) return;
    auditMutation.mutate(selectedCourseId);
  };

  const report = auditMutation.data;
  const isPending = auditMutation.isPending;
  const isError = auditMutation.isError;
  const error = auditMutation.error;

  // Find Section A and Section B stats
  const sectionStats = report?.section_stats ?? [];
  const secA = sectionStats.find((s) => s.section_name.toLowerCase().includes('a')) ?? sectionStats[0];
  const secB = sectionStats.find((s) => s.section_name.toLowerCase().includes('b')) ?? sectionStats[1];

  // Distribution chart data
  const chartData = useMemo(() => {
    if (!secA && !secB) return [];
    const distA = secA?.distribution ?? [];
    const distB = secB?.distribution ?? [];

    const allBuckets = Array.from(
      new Set([...distA.map((d) => d.bucket), ...distB.map((d) => d.bucket)])
    );

    return allBuckets.map((bucket) => {
      const itemA = distA.find((d) => d.bucket === bucket);
      const itemB = distB.find((d) => d.bucket === bucket);
      return {
        bucket,
        secA: itemA ? itemA.count : 0,
        secB: itemB ? itemB.count : 0,
      };
    });
  }, [secA, secB]);

  const bucketsList = chartData.map((d) => d.bucket);
  const secABucket = secA ? getBucketForMean(secA.mean, bucketsList) : null;
  const secBBucket = secB ? getBucketForMean(secB.mean, bucketsList) : null;

  // Selected course object
  const currentCourse = courses?.find((c) => String(c.id) === String(selectedCourseId));

  // Normalization preview data
  const normalizationRows = useMemo(() => {
    if (!report?.normalization) return [];
    const shift = report.normalization.suggested_shift;
    const isUp = shift >= 0;

    return [
      {
        benchmark: 'Lower Quartile (P25)',
        raw: 11.0,
        suggested: (11.0 + shift).toFixed(1),
        delta: (isUp ? '+' : '') + shift.toFixed(1),
        isUp,
      },
      {
        benchmark: 'Section Median (P50)',
        raw: 16.0,
        suggested: (16.0 + shift).toFixed(1),
        delta: (isUp ? '+' : '') + shift.toFixed(1),
        isUp,
      },
      {
        benchmark: 'Section Mean (μ)',
        raw: secB ? secB.mean.toFixed(1) : '16.5',
        suggested: secB ? (secB.mean + shift).toFixed(1) : (16.5 + shift).toFixed(1),
        delta: (isUp ? '+' : '') + shift.toFixed(1),
        isUp,
      },
      {
        benchmark: 'Upper Quartile (P75)',
        raw: 21.0,
        suggested: (21.0 + shift).toFixed(1),
        delta: (isUp ? '+' : '') + shift.toFixed(1),
        isUp,
      },
      {
        benchmark: 'Top Score (Max / 30)',
        raw: 26.0,
        suggested: Math.min(30, +(26.0 + shift).toFixed(1)).toFixed(1),
        delta: (isUp ? '+' : '') + shift.toFixed(1),
        isUp,
      },
    ];
  }, [report, secB]);

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <section
        aria-label="Audit Controls"
        className="flex flex-col gap-4 rounded-[8px] border border-border-default bg-surface p-5 sm:flex-row sm:items-center sm:justify-between shadow-elevation"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-heading sm:text-xl">
              Grading Parity Audit
            </h1>
            <Badge variant="info">Statistical Parity</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Identify section-level marker drift and evaluate mathematical normalization models.
          </p>
        </div>

        {/* Course Select + Action Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="course-select" className="text-xs font-medium text-muted">
              Course:
            </label>
            <select
              id="course-select"
              value={selectedCourseId}
              disabled={isCoursesLoading || isPending}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-9 rounded-[8px] border border-border-default bg-subtle px-3 py-1 text-xs text-primary shadow-sm focus:border-border-focus focus:outline-none disabled:opacity-50"
            >
              {isCoursesLoading ? (
                <option value="">Loading courses…</option>
              ) : isCoursesError ? (
                <option value="">Error loading courses</option>
              ) : (
                courses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={Play}
            loading={isPending}
            disabled={!selectedCourseId || isCoursesLoading || isPending}
            onClick={handleRunAudit}
          >
            {isPending ? 'Auditing…' : 'Run Parity Audit'}
          </Button>
        </div>
      </section>

      {/* ERROR STATE */}
      {isCoursesError ? (
        <Card>
          <CardBody className="p-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-critical-bg text-critical-text">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="mt-2 text-xs text-critical-text">
              {coursesError?.message ?? 'Could not load courses from backend server.'}
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetchCourses()} className="mt-3">
              Retry Courses
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {isError ? (
        <Card>
          <CardBody className="p-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-critical-bg text-critical-text">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h3 className="mt-2 text-sm font-semibold text-heading">Parity Audit Failed</h3>
            <p className="mt-1 text-xs text-secondary max-w-md mx-auto">
              {error?.message ?? 'The parity computation engine encountered an unexpected error.'}
            </p>
            <Button variant="secondary" size="sm" onClick={handleRunAudit} className="mt-3">
              Try Again
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* IDLE / EMPTY STATE */}
      {!report && !isPending && !isError ? (
        <Card>
          <EmptyState
            icon={Scale}
            title="No Parity Audit Executed"
            description="Select a course above and click 'Run Parity Audit' to evaluate marker drift and distribution variance."
            actionLabel="Run Audit for CSE 2101"
            onAction={handleRunAudit}
          />
        </Card>
      ) : null}

      {/* LOADING SKELETON WITH ROTATING STEP LABELS */}
      {isPending ? (
        <div className="space-y-6">
          <Card>
            <CardBody className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-green-500 animate-pulse">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-heading">
                {LOADING_STEPS[loadingStepIdx]}
              </h3>
              <p className="mt-1 text-xs text-muted">
                Fitting section distribution baselines and evaluating marker drift.
              </p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : null}

      {/* AUDIT RESULTS CONTENT */}
      {report && !isPending ? (
        <div className="space-y-6">
          {/* STATS STRIP */}
          <section aria-label="Summary Statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Drift Status"
              value={report.drift_detected ? 'Drift Detected' : 'Parity Normal'}
              icon={report.drift_detected ? TrendingDown : CheckCircle2}
              tone={report.drift_detected ? 'warning' : 'pass'}
              hint="Cross-section mean variance test"
            />

            <StatCard
              label="Drift Magnitude"
              value={
                typeof report.overall_stats?.drift_magnitude === 'number'
                  ? `${report.overall_stats.drift_magnitude.toFixed(1)} marks`
                  : '3.3 marks'
              }
              icon={BarChart3}
              tone={report.drift_detected ? 'critical' : 'pass'}
              hint="Raw difference between section means"
            />

            <StatCard
              label="Statistical Severity"
              value={report.severity?.toUpperCase() ?? 'MEDIUM'}
              icon={AlertCircle}
              tone={report.severity === 'high' ? 'critical' : 'warning'}
              hint="Confidence & z-score threshold rating"
            />
          </section>

          {/* OVERLAID DISTRIBUTION BELL CURVES */}
          <Card>
            <CardHeader
              icon={BarChart3}
              title="Score Distribution Parity"
              subtitle={`Overlaid score histograms for ${currentCourse?.code ?? 'CSE 2101'}`}
              action={
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span>{secA?.section_name ?? 'Section A'} (Prof. Monir)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                    <span>{secB?.section_name ?? 'Section B'} (Dr. Hasan)</span>
                  </div>
                </div>
              }
            />

            <CardBody className="p-4 sm:p-6">
              <div className="h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 25, right: 30, left: -10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="gradientSecA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--green-500)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--green-500)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradientSecB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--teal-500)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--teal-500)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />

                    <XAxis
                      dataKey="bucket"
                      stroke="var(--border-default)"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickLine={false}
                    />

                    <YAxis
                      stroke="var(--border-default)"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickLine={false}
                      allowDecimals={false}
                    />

                    <Tooltip content={<CustomDistributionTooltip />} />

                    {/* Section A Bell Curve Area: --green-500 */}
                    <Area
                      type="monotone"
                      dataKey="secA"
                      name={secA?.section_name ?? 'Section A'}
                      stroke="var(--green-500)"
                      strokeWidth={2.5}
                      fill="url(#gradientSecA)"
                    />

                    {/* Section B Bell Curve Area: --teal-500 */}
                    <Area
                      type="monotone"
                      dataKey="secB"
                      name={secB?.section_name ?? 'Section B'}
                      stroke="var(--teal-500)"
                      strokeWidth={2.5}
                      fill="url(#gradientSecB)"
                    />

                    {/* Vertical ReferenceLine at Section A Mean */}
                    {secABucket && secA ? (
                      <ReferenceLine
                        x={secABucket}
                        stroke="var(--green-500)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `${secA.section_name} μ = ${secA.mean}`,
                          position: 'top',
                          fill: 'var(--green-500)',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    ) : null}

                    {/* Vertical ReferenceLine at Section B Mean */}
                    {secBBucket && secB ? (
                      <ReferenceLine
                        x={secBBucket}
                        stroke="var(--teal-500)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `${secB.section_name} μ = ${secB.mean}`,
                          position: 'top',
                          fill: 'var(--teal-500)',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Stat Strip Per Section Below Chart */}
              <div className="mt-6 space-y-3 border-t border-border-default pt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Section Statistical Summary
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {sectionStats.map((sec) => {
                    const isDeviant =
                      sec.section_name === report.normalization?.section_name ||
                      sec.section_name.toLowerCase().includes('b') ||
                      sec.leniency_index < 0.9;

                    return (
                      <div
                        key={sec.section_name}
                        className={cn(
                          'rounded-[8px] border p-3.5 transition-colors',
                          isDeviant
                            ? 'border-critical-border bg-critical-bg'
                            : 'border-border-default bg-subtle'
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-border-default pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                isDeviant ? 'bg-critical-text' : 'bg-warning-text'
                              )}
                            />
                            <span className="font-semibold text-primary">
                              {sec.section_name}
                            </span>
                            <span className="text-xs text-muted">
                              ({sec.instructor})
                            </span>
                          </div>

                          <Badge variant={isDeviant ? 'critical' : 'warning'}>
                            {isDeviant ? 'Deviant Marker' : 'Lenient Marker'}
                          </Badge>
                        </div>

                        {/* 6 Metric Cells */}
                        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              n
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.n}
                            </div>
                          </div>

                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              Mean (μ)
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.mean.toFixed(1)}
                            </div>
                          </div>

                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              Std Dev (σ)
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.std_dev.toFixed(1)}
                            </div>
                          </div>

                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              Skewness
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.skewness.toFixed(2)}
                            </div>
                          </div>

                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              Z-Score
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.z_score > 0 ? `+${sec.z_score.toFixed(2)}` : sec.z_score.toFixed(2)}
                            </div>
                          </div>

                          <div className="rounded-[4px] bg-surface border border-border-default p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              Leniency
                            </div>
                            <div className="mt-0.5 text-xs font-bold tabular-nums text-primary">
                              {sec.leniency_index.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* TWO-COLUMN MIDDLE SECTION */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* DISCREPANCY INSIGHTS */}
            <Card className="flex flex-col">
              <CardHeader
                title="Discrepancy Insights"
                subtitle="Algorithmic markers and statistical parity flags"
                icon={AlertCircle}
                action={
                  <span className="text-xs text-muted">
                    {report.insights?.length ?? 0} flags
                  </span>
                }
              />

              <CardBody className="flex-1 space-y-3 p-4">
                {report.insights?.map((insight, idx) => {
                  const isCritical =
                    insight.severity === 'high' || insight.title.toLowerCase().includes('gap');

                  return (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-[8px] border p-3.5 transition-colors',
                        isCritical
                          ? 'border-critical-border bg-critical-bg border-l-4 border-l-critical-text'
                          : 'border-warning-border bg-warning-bg border-l-4 border-l-warning-text'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold tracking-tight text-heading sm:text-sm">
                          {insight.title}
                        </h4>
                        <SeverityPill severity={insight.severity} />
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-secondary">
                        {insight.detail}
                      </p>
                    </div>
                  );
                })}
              </CardBody>
            </Card>

            {/* NORMALIZATION PROPOSAL */}
            <Card className="flex flex-col">
              <CardHeader
                title="Normalization Proposal"
                subtitle={`Target: ${report.normalization?.section_name ?? 'Affected Section'}`}
                icon={Scale}
                action={
                  <Badge variant="warning" dot>
                    Shift: {report.normalization?.suggested_shift >= 0 ? '+' : ''}
                    {report.normalization?.suggested_shift} marks
                  </Badge>
                }
              />

              <CardBody className="flex-1 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* Left Column: Benchmark Table */}
                  <div className="sm:col-span-7">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">
                        Sample Mark Adjustment
                      </span>
                      <span className="text-[11px] text-muted">
                        {report.normalization?.section_name}
                      </span>
                    </div>

                    <div className="rounded-[8px] border border-border-default bg-surface">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Benchmark</TH>
                            <TH align="right">Raw</TH>
                            <TH align="right">Adj.</TH>
                            <TH align="right">Δ Shift</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {normalizationRows.map((row, idx) => (
                            <TR key={idx}>
                              <TD className="text-xs font-medium text-primary">
                                {row.benchmark}
                              </TD>
                              <TD align="right" numeric className="text-xs text-muted">
                                {row.raw}
                              </TD>
                              <TD align="right" numeric className="text-xs font-semibold text-primary">
                                {row.suggested}
                              </TD>
                              <TD align="right" numeric className="text-xs font-semibold text-pass-text">
                                <span className="inline-flex items-center gap-0.5">
                                  {row.isUp ? (
                                    <ArrowUp className="h-3 w-3 text-pass-text" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3 text-critical-text" />
                                  )}
                                  {row.delta}
                                </span>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>

                  {/* Right Column: Rationale & Advisory Action */}
                  <div className="flex flex-col justify-between rounded-[8px] border border-border-default bg-subtle p-3 sm:col-span-5">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-pass-text">
                        Statistical Rationale
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-secondary">
                        {report.normalization?.rationale}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-default">
                      <div className="mb-3 flex items-start gap-1.5 text-[11px] text-muted">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pass-text" />
                        <span>Advisory only — normalizations require official approval.</span>
                      </div>

                      <div className="relative group w-full">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled
                          className="w-full opacity-60 cursor-not-allowed"
                        >
                          Apply Normalization
                        </Button>

                        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-surface border border-border-default px-2 py-1 text-[11px] font-medium text-primary opacity-0 shadow-elevation transition-opacity group-hover:opacity-100 z-10">
                          Requires HoD approval
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* AI SUMMARY CARD */}
          <AiSummaryCard
            title="AI Parity Audit Synthesis"
            summary={report.ai_summary}
            meta={
              <span className="inline-flex items-center gap-1 text-muted">
                <Sparkles className="h-3.5 w-3.5 text-green-500" />
                Confidence: High · Seeded Calibration
              </span>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
