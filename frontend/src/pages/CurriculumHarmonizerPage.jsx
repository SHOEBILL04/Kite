import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  GitCompare,
  Layers,
  ListChecks,
  Play,
  RotateCw,
  ScanSearch,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { BLOOM_LEVELS, ENDPOINTS } from '../api/contract.js';
import { post } from '../api/client.js';
import { cn } from '../lib/cn.js';
import { ratioPct } from '../lib/format.js';
import { annotateSyllabus, scoreBand } from '../lib/syllabus.js';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
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
  SpinnerBlock,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '../components/ui/index.js';

/* ==========================================================================
 * Constants
 * ======================================================================= */

const BANDS = {
  critical: {
    hex: 'var(--critical-border)',
    text: 'text-critical-text',
    badge: 'critical',
    label: 'Severely misaligned',
    clause: 'The pair needs redesign before the next offering',
  },
  warning: {
    hex: 'var(--warning-border)',
    text: 'text-warning-text',
    badge: 'warning',
    label: 'Partially aligned',
    clause: 'Redundant teaching and prerequisite gaps both present',
  },
  pass: {
    hex: 'var(--pass-border)',
    text: 'text-pass-text',
    badge: 'pass',
    label: 'Well aligned',
    clause: 'Only minor overlap between the two syllabi',
  },
  unknown: {
    hex: 'var(--text-muted)',
    text: 'text-text-muted',
    badge: 'neutral',
    label: 'Not scored',
    clause: 'The audit returned no alignment score',
  },
};

const DIFF_TONES = {
  redundant: {
    base: 'border-warning-border bg-warning-fill',
    active: 'border-warning-border bg-warning-fill ring-1 ring-warning-border',
    label: 'text-warning-text',
  },
  missing: {
    base: 'border-critical-border bg-critical-fill',
    active: 'border-critical-border bg-critical-fill ring-1 ring-critical-border',
    label: 'text-critical-text',
  },
  aligned: {
    base: 'border-transparent',
    active: 'border-transparent bg-bg-hover',
    label: 'text-text-muted',
  },
};

const TABS = [
  { id: 'redundant', label: 'Redundant Topics' },
  { id: 'missing', label: 'Missing Prerequisites' },
  { id: 'bloom', label: 'Bloom Coverage' },
];

/* ==========================================================================
 * 1. Alignment score
 * ======================================================================= */

