import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  GitCompare,
  Layers,
  ListChecks,
  Play,
  RotateCw,
  ScanSearch,
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

import { BLOOM_LEVELS, ENDPOINTS, QUERY_KEYS } from '../api/contract.js';
import { get, post } from '../api/client.js';
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

/** The pair the demo tells its story with. */
const DEMO_PAIR = { a: 'CSE 2101', b: 'CSE 2103' };

/** Score band -> ring colour, text colour, and the verdict's opening clause. */
const BANDS = {
  critical: {
    hex: '#fb7185',
    text: 'text-rose-400',
    badge: 'critical',
    label: 'Severely misaligned',
    clause: 'The pair needs redesign before the next offering',
  },
  warning: {
    hex: '#fbbf24',
    text: 'text-amber-400',
    badge: 'warning',
    label: 'Partially aligned',
    clause: 'Redundant teaching and prerequisite gaps both present',
  },
  pass: {
    hex: '#34d399',
    text: 'text-emerald-400',
    badge: 'pass',
    label: 'Well aligned',
    clause: 'Only minor overlap between the two syllabi',
  },
  unknown: {
    hex: '#475569',
    text: 'text-slate-400',
    badge: 'neutral',
    label: 'Not scored',
    clause: 'The audit returned no alignment score',
  },
};

/** Diff row treatment. `aligned` is the absence of a finding, not a verdict. */
const DIFF_TONES = {
  redundant: {
    base: 'border-amber-400/70 bg-amber-400/[0.07]',
    active: 'border-amber-300 bg-amber-400/20',
    label: 'text-amber-300',
  },
  missing: {
    base: 'border-rose-400/70 bg-rose-400/[0.07]',
    active: 'border-rose-300 bg-rose-400/20',
    label: 'text-rose-300',
  },
  aligned: {
    base: 'border-transparent',
    active: 'border-transparent bg-slate-800/40',
    label: 'text-slate-500',
  },
};

const TABS = [
  { id: 'redundant', label: 'Redundant Topics' },
  { id: 'missing', label: 'Missing Prerequisites' },
  { id: 'bloom', label: 'Bloom Coverage' },
];

/* ==========================================================================
 * Top bar
 * ======================================================================= */

