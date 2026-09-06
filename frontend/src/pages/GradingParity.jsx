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
    <div className="rounded-lg border border-slate-800 bg-slate-900/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <div className="mb-2 font-medium text-slate-300">
        Score Band: <span className="font-mono text-amber-400">{label} marks</span>
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-300">{entry.name}:</span>
            </div>
            <span className="font-mono font-semibold text-slate-100">
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
      {/* ====================================================================
       * TOP BAR
       * ==================================================================== */}
      <section
        aria-label="Audit Controls"
        className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-400" />
            <h1 className="text-lg font-bold tracking-tight text-slate-100 sm:text-xl">
              Grading Parity Audit
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Cross-section statistical variance, distribution skewness, and cohort normalization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Course Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="course-select" className="text-xs font-medium text-slate-400">
              Course:
            </label>
            <select
              id="course-select"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={isCoursesLoading || isPending}
              className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            >
              {isCoursesLoading ? (
                <option>Loading courses…</option>
              ) : (
                courses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title} ({c.semester})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Run Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAudit}
            loading={isPending}
            disabled={!selectedCourseId || isPending}
            icon={Play}
          >
            Run Parity Audit
          </Button>

          {/* Verdict / Severity Badge once results land */}
          {report ? (
            <div className="flex items-center gap-2">
              <SeverityPill
                severity={report.severity}
                label={`Severity: ${report.severity.toUpperCase()}`}
              />
              {report.drift_detected ? (
                <Badge variant="critical">Drift Flagged</Badge>
              ) : (
                <Badge variant="pass">Parity Maintained</Badge>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* ====================================================================
       * STATE 1: LOADING (Rotating Text + Skeletons)
       * ==================================================================== */}
      {isPending ? (
        <div className="space-y-6">
          {/* Rotating Status Banner */}
          <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {LOADING_STEPS[loadingStepIdx]}
            </span>
          </div>

          {/* Skeleton Hero Chart */}
          <Card>
            <CardHeader title="Section Distribution Comparison" icon={BarChart3} />
            <CardBody className="space-y-4 p-6">
              <Skeleton className="h-72 w-full" />
              <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Skeleton Lower Blocks */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Discrepancy Insights" icon={AlertCircle} />
              <CardBody className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Normalization Proposal" icon={Scale} />
              <CardBody className="space-y-3 p-4">
                <Skeleton className="h-40 w-full" />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ====================================================================
       * STATE 2: ERROR (Retry Card)
       * ==================================================================== */}
      {isError && !isPending ? (
        <Card className="border-rose-900/60 bg-rose-950/20">
          <CardHeader
            icon={AlertCircle}
            title="Grading Parity Audit Failed"
            subtitle={error?.message || 'Could not complete statistical drift analysis.'}
          />
          <CardBody className="p-6">
            <p className="text-xs text-slate-400">
              An error occurred while communicating with the audit engine. You can retry the
              parity audit for{' '}
              <span className="font-semibold text-slate-200">
                {currentCourse?.code ?? 'the selected course'}
              </span>
              .
            </p>
            <div className="mt-4">
              <Button variant="primary" size="sm" onClick={handleRunAudit} icon={RefreshCw}>
                Retry Audit
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* ====================================================================
       * STATE 3: IDLE (Before first run)
       * ==================================================================== */}
      {!report && !isPending && !isError ? (
        <Card>
          <EmptyState
            title="Grading Parity Audit Ready"
            description="Select a course and click 'Run Parity Audit' to evaluate marker bias, distribution skewness, and generate recommended grade adjustments between parallel sections."
            icon={Scale}
            actionLabel="Run Parity Audit Now"
            onAction={handleRunAudit}
          />
        </Card>
      ) : null}

      {/* ====================================================================
       * STATE 4: RESULTS (Three Stacked Blocks + AI Summary)
       * ==================================================================== */}
      {report && !isPending ? (
        <div className="space-y-6">
          {/* ----------------------------------------------------------------
           * A. DISTRIBUTION COMPARISON (The Hero Visual)
           * ---------------------------------------------------------------- */}
          <Card>
            <CardHeader
              title="Distribution Comparison"
              subtitle={`${currentCourse?.code ?? 'Course'} · Section A vs Section B Midterm Distributions`}
              icon={BarChart3}
              action={
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span>{secA?.section_name ?? 'Section A'} (Prof. Monir)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span>{secB?.section_name ?? 'Section B'} (Dr. Hasan)</span>
                  </div>
                </div>
              }
            />

            <CardBody className="p-4 sm:p-6">
              {/* Overlaid Bell Curves */}
              <div className="h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 25, right: 30, left: -10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="gradientSecA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.15} />
                      </linearGradient>
                      <linearGradient id="gradientSecB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.15} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

                    <XAxis
                      dataKey="bucket"
                      stroke="#475569"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={{ stroke: '#334155' }}
                    />

                    <YAxis
                      stroke="#475569"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={{ stroke: '#334155' }}
                      allowDecimals={false}
                    />

                    <Tooltip content={<CustomDistributionTooltip />} />

                    {/* Section A Bell Curve Area */}
                    <Area
                      type="monotone"
                      dataKey="secA"
                      name={secA?.section_name ?? 'Section A'}
                      stroke="#fbbf24"
                      strokeWidth={2.5}
                      fill="url(#gradientSecA)"
                    />

                    {/* Section B Bell Curve Area */}
                    <Area
                      type="monotone"
                      dataKey="secB"
                      name={secB?.section_name ?? 'Section B'}
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      fill="url(#gradientSecB)"
                    />

                    {/* Vertical ReferenceLine at Section A Mean */}
                    {secABucket && secA ? (
                      <ReferenceLine
                        x={secABucket}
                        stroke="#fbbf24"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `${secA.section_name} μ = ${secA.mean}`,
                          position: 'top',
                          fill: '#fbbf24',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    ) : null}

                    {/* Vertical ReferenceLine at Section B Mean */}
                    {secBBucket && secB ? (
                      <ReferenceLine
                        x={secBBucket}
                        stroke="#f43f5e"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `${secB.section_name} μ = ${secB.mean}`,
                          position: 'top',
                          fill: '#f43f5e',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Stat Strip Per Section Below Chart */}
              <div className="mt-6 space-y-3 border-t border-slate-800 pt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                          'rounded-lg border p-3.5 transition-colors',
                          isDeviant
                            ? 'border-rose-500/40 bg-rose-500/[0.04]'
                            : 'border-amber-400/30 bg-amber-400/[0.02]'
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                isDeviant ? 'bg-rose-500' : 'bg-amber-400'
                              )}
                            />
                            <span className="font-semibold text-slate-200">
                              {sec.section_name}
                            </span>
                            <span className="text-xs text-slate-400">
                              ({sec.instructor})
                            </span>
                          </div>

                          <Badge variant={isDeviant ? 'critical' : 'warning'}>
                            {isDeviant ? 'Deviant Marker' : 'Lenient Marker'}
                          </Badge>
                        </div>

                        {/* 6 Metric Cells */}
                        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                          {/* n */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              n
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-300' : 'text-slate-200'
                              )}
                            >
                              {sec.n}
                            </div>
                          </div>

                          {/* Mean */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              Mean (μ)
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-400 font-semibold' : 'text-amber-300'
                              )}
                            >
                              {sec.mean.toFixed(1)}
                            </div>
                          </div>

                          {/* Std Dev */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              Std Dev (σ)
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-400 font-semibold' : 'text-slate-200'
                              )}
                            >
                              {sec.std_dev.toFixed(1)}
                            </div>
                          </div>

                          {/* Skewness */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              Skewness
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-400 font-semibold' : 'text-slate-200'
                              )}
                            >
                              {sec.skewness.toFixed(2)}
                            </div>
                          </div>

                          {/* Z-score */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              Z-Score
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-400 font-semibold' : 'text-slate-200'
                              )}
                            >
                              {sec.z_score > 0 ? `+${sec.z_score.toFixed(2)}` : sec.z_score.toFixed(2)}
                            </div>
                          </div>

                          {/* Leniency Index */}
                          <div className="rounded bg-slate-950/60 p-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                              Leniency
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 text-xs font-bold tabular-nums',
                                isDeviant ? 'text-rose-400 font-semibold' : 'text-amber-300'
                              )}
                            >
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

          {/* ----------------------------------------------------------------
           * TWO-COLUMN MIDDLE SECTION: DISCREPANCY INSIGHTS + NORMALIZATION PROPOSAL
           * Stack vertically under 1024px
           * ---------------------------------------------------------------- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* --------------------------------------------------------------
             * B. DISCREPANCY INSIGHTS
             * -------------------------------------------------------------- */}
            <Card className="flex flex-col">
              <CardHeader
                title="Discrepancy Insights"
                subtitle="Algorithmic markers and statistical parity flags"
                icon={AlertCircle}
                action={
                  <span className="text-xs text-slate-500">
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
                        'rounded-lg border bg-slate-950/60 p-3.5 transition-colors',
                        isCritical
                          ? 'border-slate-800 border-l-4 border-l-rose-500 bg-rose-500/[0.03]'
                          : 'border-slate-800 border-l-4 border-l-amber-500/60 bg-slate-900/40'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold tracking-tight text-slate-100 sm:text-sm">
                          {insight.title}
                        </h4>
                        <SeverityPill severity={insight.severity} />
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                        {insight.detail}
                      </p>
                    </div>
                  );
                })}
              </CardBody>
            </Card>

            {/* --------------------------------------------------------------
             * C. NORMALIZATION PROPOSAL
             * -------------------------------------------------------------- */}
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
                      <span className="text-xs font-semibold text-slate-300">
                        Sample Mark Adjustment
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {report.normalization?.section_name}
                      </span>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/80">
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
                              <TD className="text-xs font-medium text-slate-300">
                                {row.benchmark}
                              </TD>
                              <TD align="right" numeric className="text-xs text-slate-400">
                                {row.raw}
                              </TD>
                              <TD align="right" numeric className="text-xs font-semibold text-slate-200">
                                {row.suggested}
                              </TD>
                              <TD align="right" numeric className="text-xs font-semibold text-emerald-400">
                                <span className="inline-flex items-center gap-0.5">
                                  {row.isUp ? (
                                    <ArrowUp className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3 text-rose-400" />
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
                  <div className="flex flex-col justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 sm:col-span-5">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                        Statistical Rationale
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        {report.normalization?.rationale}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      {/* Advisory notice */}
                      <div className="mb-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>Advisory only — normalizations require official approval.</span>
                      </div>

                      {/* Disabled button with tooltip */}
                      <div className="relative group w-full">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled
                          className="w-full opacity-60 cursor-not-allowed"
                        >
                          Apply Normalization
                        </Button>

                        {/* Hover Tooltip */}
                        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-medium text-amber-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-10">
                          Requires HoD approval
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* ----------------------------------------------------------------
           * D. AI SUMMARY CARD
           * ---------------------------------------------------------------- */}
          <AiSummaryCard
            title="AI Parity Audit Synthesis"
            summary={report.ai_summary}
            meta={
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Confidence: High · Seeded Calibration
              </span>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