function ScoreRing({ score, band }) {
  const radius = 58;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const size = (radius + stroke) * 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-36 w-36 shrink-0 -rotate-90"
      role="img"
      aria-label={`Alignment score ${clamped} out of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--bg-subtle)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={BANDS[band].hex}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <text
        x={size / 2}
        y={size / 2}
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-text-heading text-[30px] font-semibold tabular-nums"
      >
        {clamped}
      </text>
    </svg>
  );
}

function AlignmentHeader({ report, courseA, courseB }) {
  const band = scoreBand(report.alignment_score);
  const tone = BANDS[band];
  const redundant = report.redundant_topics?.length ?? 0;
  const missing = report.missing_prerequisites?.length ?? 0;

  return (
    <Card>
      <CardHeader
        icon={ScanSearch}
        title="Alignment score"
        subtitle={`${courseA?.code ?? 'Course A'} → ${courseB?.code ?? 'Course B'}`}
        action={<Badge variant={tone.badge} dot>{tone.label}</Badge>}
      />
      <CardBody className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <ScoreRing score={report.alignment_score} band={band} />

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', tone.text)}>
            {tone.clause}: {redundant} redundant topic {redundant === 1 ? 'block' : 'blocks'} and{' '}
            {missing} unmet {missing === 1 ? 'prerequisite' : 'prerequisites'} across the pair.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-text-muted">Redundant</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-warning-text">{redundant}</dd>
            </div>
            <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-text-muted">Missing prereqs</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-critical-text">{missing}</dd>
            </div>
            <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-text-muted">Changes proposed</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text-heading">
                {report.actionable_changes?.length ?? 0}
              </dd>
            </div>
          </dl>
        </div>
      </CardBody>
    </Card>
  );
}

/* ==========================================================================
 * 2. Dual-column syllabus diff
 * ======================================================================= */

function DiffLegend() {
  const items = [
    { tone: 'bg-warning-border', label: 'Redundant overlap' },
    { tone: 'bg-critical-border', label: 'Missing dependency' },
    { tone: 'bg-border-default', label: 'Aligned' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className={cn('h-2.5 w-1 rounded-sm', item.tone)} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function DiffRow({ row, flag, isActive, onActivate }) {
  if (row.kind === 'heading') {
    return (
      <li className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-text-muted first:pt-2">
        {row.text}
      </li>
    );
  }

  if (row.kind === 'prose') {
    return <li className="px-3 py-1 text-[11px] leading-relaxed text-text-muted">{row.text}</li>;
  }

  const kind = flag?.kind ?? 'aligned';
  const tone = DIFF_TONES[kind];

  return (
    <li
      onMouseEnter={() => onActivate(flag?.matchKey ?? null)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(flag?.matchKey ?? null)}
      onBlur={() => onActivate(null)}
      tabIndex={flag ? 0 : -1}
      className={cn(
        'focus-ring mx-2 my-0.5 rounded-r border-l-2 px-2.5 py-1.5 transition-colors',
        isActive ? tone.active : tone.base,
        !flag && 'hover:bg-bg-hover'
      )}
    >
      <div className="flex items-start gap-2">
        {kind === 'missing' ? (
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical-text"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
        <div className="min-w-0">
          {row.label ? (
            <span className={cn('mr-1.5 text-[11px] font-medium uppercase tracking-wide', tone.label)}>
              {row.label}
            </span>
          ) : null}
          <span className="text-[13px] leading-relaxed text-text-primary">{row.text}</span>
          {flag ? (
            <p className={cn('mt-1 text-[11px] leading-snug', tone.label)}>{flag.detail}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SyllabusPanel({ course, annotated, activeKey, onActivate, className, scrollClassName }) {
  const counts = Object.values(annotated.flags);
  const redundant = counts.filter((flag) => flag.kind === 'redundant').length;
  const missing = counts.filter((flag) => flag.kind === 'missing').length;

  return (
    <div className={cn('min-w-0 rounded-lg border border-border-default bg-bg-surface', className)}>
      <div className={cn('overflow-y-auto', scrollClassName)}>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-default bg-bg-surface px-3 py-2 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight text-text-heading">
              {course?.code ?? '—'}
            </div>
            <div className="truncate text-[11px] text-text-muted">
              {annotated.title ?? course?.title ?? 'Syllabus'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {redundant ? <Badge variant="warning">{redundant} overlap</Badge> : null}
            {missing ? <Badge variant="critical">{missing} gap</Badge> : null}
          </div>
        </header>

        {annotated.rows.length ? (
          <ul className="py-1.5">
            {annotated.rows.map((row) => {
              const flag = annotated.flags[row.id];
              return (
                <DiffRow
                  key={row.id}
                  row={row}
                  flag={flag}
                  isActive={Boolean(flag && activeKey === flag.matchKey)}
                  onActivate={onActivate}
                />
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Layers}
            title="No syllabus text"
            description={`The API returned no syllabus_markdown for ${
              course?.code ?? 'this course'
            }. The findings below still apply — only the line-by-line diff is unavailable.`}
          />
        )}
      </div>
    </div>
  );
}

function AccordionPanel({ course, annotated, activeKey, onActivate, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const counts = Object.values(annotated.flags).length;

  return (
    <div className="rounded-lg border border-border-default">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-text-heading">
            {course?.code ?? '—'}
          </span>
          <span className="block truncate text-[11px] text-text-muted">
            {annotated.title ?? course?.title ?? 'Syllabus'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {counts ? <Badge variant="warning">{counts} flagged</Badge> : null}
          <ChevronDown
            className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <SyllabusPanel
          course={course}
          annotated={annotated}
          activeKey={activeKey}
          onActivate={onActivate}
          className="rounded-none border-0 border-t border-border-default"
          scrollClassName="max-h-[26rem]"
        />
      ) : null}
    </div>
  );
}

function SyllabusDiff({ report, courseA, courseB }) {
  const [activeKey, setActiveKey] = useState(null);
  const isWide = useMediaQuery('(min-width: 1024px)');

  const left = useMemo(
    () => annotateSyllabus(courseA?.syllabus_markdown, courseA?.code, 'a', report),
    [courseA, report]
  );
  const right = useMemo(
    () => annotateSyllabus(courseB?.syllabus_markdown, courseB?.code, 'b', report),
    [courseB, report]
  );

  return (
    <Card>
      <CardHeader
        icon={GitCompare}
        title="Syllabus diff"
        subtitle="Hover a flagged topic to highlight its counterpart in the other syllabus."
        action={<DiffLegend />}
      />
      <CardBody>
        {isWide ? (
          <div className="grid grid-cols-2 gap-4">
            <SyllabusPanel
              course={courseA}
              annotated={left}
              activeKey={activeKey}
              onActivate={setActiveKey}
              scrollClassName="max-h-[34rem]"
            />
            <SyllabusPanel
              course={courseB}
              annotated={right}
              activeKey={activeKey}
              onActivate={setActiveKey}
              scrollClassName="max-h-[34rem]"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <AccordionPanel
              course={courseA}
              annotated={left}
              activeKey={activeKey}
              onActivate={setActiveKey}
              defaultOpen
            />
            <AccordionPanel
              course={courseB}
              annotated={right}
              activeKey={activeKey}
              onActivate={setActiveKey}
              defaultOpen={false}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ==========================================================================
 * 3. Findings tabs
 * ======================================================================= */

function SimilarityBar({ value }) {
  const width = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="w-24 overflow-hidden rounded-sm bg-bg-subtle border border-border-default" aria-hidden="true">
        <span className="block h-1.5 rounded-sm bg-warning-border" style={{ width: `${width}%` }} />
      </span>
      <span className="w-11 text-right tabular-nums text-text-primary">{ratioPct(value, 0)}</span>
    </div>
  );
}

function RedundantTopicsTable({ topics, courseA, courseB }) {
  const sorted = useMemo(
    () => [...(topics ?? [])].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)),
    [topics]
  );

  if (!sorted.length) {
    return (
      <EmptyState
        icon={Layers}
        title="No redundant topics"
        description="Nothing in the prerequisite course is taught again in the target course."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Topic</TH>
          <TH>In {courseA?.code ?? 'Course A'}</TH>
          <TH>In {courseB?.code ?? 'Course B'}</TH>
          <TH align="right">Similarity</TH>
        </TR>
      </THead>
      <TBody>
        {sorted.map((topic) => (
          <TR key={`${topic.topic}-${topic.course_a_ref}`}>
            <TD className="text-text-primary">{topic.topic}</TD>
            <TD className="whitespace-nowrap text-text-secondary">{topic.course_a_ref}</TD>
            <TD className="whitespace-nowrap text-text-secondary">{topic.course_b_ref}</TD>
            <TD align="right">
              <SimilarityBar value={topic.similarity} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function MissingPrerequisiteCards({ prerequisites }) {
  if (!prerequisites?.length) {
    return (
      <EmptyState
        icon={Check}
        title="No missing prerequisites"
        description="Every concept the target course assumes is introduced earlier in the pair."
      />
    );
  }

  return (
    <div className="grid gap-3 p-4 md:grid-cols-2">
      {prerequisites.map((prerequisite) => (
        <article
          key={prerequisite.concept}
          className="rounded-lg border border-critical-border bg-critical-fill p-3"
        >
          <header className="flex items-start justify-between gap-3">
            <h3 className="flex min-w-0 items-start gap-2 text-[13px] font-semibold tracking-tight text-text-heading">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical-text"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="min-w-0">{prerequisite.concept}</span>
            </h3>
            <SeverityPill severity={prerequisite.severity} />
          </header>

          <dl className="mt-3 space-y-1.5 text-[12px]">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-text-muted">Assumed in</dt>
              <dd className="min-w-0 text-text-secondary">{prerequisite.assumed_in}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-text-muted">Never introduced in</dt>
              <dd className="min-w-0 text-text-secondary">{prerequisite.never_introduced_in}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function BloomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-[12px] shadow-lg">
      <div className="font-medium text-text-heading">{label}</div>
      <div className="tabular-nums text-text-muted">
        {count} {count === 1 ? 'topic' : 'topics'}
        {count === 0 ? ' — no coverage' : ''}
      </div>
    </div>
  );
}

function BloomCoverage({ coverage, courseB }) {
  const data = useMemo(
    () => BLOOM_LEVELS.map((level) => ({ level, count: coverage?.[level] ?? 0 })),
    [coverage]
  );
  const uncovered = data.filter((entry) => entry.count === 0);

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-text-muted">
        Topic counts per Bloom level for {courseB?.code ?? 'the target course'}. The backend reports{' '}
        <code className="rounded bg-bg-subtle px-1 py-0.5 text-[11px] text-text-secondary border border-border-default">
          bloom_coverage
        </code>{' '}
        across the audited pair, so a level counted here may be taught in either syllabus.
      </p>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="level"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border-default)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: 'var(--bg-subtle)' }} content={<BloomChartTooltip />} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} minPointSize={3} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.level} fill={entry.count === 0 ? 'var(--warning-border)' : 'var(--action-primary)'} />
              ))}
              <LabelList dataKey="count" position="top" fill="var(--text-secondary)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {uncovered.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-fill px-3 py-2">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[12px] leading-relaxed text-warning-text">
            No coverage at {uncovered.map((entry) => entry.level).join(', ')}. Assessment at{' '}
            {uncovered.length === 1 ? 'this level' : 'these levels'} is absent from the pair — add at
            least one task there before the syllabus is signed off.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-text-muted">
          All six Bloom levels carry at least one topic.
        </p>
      )}
    </div>
  );
}

function FindingsTabs({ report, courseA, courseB }) {
  const [tab, setTab] = useState('redundant');

  const counts = {
    redundant: report.redundant_topics?.length ?? 0,
    missing: report.missing_prerequisites?.length ?? 0,
    bloom: null,
  };

  return (
    <Card>
      <CardHeader icon={ListChecks} title="Findings" subtitle="Every anomaly the audit raised, by kind." />

      <div className="flex gap-1 border-b border-border-default px-2" role="tablist" aria-label="Findings">
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(item.id)}
              className={cn(
                'focus-ring -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                selected
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              {item.label}
              {counts[item.id] !== null ? (
                <span className="tabular-nums text-[11px] text-text-muted">{counts[item.id]}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === 'redundant' ? (
          <RedundantTopicsTable
            topics={report.redundant_topics}
            courseA={courseA}
            courseB={courseB}
          />
        ) : null}
        {tab === 'missing' ? (
          <MissingPrerequisiteCards prerequisites={report.missing_prerequisites} />
        ) : null}
        {tab === 'bloom' ? (
          <BloomCoverage coverage={report.bloom_coverage} courseB={courseB} />
        ) : null}
      </div>
    </Card>
  );
}

/* ==========================================================================
 * 4. Actionable changes
 * ======================================================================= */

function ActionableChanges({ changes }) {
  const [done, setDone] = useState(() => new Set());
  const { copiedKey, copy } = useCopyToClipboard();

  if (!changes?.length) {
    return null;
  }

  const toggle = (index) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <Card>
      <CardHeader
        icon={ListChecks}
        title="Actionable changes"
        subtitle="Copy a line straight into the curriculum committee notes."
        action={
          <span className="text-[11px] tabular-nums text-text-muted">
            {done.size}/{changes.length} done
          </span>
        }
      />
      <ol className="divide-y divide-border-default">
        {changes.map((change, index) => {
          const checked = done.has(index);
          return (
            <li key={change} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(index)}
                className={cn(
                  'focus-ring mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-semibold tabular-nums transition-colors',
                  checked
                    ? 'border-pass-border bg-pass-fill text-pass-text'
                    : 'border-border-default bg-bg-surface text-text-muted hover:border-border-strong'
                )}
              >
                {checked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : index + 1}
              </button>

              <p
                className={cn(
                  'min-w-0 flex-1 text-[13px] leading-relaxed',
                  checked ? 'text-text-muted line-through' : 'text-text-primary'
                )}
              >
                {change}
              </p>

              <Button
                variant="ghost"
                size="sm"
                icon={copiedKey === index ? Check : Copy}
                onClick={() => copy(change, index)}
                aria-label={`Copy change ${index + 1}`}
                className="shrink-0"
              >
                {copiedKey === index ? 'Copied' : 'Copy'}
              </Button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ==========================================================================
 * States
 * ======================================================================= */

function LoadingResults() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={ScanSearch} title="Alignment score" subtitle="Comparing syllabi…" />
        <CardBody className="flex items-center gap-6">
          <Skeleton className="h-36 w-36 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
            <div className="grid grid-cols-3 gap-3 pt-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={GitCompare} title="Syllabus diff" />
        <CardBody>
          <SpinnerBlock label="Harmonizing syllabi" />
        </CardBody>
      </Card>
    </div>
  );
}

/* ==========================================================================
 * Single Curriculum Catalog Match & Cross-Audit View
 * ======================================================================= */

const SAMPLE_PRESETS = [
  {
    id: 'ml',
    name: 'CSE 3105 Machine Learning (Proposed)',
    file: '/samples/curriculum_proposed_cse3105_machine_learning.md',
    code: 'CSE 3105',
    title: 'Machine Learning & Data Analytics',
  },
  {
    id: 'algo',
    name: 'CSE 2103 Algorithms',
    file: '/samples/curriculum_cse2103_algorithms.md',
    code: 'CSE 2103',
    title: 'Algorithms',
  },
  {
    id: 'ds',
    name: 'CSE 2101 Data Structures',
    file: '/samples/curriculum_cse2101_data_structures.md',
    code: 'CSE 2101',
    title: 'Data Structures',
  },
  {
    id: 'dbms',
    name: 'CSE 3101 Database Systems',
    file: '/samples/curriculum_cse3101_database_systems.md',
    code: 'CSE 3101',
    title: 'Database Management Systems',
  },
  {
    id: 'ai',
    name: 'CSE 4103 Artificial Intelligence',
    file: '/samples/curriculum_cse4103_artificial_intelligence.md',
    code: 'CSE 4103',
    title: 'Artificial Intelligence',
  },
];

const INITIAL_MARKDOWN = `# CSE 3105: Machine Learning & Data Analytics

- **Week 1:** Introduction to machine learning paradigms, supervised vs unsupervised learning, and asymptotic complexity review.
- **Week 2:** Linear Regression: Gradient descent optimization, loss functions, and matrix formulations.
- **Week 3:** Logistic Regression: Sigmoid activation, cross-entropy loss, binary classification, and decision boundaries.
- **Week 4:** Decision Trees: Information gain, Entropy, Gini impurity, tree pruning, and recursive decision nodes.
- **Week 5:** Support Vector Machines (SVM): Hyperplanes, margin maximization, kernel trick, and convex optimization.
- **Week 6:** Clustering: K-Means clustering algorithm, hierarchical clustering, centroid updates, and distance metrics.
- **Week 7:** Principal Component Analysis (PCA): Dimensionality reduction, variance maximization, eigenvectors, and eigenvalues.
- **Week 8:** Neural Networks I: Perceptrons, multi-layer feedforward networks, backpropagation, and chain rule derivatives.
- **Week 9:** Neural Networks II: Convolutional Neural Networks (CNNs), pooling layers, feature maps, and image classification.
- **Week 10:** Natural Language Processing: Tokenization, Word Embeddings (Word2Vec), Recurrent Neural Networks (RNNs), and Attention.
- **Week 11:** Model Evaluation & Hyperparameter Tuning: Cross-validation, Bias-Variance tradeoff, Precision, Recall, F1-Score, and ROC-AUC.
- **Week 12:** Ethics & Governance in AI: Algorithmic bias, fairness metrics, model explainability (SHAP/LIME), and deployment pipelines.`;

function NewCourseCrossAuditView() {
  const fileInputRef = useRef(null);
  const [code, setCode] = useState('CSE 3105');
  const [title, setTitle] = useState('Machine Learning & Data Analytics');
  const [syllabusMarkdown, setSyllabusMarkdown] = useState(INITIAL_MARKDOWN);
  const [loadError, setLoadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [activePresetId, setActivePresetId] = useState('ml');

  const crossAuditMutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.auditSyllabusCrossAudit, payload),
  });

  const report = crossAuditMutation.data;
  const isFetching = crossAuditMutation.isPending || uploading;

  // Auto-run cross-audit on mount so the user immediately sees the report
  useEffect(() => {
    if (!crossAuditMutation.data && !crossAuditMutation.isPending && syllabusMarkdown.trim()) {
      crossAuditMutation.mutate({
        syllabus_markdown: syllabusMarkdown,
        code,
        title,
      });
    }
  }, []);

  const processFile = (file) => {
    if (!file) return;
    setLoadError(null);
    setActivePresetId(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;
      setSyllabusMarkdown(content);

      // Inforce and extract course code / title from markdown heading if present
      const titleMatch = content.match(/^#\s*([A-Z]{2,4}\s*\d{3,4})?\s*[:\-–—]?\s*([^\n\r]+)/m);
      let inferredCode = file.name.replace(/^curriculum_/i, '').replace(/\.[^/.]+$/, '').replace(/_/g, ' ').toUpperCase();
      let inferredTitle = inferredCode;

      if (titleMatch) {
        if (titleMatch[1]) inferredCode = titleMatch[1].trim();
        if (titleMatch[2]) inferredTitle = titleMatch[2].replace(/\*\*/g, '').trim();
      }

      setCode(inferredCode);
      setTitle(inferredTitle);

      crossAuditMutation.mutate({
        syllabus_markdown: content,
        code: inferredCode,
        title: inferredTitle,
      });
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const loadPreset = async (preset) => {
    setLoadError(null);
    setUploading(true);
    setActivePresetId(preset.id);
    try {
      const res = await fetch(preset.file);
      if (!res.ok) throw new Error(`Could not load preset ${preset.name}.`);
      const text = await res.text();
      setSyllabusMarkdown(text);
      setCode(preset.code);
      setTitle(preset.title);
      crossAuditMutation.mutate({
        syllabus_markdown: text,
        code: preset.code,
        title: preset.title,
      });
    } catch (err) {
      setLoadError(err.message ?? 'Failed to load sample curriculum.');
    } finally {
      setUploading(false);
    }
  };

  const runCrossAudit = () => {
    if (!syllabusMarkdown.trim()) return;
    crossAuditMutation.mutate({
      syllabus_markdown: syllabusMarkdown,
      code,
      title,
    });
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".md,.txt"
        className="hidden"
      />

      {/* --- Upload & Control Hub --- */}
      <Card className="border-border-strong shadow-sm">
        <CardHeader
          icon={Layers}
          title="Single Curriculum Match & Catalog Cross-Audit"
          subtitle="Upload the file of one curriculum to match it against all available courses in the catalog. The engine scans the department catalog, calculates content similarity scores, identifies the most similar course, and highlights novel topics."
        />
        <CardBody className="space-y-4">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all',
              isDragOver
                ? 'border-action-primary bg-forest-50/60 dark:bg-forest-950/20 scale-[1.005]'
                : 'border-border-strong bg-bg-surface hover:border-action-primary hover:bg-bg-subtle'
            )}
          >
            <div className="h-12 w-12 rounded-full bg-forest-100 dark:bg-forest-900/40 text-action-primary flex items-center justify-center mb-3 shadow-sm">
              <Upload className="h-6 w-6" />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold text-text-primary">
                Click to upload or drag & drop curriculum file (.md / .txt)
              </span>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                Upload any syllabus markdown file. It will immediately cross-reference every course in the catalog and output the similarity report.
              </p>
            </div>
            {code && (
              <div className="mt-3 flex items-center gap-2 px-3 py-1 rounded-full bg-forest-50 dark:bg-forest-950/40 border border-forest-200 dark:border-forest-800 text-[11px] text-forest-800 dark:text-forest-200">
                <Check className="h-3 w-3 text-action-primary" />
                <span>Currently Loaded: <strong>{code}</strong> — {title || 'Curriculum'}</span>
              </div>
            )}
          </div>

          {/* Quick Presets Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-action-primary" /> Or test with sample departmental curriculums:
              </span>
              <button
                type="button"
                onClick={() => setShowEditor((prev) => !prev)}
                className="text-[11px] font-medium text-action-primary hover:underline flex items-center gap-1"
              >
                <FileText className="h-3 w-3" />
                {showEditor ? 'Hide Curriculum Editor' : 'View / Edit Syllabus Markdown'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadPreset(preset)}
                  disabled={uploading}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    activePresetId === preset.id
                      ? 'border-action-primary bg-forest-50 text-forest-900 font-semibold dark:bg-forest-900/30 dark:text-forest-200 ring-1 ring-action-primary'
                      : 'border-border-default bg-bg-surface text-text-secondary hover:border-border-strong hover:bg-bg-subtle'
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Collapsible Editor (if user wants to customize) */}
          {showEditor && (
            <div className="pt-3 border-t border-border-default space-y-3 bg-bg-subtle/50 p-3 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted mb-1">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. CSE 3105"
                    className="w-full h-9 rounded-lg border border-border-default bg-bg-surface px-3 text-xs text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted mb-1">
                    Course Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Machine Learning & Data Analytics"
                    className="w-full h-9 rounded-lg border border-border-default bg-bg-surface px-3 text-xs text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Syllabus Markdown Content
                  </label>
                  <a
                    href="/samples/curriculum_proposed_cse3105_machine_learning.md"
                    download="syllabus_template.md"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> Download Template
                  </a>
                </div>
                <textarea
                  rows={6}
                  value={syllabusMarkdown}
                  onChange={(e) => setSyllabusMarkdown(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-bg-surface p-3 font-mono text-xs text-text-primary focus:border-border-focus focus:outline-none"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  icon={Play}
                  loading={isFetching}
                  disabled={!syllabusMarkdown.trim() || isFetching}
                  onClick={runCrossAudit}
                >
                  Re-run Similarity Match
                </Button>
              </div>
            </div>
          )}

          {loadError ? <p className="text-[11px] text-critical-text">{loadError}</p> : null}
        </CardBody>
      </Card>

      {/* --- Cross Audit Results Section --- */}
      {isFetching && !report ? (
        <LoadingResults />
      ) : crossAuditMutation.isError ? (
        <Card>
          <EmptyState
            tone="critical"
            icon={AlertTriangle}
            title="Catalog cross-audit failed"
            description={crossAuditMutation.error?.message ?? 'The request did not complete.'}
            actionLabel="Try again"
            onAction={runCrossAudit}
          />
        </Card>
      ) : !report ? (
        <Card>
          <EmptyState
            icon={ScanSearch}
            title="No cross-audit report generated yet"
            description="Upload a curriculum file above to evaluate overlap and similarities against all existing department courses."
            actionLabel="Run with Sample (CSE 3105 ML)"
            onAction={() => loadPreset(SAMPLE_PRESETS[0])}
          />
        </Card>
      ) : (
        <>
          {/* =================================================================
           * HERO CARD: MOST SIMILAR COURSE IN CATALOG
           * ================================================================= */}
          {report.most_matched_course ? (
            <Card className="border-2 border-forest-500/60 dark:border-forest-600/60 bg-bg-surface overflow-hidden shadow-md">
              <div className="bg-forest-50 dark:bg-forest-950/50 border-b border-forest-200 dark:border-forest-800 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-600 text-white text-xs font-bold">
                    #1
                  </span>
                  <span className="text-xs uppercase tracking-wider font-bold text-forest-900 dark:text-forest-200">
                    Highest Similarity Match in Catalog
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      report.most_matched_course.overlap_percentage > 40
                        ? 'critical'
                        : report.most_matched_course.overlap_percentage > 15
                        ? 'warning'
                        : 'pass'
                    }
                    dot
                    className="text-xs px-2.5 py-0.5"
                  >
                    {report.most_matched_course.overlap_percentage}% Overlap Similarity
                  </Badge>
                </div>
              </div>

              <CardBody className="p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-extrabold text-text-heading">
                      {report.most_matched_course.course_code} — {report.most_matched_course.course_title}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      Across all {report.catalog_matches?.length ?? 'available'} catalog courses audited, this course shares the highest degree of syllabus content and conceptual overlap with <strong className="text-text-primary">{report.proposed_course?.code} ({report.proposed_course?.title})</strong>.
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 border border-border-default rounded-xl bg-bg-subtle/60 p-3">
                    <div className="text-center px-2">
                      <div className="text-lg font-bold text-text-heading">
                        {report.most_matched_course.redundant_topics_count ?? 0}
                      </div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider">
                        Shared Weeks
                      </div>
                    </div>
                    <div className="h-8 w-px bg-border-default" />
                    <div className="text-center px-2">
                      <div className="text-lg font-bold text-text-heading">
                        {report.most_matched_course.missing_prerequisites_count ?? 0}
                      </div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider">
                        Prereq Gaps
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overlapping Topics Detail with this Most Matched Course */}
                {report.most_matched_course.redundant_topics?.length > 0 && (
                  <div className="pt-3 border-t border-border-default">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                      Overlapping Topics with {report.most_matched_course.course_code}:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {report.most_matched_course.redundant_topics.map((t, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-warning-border/80 bg-warning-fill/40 p-2.5 text-xs flex flex-col justify-between"
                        >
                          <span className="font-semibold text-text-primary mb-1">
                            {t.topic}
                          </span>
                          <div className="flex items-center justify-between text-[11px] text-text-muted mt-1 border-t border-warning-border/40 pt-1 font-mono">
                            <span>{t.course_a_ref || report.most_matched_course.course_code}</span>
                            <span className="text-warning-text font-bold">⇄</span>
                            <span>{t.course_b_ref || report.proposed_course?.code}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* =================================================================
           * CATALOG-WIDE SIMILARITY RANKING TABLE
           * ================================================================= */}
          <Card>
            <CardHeader
              icon={GitCompare}
              title="Catalog-Wide Similarity Ranking"
              subtitle={`Complete similarity and overlap analysis comparing ${report.proposed_course?.code || 'the uploaded curriculum'} against all ${report.catalog_matches?.length ?? 0} active department courses.`}
            />
            <Table>
              <THead>
                <TR>
                  <TH align="left">Rank & Course</TH>
                  <TH align="left">Similarity / Overlap</TH>
                  <TH align="center">Overlapping Weeks</TH>
                  <TH align="center">Prereq Gaps</TH>
                  <TH align="right">Curriculum Verdict</TH>
                </TR>
              </THead>
              <TBody>
                {(report.catalog_matches ?? []).map((item, idx) => {
                  const isTop = idx === 0;
                  const overlap = item.overlap_percentage ?? 0;
                  return (
                    <TR key={item.course_code} className={cn(isTop && 'bg-forest-50/40 dark:bg-forest-950/20')}>
                      <TD className="font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                              isTop
                                ? 'bg-forest-600 text-white'
                                : 'bg-bg-subtle text-text-muted border border-border-default'
                            )}
                          >
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="text-text-heading font-semibold">
                              {item.course_code}
                            </span>
                            <span className="text-text-muted text-xs ml-1.5">
                              — {item.course_title}
                            </span>
                          </div>
                        </div>
                      </TD>
                      <TD className="w-48">
                        <div className="flex items-center gap-3">
                          <div className="w-24 bg-bg-subtle rounded-full h-2 overflow-hidden border border-border-default">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                overlap > 40
                                  ? 'bg-critical-text'
                                  : overlap > 15
                                  ? 'bg-warning-text'
                                  : 'bg-forest-500'
                              )}
                              style={{ width: `${Math.min(100, Math.max(4, overlap))}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              'tabular-nums font-bold text-xs',
                              overlap > 40
                                ? 'text-critical-text'
                                : overlap > 15
                                ? 'text-warning-text'
                                : 'text-text-secondary'
                            )}
                          >
                            {overlap}%
                          </span>
                        </div>
                      </TD>
                      <TD align="center" className="tabular-nums font-medium text-text-secondary">
                        {item.redundant_topics_count ?? 0}
                      </TD>
                      <TD align="center" className="tabular-nums text-text-muted">
                        {item.missing_prerequisites_count ?? 0}
                      </TD>
                      <TD align="right">
                        <Badge
                          variant={
                            overlap > 40 ? 'critical' : overlap > 15 ? 'warning' : 'pass'
                          }
                          className="text-[10px]"
                        >
                          {overlap > 40
                            ? 'High Overlap'
                            : overlap > 15
                            ? 'Moderate Overlap'
                            : 'Distinct / Clean'}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          {/* Novel & Unique Topics Introduced */}
          <Card>
            <CardHeader
              icon={Check}
              title="Novel & Unique Topics Introduced"
              subtitle={`Isolates ${report.novel_topics_count ?? 0} topic weeks introduced by this curriculum that do not duplicate any existing material in the current catalog.`}
            />
            <CardBody>
              {report.novel_topics?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {report.novel_topics.map((item) => (
                    <div
                      key={item.week}
                      className="rounded-lg border border-pass-border bg-pass-fill p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-pass-text">{item.label}</span>
                        <span className="text-[10px] text-text-muted uppercase tracking-wide font-mono">
                          Unique Concept
                        </span>
                      </div>
                      <p className="text-text-primary leading-snug">{item.topic}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">All topics in this proposal overlap with existing courses.</p>
              )}
            </CardBody>
          </Card>

          <AiSummaryCard
            summary={report.ai_summary}
            meta={`Curriculum Audit: ${report.proposed_course?.code} ${report.proposed_course?.title}`}
          />
        </>
      )}
    </div>
  );
}