function CourseSelect({ id, label, value, onChange, courses, disabled }) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        className={cn(
          'focus-ring h-8 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 text-[13px] text-slate-200',
          'transition-colors hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-600'
        )}
      >
        <option value="">Select a course…</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.code} — {course.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ==========================================================================
 * 1. Alignment score
 * ======================================================================= */

/**
 * Alignment score as a stroked ring. Drawn by hand rather than with Recharts:
 * a single scalar does not need a chart runtime, and the SVG animates the
 * dash offset for free.
 */
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
        stroke="#1e293b"
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
      {/* The ring starts at 12 o'clock because the <svg> is rotated -90°; this
          counter-rotation puts the number back upright. */}
      <text
        x={size / 2}
        y={size / 2}
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-100 text-[30px] font-semibold tabular-nums"
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
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Redundant</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-amber-400">{redundant}</dd>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Missing prereqs</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-rose-400">{missing}</dd>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Changes proposed</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-200">
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
    { tone: 'bg-amber-400', label: 'Redundant overlap' },
    { tone: 'bg-rose-400', label: 'Missing dependency' },
    { tone: 'bg-slate-700', label: 'Aligned' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
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
      <li className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500 first:pt-2">
        {row.text}
      </li>
    );
  }

  if (row.kind === 'prose') {
    return <li className="px-3 py-1 text-[11px] leading-relaxed text-slate-500">{row.text}</li>;
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
        !flag && 'hover:bg-slate-800/40'
      )}
    >
      <div className="flex items-start gap-2">
        {kind === 'missing' ? (
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"
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
          <span className="text-[13px] leading-relaxed text-slate-300">{row.text}</span>
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
    <div className={cn('min-w-0 rounded-lg border border-slate-800 bg-slate-950/40', className)}>
      <div className={cn('overflow-y-auto', scrollClassName)}>
        {/* Sticky inside the scroller, so the course code survives scrolling. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight text-slate-100">
              {course?.code ?? '—'}
            </div>
            <div className="truncate text-[11px] text-slate-500">
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
    <div className="rounded-lg border border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-slate-100">
            {course?.code ?? '—'}
          </span>
          <span className="block truncate text-[11px] text-slate-500">
            {annotated.title ?? course?.title ?? 'Syllabus'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {counts ? <Badge variant="warning">{counts} flagged</Badge> : null}
          <ChevronDown
            className={cn('h-4 w-4 text-slate-500 transition-transform', open && 'rotate-180')}
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
          className="rounded-none border-0 border-t border-slate-800"
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
      <span className="w-24 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
        <span className="block h-1.5 rounded-sm bg-amber-400" style={{ width: `${width}%` }} />
      </span>
      <span className="w-11 text-right tabular-nums text-slate-200">{ratioPct(value, 0)}</span>
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
            <TD className="text-slate-200">{topic.topic}</TD>
            <TD className="whitespace-nowrap text-slate-400">{topic.course_a_ref}</TD>
            <TD className="whitespace-nowrap text-slate-400">{topic.course_b_ref}</TD>
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
          className="rounded-lg border border-rose-400/25 bg-rose-400/[0.04] p-3"
        >
          <header className="flex items-start justify-between gap-3">
            <h3 className="flex min-w-0 items-start gap-2 text-[13px] font-semibold tracking-tight text-slate-100">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="min-w-0">{prerequisite.concept}</span>
            </h3>
            <SeverityPill severity={prerequisite.severity} />
          </header>

          <dl className="mt-3 space-y-1.5 text-[12px]">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-slate-500">Assumed in</dt>
              <dd className="min-w-0 text-slate-300">{prerequisite.assumed_in}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-slate-500">Never introduced in</dt>
              <dd className="min-w-0 text-slate-300">{prerequisite.never_introduced_in}</dd>
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
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[12px] shadow-lg">
      <div className="font-medium text-slate-100">{label}</div>
      <div className="tabular-nums text-slate-400">
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
      <p className="mb-3 text-xs text-slate-500">
        Topic counts per Bloom level for {courseB?.code ?? 'the target course'}. The backend reports{' '}
        <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-300">
          bloom_coverage
        </code>{' '}
        across the audited pair, so a level counted here may be taught in either syllabus.
      </p>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="level"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: '#1e293b40' }} content={<BloomChartTooltip />} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} minPointSize={3} isAnimationActive={false}>
              {data.map((entry) => (
                // Amber is reserved for the judgement: a level nothing assesses.
                <Cell key={entry.level} fill={entry.count === 0 ? '#fbbf24' : '#64748b'} />
              ))}
              <LabelList dataKey="count" position="top" fill="#94a3b8" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {uncovered.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[12px] leading-relaxed text-amber-200">
            No coverage at {uncovered.map((entry) => entry.level).join(', ')}. Assessment at{' '}
            {uncovered.length === 1 ? 'this level' : 'these levels'} is absent from the pair — add at
            least one task there before the syllabus is signed off.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-slate-500">
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

      <div className="flex gap-1 border-b border-slate-800 px-2" role="tablist" aria-label="Findings">
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
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              {item.label}
              {counts[item.id] !== null ? (
                <span className="tabular-nums text-[11px] text-slate-500">{counts[item.id]}</span>
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
          <span className="text-[11px] tabular-nums text-slate-500">
            {done.size}/{changes.length} done
          </span>
        }
      />
      <ol className="divide-y divide-slate-800/70">
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
                    ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600'
                )}
              >
                {checked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : index + 1}
              </button>

              <p
                className={cn(
                  'min-w-0 flex-1 text-[13px] leading-relaxed',
                  checked ? 'text-slate-500 line-through' : 'text-slate-300'
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
 * Page
 * ======================================================================= */

/**
 * OWNER: curriculum dev.
 *
 * POST /audit/syllabus { course_a_id, course_b_id } -> SyllabusReport.
 *
 * The signature visual is the dual-column diff: each course's
 * `syllabus_markdown` is parsed into addressable topic rows (see
 * `src/lib/syllabus.js`) and the report's findings are painted back onto the
 * lines they came from, so a redundancy can be seen in both syllabi at once.
 */
export default function CurriculumHarmonizerPage() {
  const fileInputARef = useRef(null);
  const fileInputBRef = useRef(null);

  const [pair, setPair] = useState({ a: null, b: null });
  const [submitted, setSubmitted] = useState(null);
  const [customCourseA, setCustomCourseA] = useState(null);
  const [customCourseB, setCustomCourseB] = useState(null);
  const [activeCohortTitle, setActiveCohortTitle] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const coursesQuery = useQuery({
    queryKey: QUERY_KEYS.courses,
    queryFn: () => get(ENDPOINTS.courses),
  });

  const courses = coursesQuery.data ?? [];

  const auditQuery = useQuery({
    queryKey: submitted ? QUERY_KEYS.syllabus(submitted.a, submitted.b) : ['audit', 'syllabus', 'idle'],
    queryFn: () =>
      post(ENDPOINTS.auditSyllabus, { course_a_id: submitted.a, course_b_id: submitted.b }),
    enabled: Boolean(submitted),
    retry: false,
  });

  const auditMutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.auditSyllabus, payload),
  });

  const byId = (id) => courses.find((course) => course.id === id) ?? null;
  const submittedA = customCourseA ?? (submitted ? byId(submitted.a) : null);
  const submittedB = customCourseB ?? (submitted ? byId(submitted.b) : null);

  const report = auditMutation.data ?? auditQuery.data;
  const isFetching = auditMutation.isPending || auditQuery.isFetching || uploading;

  const samePair = pair.a !== null && pair.a === pair.b;
  const canRun = pair.a !== null && pair.b !== null && !samePair && !isFetching;

  const loadDemoPair = () => {
    const a = courses.find((course) => course.code === DEMO_PAIR.a) ?? courses[0];
    const b = courses.find((course) => course.code === DEMO_PAIR.b) ?? courses[1];
    setPair({ a: a?.id ?? null, b: b?.id ?? null });
  };

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

  const handleFileUploadA = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;
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

  const swap = () => setPair((current) => ({ a: current.b, b: current.a }));

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input type="file" ref={fileInputARef} onChange={handleFileUploadA} accept=".md,.txt" className="hidden" />
      <input type="file" ref={fileInputBRef} onChange={handleFileUploadB} accept=".md,.txt" className="hidden" />

      {/* --- Top bar ------------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={GitCompare}
          title="Curriculum Harmonizer"
          subtitle="Audit a prerequisite course curriculum against the target course that builds on it to identify re-taught topics, missing prerequisites, and Bloom taxonomy coverage."
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={Layers}
              onClick={loadDemoPair}
              disabled={coursesQuery.isPending || courses.length < 2}
            >
              Load Demo Pair
            </Button>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <CourseSelect
              id="course-a"
              label="Prerequisite Course"
              value={pair.a}
              onChange={(id) => {
                setCustomCourseA(null);
                setPair((current) => ({ ...current, a: id }));
              }}
              courses={courses}
              disabled={coursesQuery.isPending}
            />

            <Button
              variant="ghost"
              size="md"
              icon={ArrowLeftRight}
              onClick={swap}
              disabled={pair.a === null && pair.b === null}
              aria-label="Swap the prerequisite and target courses"
              className="shrink-0 self-start lg:self-auto"
            />

            <CourseSelect
              id="course-b"
              label="Target Course"
              value={pair.b}
              onChange={(id) => {
                setCustomCourseB(null);
                setPair((current) => ({ ...current, b: id }));
              }}
              courses={courses}
              disabled={coursesQuery.isPending}
            />

            <Button
              size="md"
              icon={Play}
              loading={isFetching}
              disabled={!canRun}
              onClick={() => {
                setCustomCourseA(null);
                setCustomCourseB(null);
                setActiveCohortTitle(null);
                setSubmitted({ a: pair.a, b: pair.b });
              }}
              className="shrink-0"
            >
              Run Harmonization Audit
            </Button>
          </div>

          {/* Upload and Sample Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => fileInputARef.current?.click()}
            >
              {customCourseA ? `Curriculum A: ${customCourseA.code}` : 'Upload Curriculum A (.md / .txt)'}
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => fileInputBRef.current?.click()}
            >
              {customCourseB ? `Curriculum B: ${customCourseB.code}` : 'Upload Curriculum B (.md / .txt)'}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={GitCompare}
              loading={uploading}
              onClick={loadSamplePair}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              Load Overlapping Curriculums Sample
            </Button>
          </div>

          {/* Templates & Active Badge */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-400">
            <span className="font-medium text-slate-300">Templates:</span>
            <a
              href="/samples/curriculum_cse2101_data_structures.md"
              download="curriculum_cse2101_data_structures.md"
              className="inline-flex items-center gap-1 font-mono text-cyan-400/90 underline decoration-cyan-400/40 hover:text-cyan-300"
            >
              <Download className="h-3 w-3" /> Curriculum A (.md)
            </a>
            <span className="text-slate-600">·</span>
            <a
              href="/samples/curriculum_cse2103_algorithms.md"
              download="curriculum_cse2103_algorithms.md"
              className="inline-flex items-center gap-1 font-mono text-cyan-400/90 underline decoration-cyan-400/40 hover:text-cyan-300"
            >
              <Download className="h-3 w-3" /> Curriculum B (.md)
            </a>
            {activeCohortTitle ? (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-semibold text-amber-400">{activeCohortTitle}</span>
              </>
            ) : null}
          </div>

          {loadError ? <p className="text-[11px] text-rose-300">{loadError}</p> : null}
          {samePair ? (
            <p className="mt-2 text-[11px] text-amber-300">
              Pick two different courses — a syllabus cannot be harmonized against itself.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* --- Results ------------------------------------------------------ */}
      {!submitted && !customCourseA && !customCourseB && !report ? (
        <Card>
          <EmptyState
            icon={ScanSearch}
            title="No audit run yet"
            description="Upload two curriculum files (.md / .txt), choose a prerequisite and target course pair, or load the sample overlapping curricula preset."
            actionLabel="Load Overlapping Curriculums Sample"
            onAction={loadSamplePair}
          />
        </Card>
      ) : isFetching && !report ? (
        <LoadingResults />
      ) : auditQuery.isError || auditMutation.isError ? (
        <Card>
          <EmptyState
            tone="critical"
            icon={AlertTriangle}
            title="The harmonization audit failed"
            description={auditMutation.error?.message ?? auditQuery.error?.message ?? 'The request did not complete.'}
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

      {/* Refetching an already-visible pair keeps the results on screen. */}
      {report && isFetching ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <RotateCw className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" />
          Re-running the audit…
        </p>
      ) : null}
    </div>
  );
}