/* ==========================================================================
 * Main Page Component with Mode Switcher
 * ======================================================================= */

export default function CurriculumHarmonizerPage() {
  const [mode, setMode] = useState('catalog');

  const fileInputARef = useRef(null);
  const fileInputBRef = useRef(null);

  const [customCourseA, setCustomCourseA] = useState(null);
  const [customCourseB, setCustomCourseB] = useState(null);
  const [activeCohortTitle, setActiveCohortTitle] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const auditMutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.auditSyllabus, payload),
  });

  const submittedA = customCourseA;
  const submittedB = customCourseB;

  const report = auditMutation.data;
  const isFetching = auditMutation.isPending || uploading;

  const isSameFile = useMemo(() => {
    if (!customCourseA?.syllabus_markdown || !customCourseB?.syllabus_markdown) return false;
    return customCourseA.syllabus_markdown.trim() === customCourseB.syllabus_markdown.trim();
  }, [customCourseA, customCourseB]);

  const canRun = Boolean(customCourseA?.syllabus_markdown && customCourseB?.syllabus_markdown) && !isSameFile && !isFetching;

  const loadSamplePair = async () => {
    setLoadError(null);
    setUploading(true);
    try {
      const [resA, resB] = await Promise.all([
        fetch('/samples/curriculum_cse2101_data_structures.md'),
        fetch('/samples/curriculum_cse2103_algorithms.md'),
      ]);
      if (!resA.ok || !resB.ok) throw new Error('Could not fetch sample curricula.');
      const [textA, textB] = await Promise.all([resA.text(), resB.text()]);

      const cA = { code: 'CSE 2101', title: 'Data Structures (Sample)', syllabus_markdown: textA };
      const cB = { code: 'CSE 2103', title: 'Algorithms (Sample)', syllabus_markdown: textB };
      setCustomCourseA(cA);
      setCustomCourseB(cB);
      setActiveCohortTitle('Sample Pair: CSE 2101 → CSE 2103');

      auditMutation.mutate({
        syllabus_a_markdown: textA,
        syllabus_b_markdown: textB,
        course_a_code: 'CSE 2101',
        course_b_code: 'CSE 2103',
      });
    } catch (err) {
      setLoadError(err.message ?? 'Failed to load sample curricula.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    loadSamplePair();
  }, []);

  const handleFileUploadA = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;

      if (customCourseB?.syllabus_markdown && content.trim() === customCourseB.syllabus_markdown.trim()) {
        setLoadError('Validation Error: The same file cannot be uploaded for both Prerequisite (A) and Target (B). Please select two different curriculum files.');
        return;
      }

      const code = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
      const newA = { code, title: file.name, syllabus_markdown: content };
      setCustomCourseA(newA);
      setActiveCohortTitle(`Uploaded Course A: ${file.name}`);

      if (customCourseB?.syllabus_markdown) {
        auditMutation.mutate({
          syllabus_a_markdown: content,
          syllabus_b_markdown: customCourseB.syllabus_markdown,
          course_a_code: code,
          course_b_code: customCourseB.code,
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleFileUploadB = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;

      if (customCourseA?.syllabus_markdown && content.trim() === customCourseA.syllabus_markdown.trim()) {
        setLoadError('Validation Error: The same file cannot be uploaded for both Prerequisite (A) and Target (B). Please select two different curriculum files.');
        return;
      }

      const code = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
      const newB = { code, title: file.name, syllabus_markdown: content };
      setCustomCourseB(newB);
      setActiveCohortTitle(`Uploaded Course B: ${file.name}`);

      if (customCourseA?.syllabus_markdown) {
        auditMutation.mutate({
          syllabus_a_markdown: customCourseA.syllabus_markdown,
          syllabus_b_markdown: content,
          course_a_code: customCourseA.code,
          course_b_code: code,
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const swap = () => {
    const tempA = customCourseA;
    const tempB = customCourseB;
    setCustomCourseA(tempB);
    setCustomCourseB(tempA);
    if (tempA && tempB && tempA.syllabus_markdown.trim() !== tempB.syllabus_markdown.trim()) {
      auditMutation.mutate({
        syllabus_a_markdown: tempB.syllabus_markdown,
        syllabus_b_markdown: tempA.syllabus_markdown,
        course_a_code: tempB.code,
        course_b_code: tempA.code,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher Navigation Header */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          type="button"
          onClick={() => setMode('catalog')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-sm',
            mode === 'catalog'
              ? 'bg-action-primary text-action-primary-text border border-action-primary shadow-action-primary/20'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover border border-transparent'
          )}
        >
          <Layers className="h-4 w-4" /> Single Curriculum Catalog Match
        </button>
        <button
          type="button"
          onClick={() => setMode('pair')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-sm',
            mode === 'pair'
              ? 'bg-action-primary text-action-primary-text border border-action-primary shadow-action-primary/20'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover border border-transparent'
          )}
        >
          <GitCompare className="h-4 w-4" /> Course Pair Harmonization (2 Curriculums)
        </button>
      </div>

      {mode === 'catalog' ? (
        <NewCourseCrossAuditView />
      ) : (
        <>
          <input type="file" ref={fileInputARef} onChange={handleFileUploadA} accept=".md,.txt" className="hidden" />
          <input type="file" ref={fileInputBRef} onChange={handleFileUploadB} accept=".md,.txt" className="hidden" />

          {/* --- Top bar ------------------------------------------------------ */}
          <Card>
            <CardHeader
              icon={GitCompare}
              title="Curriculum Harmonizer"
              subtitle="Upload two curriculum markdown files (.md / .txt) to audit prerequisite alignment, re-taught topics, and Bloom taxonomy coverage."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={GitCompare}
                  loading={uploading}
                  onClick={loadSamplePair}
                  className="border-warning-border text-warning-text hover:bg-warning-fill"
                >
                  Load Overlapping Curriculums Sample
                </Button>
              }
            />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Prerequisite Curriculum (A)
                  </label>
                  <Button
                    variant="primary"
                    size="md"
                    icon={Upload}
                    onClick={() => fileInputARef.current?.click()}
                    className="w-full justify-start overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {customCourseA ? `Curriculum A: ${customCourseA.code}` : 'Upload Curriculum A (.md / .txt)'}
                  </Button>
                </div>

                <div className="flex items-center justify-center pb-0.5">
                  <Button
                    variant="ghost"
                    size="md"
                    icon={ArrowLeftRight}
                    onClick={swap}
                    disabled={!customCourseA || !customCourseB}
                    aria-label="Swap prerequisite and target curricula"
                    title="Swap Curricula"
                    className="shrink-0"
                  />
                </div>

                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Target Curriculum (B)
                  </label>
                  <Button
                    variant="primary"
                    size="md"
                    icon={Upload}
                    onClick={() => fileInputBRef.current?.click()}
                    className="w-full justify-start overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {customCourseB ? `Curriculum B: ${customCourseB.code}` : 'Upload Curriculum B (.md / .txt)'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-subtle px-3 py-1.5 text-[11px] text-text-muted">
                  <span className="font-medium text-text-secondary">Templates:</span>
                  <a
                    href="/samples/curriculum_cse2101_data_structures.md"
                    download="curriculum_cse2101_data_structures.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> Data Structures (.md)
                  </a>
                  <span className="text-text-muted">·</span>
                  <a
                    href="/samples/curriculum_cse2103_algorithms.md"
                    download="curriculum_cse2103_algorithms.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> Algorithms (.md)
                  </a>
                  <span className="text-text-muted">·</span>
                  <a
                    href="/samples/curriculum_cse3101_database_systems.md"
                    download="curriculum_cse3101_database_systems.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> DBMS (.md)
                  </a>
                  <span className="text-text-muted">·</span>
                  <a
                    href="/samples/curriculum_cse3103_operating_systems.md"
                    download="curriculum_cse3103_operating_systems.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> OS (.md)
                  </a>
                  <span className="text-text-muted">·</span>
                  <a
                    href="/samples/curriculum_cse4101_computer_networks.md"
                    download="curriculum_cse4101_computer_networks.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> Networks (.md)
                  </a>
                  <span className="text-text-muted">·</span>
                  <a
                    href="/samples/curriculum_cse4103_artificial_intelligence.md"
                    download="curriculum_cse4103_artificial_intelligence.md"
                    className="inline-flex items-center gap-1 font-mono text-action-primary underline hover:opacity-80"
                  >
                    <Download className="h-3 w-3" /> AI (.md)
                  </a>
                  {activeCohortTitle ? (
                    <>
                      <span className="text-text-muted">·</span>
                      <span className="font-semibold text-warning-text">{activeCohortTitle}</span>
                    </>
                  ) : null}
                </div>

                <Button
                  size="md"
                  icon={Play}
                  loading={isFetching}
                  disabled={!canRun}
                  onClick={() => {
                    if (customCourseA && customCourseB) {
                      auditMutation.mutate({
                        syllabus_a_markdown: customCourseA.syllabus_markdown,
                        syllabus_b_markdown: customCourseB.syllabus_markdown,
                        course_a_code: customCourseA.code,
                        course_b_code: customCourseB.code,
                      });
                    }
                  }}
                  className="shrink-0"
                >
                  Run Harmonization Audit
                </Button>
              </div>

              {isSameFile ? (
                <div className="flex items-center gap-2 rounded-lg border border-critical-border bg-critical-fill px-3 py-2 text-xs text-critical-text">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-critical-text" />
                  <span>
                    Validation Error: The same curriculum file cannot be uploaded for both Prerequisite (A) and Target (B). Please select two different course curriculum files.
                  </span>
                </div>
              ) : null}

              {loadError ? <p className="text-[11px] text-critical-text font-medium">{loadError}</p> : null}
            </CardBody>
          </Card>

          {/* --- Results ------------------------------------------------------ */}
          {!customCourseA && !customCourseB && !report ? (
            <Card>
              <EmptyState
                icon={ScanSearch}
                title="No audit run yet"
                description="Upload two curriculum markdown files (.md / .txt) or click 'Load Overlapping Curriculums Sample'."
                actionLabel="Load Overlapping Curriculums Sample"
                onAction={loadSamplePair}
              />
            </Card>
          ) : isFetching && !report ? (
            <LoadingResults />
          ) : auditMutation.isError ? (
            <Card>
              <EmptyState
                tone="critical"
                icon={AlertTriangle}
                title="The harmonization audit failed"
                description={auditMutation.error?.message ?? 'The request did not complete.'}
                actionLabel="Try again"
                onAction={loadSamplePair}
              />
            </Card>
          ) : !report ? (
            <LoadingResults />
          ) : (
            <>
              <AlignmentHeader report={report} courseA={submittedA} courseB={submittedB} />
              <SyllabusDiff report={report} courseA={submittedA} courseB={submittedB} />
              <FindingsTabs report={report} courseA={submittedA} courseB={submittedB} />
              <ActionableChanges changes={report.actionable_changes} />
              <AiSummaryCard
                summary={report.ai_summary}
                meta={
                  submittedA && submittedB ? `${submittedA.code} → ${submittedB.code}` : undefined
                }
              />
            </>
          )}

          {report && isFetching ? (
            <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <RotateCw className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" />
              Re-running the audit…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
