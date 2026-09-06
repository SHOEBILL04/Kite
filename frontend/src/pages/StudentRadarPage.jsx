import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  ClipboardCopy,
  Download,
  Play,
  Radar,
  ShieldCheck,
  Upload,
  UserSearch,
  X,
} from 'lucide-react';
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ENDPOINTS, QUERY_KEYS } from '../api/contract.js';
import { get, post } from '../api/client.js';
import { cn } from '../lib/cn.js';
import { num, pct, ratioPct } from '../lib/format.js';
import { attributeRisk, declineWindow, quizSlope, trajectorySeries } from '../lib/risk.js';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SeverityPill,
  SkeletonTable,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '../components/ui/index.js';

/**
 * Parse CSV student indicators into structured records.
 *
 * @param {string} source
 * @returns {{ok: true, students: Array} | {ok: false, message: string}}
 */
function parseCsvStudents(source) {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, message: 'The uploaded CSV file is empty.' };
  }

  let startIdx = 0;
  if (/student_hash|attendance|section/i.test(lines[0])) {
    startIdx = 1;
  }

  const students = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length >= 7) {
      students.push({
        student_hash: parts[0] || `STU_${i}`,
        section_name: parts[1] || 'Section A',
        attendance_pct: Number(parts[2]) || 0,
        quiz1: Number(parts[3]) || 0,
        quiz2: Number(parts[4]) || 0,
        quiz3: Number(parts[5]) || 0,
        midterm_pct: Number(parts[6]) || 0,
        assignment_delay_count: Number(parts[7]) || 0,
      });
    }
  }

  if (students.length === 0) {
    return { ok: false, message: 'No valid student rows found in CSV.' };
  }

  return { ok: true, students };
}

/* ==========================================================================
 * Constants
 * ======================================================================= */

/**
 * The contract's `Severity` is the risk level. The advisor-facing wording is
 * Critical / Moderate / Safe, so the mapping lives here and nowhere else.
 */
const LEVELS = {
  high: { key: 'high', label: 'Critical', variant: 'critical', text: 'text-rose-400', hex: '#fb7185' },
  medium: { key: 'medium', label: 'Moderate', variant: 'warning', text: 'text-amber-400', hex: '#fbbf24' },
  low: { key: 'low', label: 'Safe', variant: 'pass', text: 'text-emerald-400', hex: '#34d399' },
};

const LEVEL_ORDER = { high: 3, medium: 2, low: 1 };

/** Column definitions: label, alignment, and how the column sorts. */
const COLUMNS = [
  { id: 'student_hash', label: 'Student Hash', align: 'left', value: (s) => s.student_hash },
  { id: 'section_name', label: 'Section', align: 'left', value: (s) => s.section_name },
  { id: 'attendance_pct', label: 'Attendance', align: 'left', value: (s) => s.attendance_pct ?? 0 },
  { id: 'quiz_trend', label: 'Quiz Trend', align: 'left', value: (s) => quizSlope(s) },
  { id: 'midterm_pct', label: 'Midterm', align: 'right', value: (s) => s.midterm_pct ?? 0 },
  { id: 'risk_score', label: 'Risk Score', align: 'left', value: (s) => s.risk_score ?? 0 },
  { id: 'ml_probability', label: 'ML Probability', align: 'right', value: (s) => s.ml_probability ?? 0 },
  { id: 'risk_level', label: 'Risk Level', align: 'left', value: (s) => LEVEL_ORDER[s.risk_level] ?? 0 },
];

/* ==========================================================================
 * The framing notice — persistent, never dismissible
 * ======================================================================= */

/**
 * What this page is and is not. It stays on screen in every state, including
 * idle and error, because the constraint holds whether or not data is loaded.
 */
function PrivacyNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.04] px-4 py-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] leading-relaxed text-slate-200">
          Academic indicators only. No identity or personal data is processed. All flags require
          advisor review before any action.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Students are addressed by pseudonymous hash. Attendance, quiz and midterm figures are the
          only inputs; nothing here is a decision, and nothing here is evidence about a person.
        </p>
      </div>
    </div>
  );
}

/* ==========================================================================
 * Cell renderers
 * ======================================================================= */

/** Attendance as a mini bar. Under 60% the university threshold is breached. */
function AttendanceCell({ value }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  const low = width < 60;

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-10 shrink-0 text-right tabular-nums', low ? 'text-rose-400' : 'text-slate-200')}>
        {pct(value, 0)}
      </span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
        <span
          className={cn('block h-full rounded-sm', low ? 'bg-rose-400' : 'bg-slate-500')}
          style={{ width: `${width}%` }}
        />
      </span>
    </div>
  );
}

/** Three quiz scores as a sparkline, stroked by direction of travel. */
function QuizTrendCell({ student }) {
  const slope = quizSlope(student);
  const stroke = slope < 0 ? '#fb7185' : slope > 0 ? '#34d399' : '#64748b';
  const data = (student.quiz_trend ?? []).map((value, index) => ({ index, value }));

  if (!data.length) return <span className="text-slate-600">—</span>;

  return (
    <div className="flex items-center gap-2">
      <LineChart width={64} height={24} data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
        <YAxis hide domain={[0, 100]} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
      <span className={cn('tabular-nums text-[12px]', slope < 0 ? 'text-rose-400' : 'text-slate-400')}>
        {slope > 0 ? '+' : ''}
        {num(slope, 0)}
      </span>
    </div>
  );
}

function RiskScoreCell({ value, level }) {
  const tone = LEVELS[level] ?? LEVELS.low;
  const width = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-7 shrink-0 text-right text-[13px] font-medium tabular-nums', tone.text)}>
        {num(value, 0)}
      </span>
      <span className="h-1 w-20 shrink-0 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
        <span
          className="block h-full rounded-sm"
          style={{ width: `${width}%`, backgroundColor: tone.hex }}
        />
      </span>
    </div>
  );
}

/** Model confidence. The "LR" chip names the model that produced the number. */
function MlProbabilityCell({ value }) {
  return (
    <span className="group inline-flex items-center justify-end gap-1.5">
      <span className="tabular-nums text-slate-200">{ratioPct(value, 0)}</span>
      <span
        title="Logistic regression confidence"
        className="rounded border border-slate-700 bg-slate-800 px-1 text-[10px] font-medium text-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
      >
        LR
      </span>
    </span>
  );
}

/* ==========================================================================
 * Table and cards
 * ======================================================================= */

function SortableHeader({ column, sort, onSort }) {
  const active = sort.column === column.id;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TH align={column.align}>
      <button
        type="button"
        onClick={() => onSort(column.id)}
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn(
          'focus-ring inline-flex items-center gap-1 rounded text-[11px] font-medium uppercase tracking-wide transition-colors',
          active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
        )}
      >
        {column.label}
        <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      </button>
    </TH>
  );
}

function StudentTable({ students, sort, onSort, onSelect, selectedHash }) {
  return (
    <Table>
      <THead>
        <TR hover={false}>
          {COLUMNS.map((column) => (
            <SortableHeader key={column.id} column={column} sort={sort} onSort={onSort} />
          ))}
        </TR>
      </THead>
      <TBody>
        {students.map((student) => (
          <TR
            key={student.student_hash}
            selected={student.student_hash === selectedHash}
            onClick={() => onSelect(student)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(student);
              }
            }}
            tabIndex={0}
            aria-label={`Open risk details for ${student.student_hash}`}
            className={cn(
              'focus-ring cursor-pointer border-l-2',
              student.risk_level === 'high' ? 'border-l-rose-400' : 'border-l-transparent'
            )}
          >
            <TD className="font-medium text-slate-100">{student.student_hash}</TD>
            <TD className="whitespace-nowrap text-slate-400">{student.section_name}</TD>
            <TD>
              <AttendanceCell value={student.attendance_pct} />
            </TD>
            <TD>
              <QuizTrendCell student={student} />
            </TD>
            <TD align="right" numeric>
              {pct(student.midterm_pct, 1)}
            </TD>
            <TD>
              <RiskScoreCell value={student.risk_score} level={student.risk_level} />
            </TD>
            <TD align="right">
              <MlProbabilityCell value={student.ml_probability} />
            </TD>
            <TD>
              <SeverityPill
                severity={student.risk_level}
                label={LEVELS[student.risk_level]?.label}
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Under 768px the eight columns stop fitting, so each student becomes a card. */
function StudentCards({ students, onSelect }) {
  return (
    <ul className="space-y-2 p-3">
      {students.map((student) => (
        <li key={student.student_hash}>
          <button
            type="button"
            onClick={() => onSelect(student)}
            className={cn(
              'focus-ring w-full rounded-lg border border-l-2 border-slate-800 bg-slate-950 p-3 text-left transition-colors hover:border-slate-700',
              student.risk_level === 'high' ? 'border-l-rose-400' : 'border-l-slate-800'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-slate-100">{student.student_hash}</span>
              <SeverityPill severity={student.risk_level} label={LEVELS[student.risk_level]?.label} />
            </div>

            <div className="mt-1 text-[11px] text-slate-500">{student.section_name}</div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Attendance</dt>
                <dd>
                  <AttendanceCell value={student.attendance_pct} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Midterm</dt>
                <dd className="tabular-nums text-slate-200">{pct(student.midterm_pct, 1)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Quizzes</dt>
                <dd>
                  <QuizTrendCell student={student} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">ML</dt>
                <dd className="tabular-nums text-slate-200">{ratioPct(student.ml_probability, 0)}</dd>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2">
                <dt className="text-slate-500">Risk score</dt>
                <dd>
                  <RiskScoreCell value={student.risk_score} level={student.risk_level} />
                </dd>
              </div>
            </dl>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ==========================================================================
 * Detail drawer
 * ======================================================================= */

function RiskFactorBreakdown({ student }) {
  const factors = useMemo(() => attributeRisk(student), [student]);
  const tone = LEVELS[student.risk_level] ?? LEVELS.low;
  const widest = Math.max(...factors.map((factor) => factor.points), 1);

  if (!factors.length) {
    return <p className="text-[12px] text-slate-500">The audit returned no triggers for this student.</p>;
  }

  return (
    <div>
      <ul className="space-y-3">
        {factors.map((factor) => (
          <li key={factor.trigger}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[12px] font-medium text-slate-200">{factor.label}</span>
              <span className={cn('shrink-0 text-[13px] font-semibold tabular-nums', tone.text)}>
                +{factor.points}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${(factor.points / widest) * 100}%`,
                  backgroundColor: tone.hex,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">{factor.detail}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-slate-800 pt-2 text-[11px] leading-relaxed text-slate-500">
        Contributions sum to the reported risk score of{' '}
        <span className="tabular-nums text-slate-400">{num(student.risk_score, 0)}</span>. The audit
        returns which rules fired but not their weights, so these points are reconstructed from this
        student&rsquo;s published indicators — treat them as an explanation of the score, not as a
        second measurement.
      </p>
    </div>
  );
}

function TrajectoryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[12px] shadow-lg">
      <div className="font-medium text-slate-100">{label}</div>
      <div className="tabular-nums text-slate-400">{pct(payload[0].value, 1)}</div>
    </div>
  );
}

function PerformanceTrajectory({ student }) {
  const series = useMemo(() => trajectorySeries(student), [student]);
  const decline = useMemo(() => declineWindow(series), [series]);

  return (
    <div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TrajectoryTooltip />} cursor={{ stroke: '#334155' }} />

            {/* Shade from the turn downwards to the end of the series. */}
            {decline ? (
              <ReferenceArea
                x1={decline.from}
                x2={decline.to}
                fill="#fb7185"
                fillOpacity={0.12}
                stroke="#fb7185"
                strokeOpacity={0.25}
              />
            ) : null}

            <Line
              type="monotone"
              dataKey="value"
              stroke="#e2e8f0"
              strokeWidth={2}
              dot={{ r: 3, fill: '#e2e8f0', stroke: 'none' }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {decline ? (
        <p className="mt-1 text-[11px] leading-relaxed text-rose-300">
          Steepest fall begins at {decline.from}: {num(decline.drop, 1)} points lost by{' '}
          {decline.to.toLowerCase()}.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">No decline in this trajectory.</p>
      )}
    </div>
  );
}

/** The note an advisor pastes into their own system — hash only, no identity. */
function advisorNote(student) {
  const factors = attributeRisk(student)
    .map((factor) => `  - ${factor.label} (+${factor.points}): ${factor.detail}`)
    .join('\n');

  return [
    `Student: ${student.student_hash} · ${student.section_name}`,
    `Risk: ${LEVELS[student.risk_level]?.label ?? student.risk_level} — rule score ${num(
      student.risk_score,
      0
    )}/100, model confidence ${ratioPct(student.ml_probability, 0)}`,
    `Indicators: attendance ${pct(student.attendance_pct, 0)}, quizzes ${(
      student.quiz_trend ?? []
    ).join('% → ')}%, midterm ${pct(student.midterm_pct, 1)}`,
    '',
    'Risk factors (reconstructed from published indicators):',
    factors,
    '',
    `Recommended action: ${student.recommended_action}`,
    '',
    student.narrative,
    '',
    'Academic indicators only. Requires advisor review before any action.',
  ].join('\n');
}

function DetailDrawer({ student, onClose }) {
  const isWide = useMediaQuery('(min-width: 768px)');
  const { copiedKey, copy } = useCopyToClipboard();
  const [entered, setEntered] = useState(false);
  const tone = LEVELS[student.risk_level] ?? LEVELS.low;

  useEffect(() => {
    setEntered(true);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'relative z-10 flex h-full w-full flex-col border-slate-800 bg-slate-900 transition-transform duration-200 ease-out',
          isWide ? 'max-w-xl border-l' : 'max-w-none',
          entered ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight text-slate-100">
                {student.student_hash}
              </h2>
              <SeverityPill severity={student.risk_level} label={tone.label} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{student.section_name}</p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close details" />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Rule score</div>
              <div className={cn('mt-0.5 text-2xl font-semibold tabular-nums', tone.text)}>
                {num(student.risk_score, 0)}
                <span className="text-sm font-normal text-slate-500"> /100</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Model confidence
              </div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-200">
                {ratioPct(student.ml_probability, 0)}
              </div>
              <div className="text-[10px] text-slate-600">Logistic regression</div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Risk factor breakdown
            </h3>
            <RiskFactorBreakdown student={student} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Performance trajectory
            </h3>
            <PerformanceTrajectory student={student} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Triggers
            </h3>
            <ul className="space-y-1.5">
              {(student.triggers ?? []).map((trigger) => (
                <li key={trigger} className="flex items-start gap-2">
                  <AlertCircle
                    className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.text)}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="text-[12px] leading-relaxed text-slate-300">{trigger}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recommended intervention
              </h3>
              <Button
                variant="ghost"
                size="sm"
                icon={copiedKey === student.student_hash ? Check : ClipboardCopy}
                onClick={() => copy(advisorNote(student), student.student_hash)}
              >
                {copiedKey === student.student_hash ? 'Copied' : 'Copy advisor note'}
              </Button>
            </div>

            <p className={cn('mt-2 text-[13px] font-medium leading-relaxed', tone.text)}>
              {student.recommended_action}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{student.narrative}</p>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-500">
            This drawer describes academic indicators for a pseudonymous record. It is not a decision
            and not a finding about a person — an advisor reviews it before anything follows.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ==========================================================================
 * Page
 * ======================================================================= */

/**
 * OWNER: student radar dev.
 *
 * POST /audit/vulnerable-students { course_id } -> VulnerableStudentsReport.
 *
 * Everything on this page is keyed by `student_hash`. No name, email, or
 * identity attribute is requested, rendered, or copied out — the advisor note
 * carries the hash and the academic indicators only.
 */
export default function StudentRadarPage() {
  const fileInputRef = useRef(null);
  const [courseId, setCourseId] = useState(null);
  const [submittedCourseId, setSubmittedCourseId] = useState(null);
  const [sort, setSort] = useState({ column: 'risk_score', direction: 'desc' });
  const [sectionFilter, setSectionFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [activeCohortTitle, setActiveCohortTitle] = useState(null);

  const isWide = useMediaQuery('(min-width: 768px)');

  const coursesQuery = useQuery({
    queryKey: QUERY_KEYS.courses,
    queryFn: () => get(ENDPOINTS.courses),
  });
  const courses = coursesQuery.data ?? [];

  // Default course selection
  useEffect(() => {
    if (!courseId && courses.length > 0) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  // If ?autorun=1 in URL, auto-run risk analysis
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autorun') === '1' && courses.length > 0) {
      setSubmittedCourseId(courses[0].id);
    }
  }, [courses]);

  const auditQuery = useQuery({
    queryKey: submittedCourseId
      ? QUERY_KEYS.vulnerableStudents(submittedCourseId)
      : ['audit', 'vulnerable-students', 'idle'],
    queryFn: () => post(ENDPOINTS.auditVulnerableStudents, { course_id: submittedCourseId }),
    enabled: Boolean(submittedCourseId),
    retry: false,
  });

  const auditMutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.auditVulnerableStudents, payload),
    onSuccess: () => {
      setSelected(null);
    },
  });

  const report = auditMutation.data ?? auditQuery.data;
  const isFetching = auditMutation.isPending || auditQuery.isFetching;
  const students = report?.students ?? [];

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;

      let result;
      if (file.name.toLowerCase().endsWith('.csv')) {
        result = parseCsvStudents(content);
      } else {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            result = { ok: true, students: parsed };
          } else {
            result = { ok: false, message: 'Expected a JSON array of student records.' };
          }
        } catch (err) {
          result = { ok: false, message: err.message };
        }
      }

      if (!result.ok) {
        setLoadError(`Failed to parse ${file.name}: ${result.message}`);
        return;
      }

      setActiveCohortTitle(`Uploaded File: ${file.name}`);
      auditMutation.mutate({
        students: result.students,
        course_id: courseId ?? 1,
      });
    };

    reader.onerror = () => {
      setLoadError('Failed to read file from disk.');
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  const loadSample = async (sampleType) => {
    setLoadError(null);
    setUploading(true);
    try {
      const fileName =
        sampleType === 'high-risk'
          ? '/samples/students_high_risk_cohort.json'
          : '/samples/students_safe_balanced_cohort.json';
      const res = await fetch(fileName);
      if (!res.ok) throw new Error(`Could not fetch sample: ${fileName}`);
      const data = await res.json();
      setActiveCohortTitle(sampleType === 'high-risk' ? 'Sample: High-Risk Cohort' : 'Sample: Safe Healthy Cohort');
      auditMutation.mutate({
        students: data,
        course_id: courseId ?? 1,
      });
    } catch (err) {
      setLoadError(err.message ?? 'Could not load sample.');
    } finally {
      setUploading(false);
    }
  };

  const counts = useMemo(
    () => ({
      high: students.filter((student) => student.risk_level === 'high').length,
      medium: students.filter((student) => student.risk_level === 'medium').length,
      low: students.filter((student) => student.risk_level === 'low').length,
    }),
    [students]
  );

  const sections = useMemo(
    () => [...new Set(students.map((student) => student.section_name))].sort(),
    [students]
  );

  const visible = useMemo(() => {
    const column = COLUMNS.find((candidate) => candidate.id === sort.column) ?? COLUMNS[5];
    const direction = sort.direction === 'asc' ? 1 : -1;

    return students
      .filter(
        (student) =>
          (sectionFilter === 'all' || student.section_name === sectionFilter) &&
          (levelFilter === 'all' || student.risk_level === levelFilter)
      )
      .sort((a, b) => {
        const left = column.value(a);
        const right = column.value(b);
        if (typeof left === 'string' && typeof right === 'string') {
          return left.localeCompare(right) * direction;
        }
        return (left - right) * direction;
      });
  }, [students, sort, sectionFilter, levelFilter]);

  const onSort = (columnId) =>
    setSort((current) =>
      current.column === columnId
        ? { column: columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // Text sorts read best ascending; every measure reads worst-first.
          { column: columnId, direction: columnId === 'student_hash' || columnId === 'section_name' ? 'asc' : 'desc' }
    );

  const selectClass =
    'focus-ring h-8 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[13px] text-slate-200 transition-colors hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-600';

  return (
    <div className="space-y-4">
      <PrivacyNotice />

      {/* Hidden File Input for .csv and .json student data */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv,.json"
        className="hidden"
      />

      {/* --- Top bar ------------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={Radar}
          title="Student radar"
          subtitle="Academic risk signals across a course's sections. The audit returns flagged records only, so these counts describe the flagged cohort rather than the whole class."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="critical" dot>
                Critical {counts.high}
              </Badge>
              <Badge variant="warning" dot>
                Moderate {counts.medium}
              </Badge>
              <Badge variant="pass" dot>
                Safe {counts.low}
              </Badge>
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Course
              </span>
              <select
                value={courseId ?? ''}
                disabled={coursesQuery.isPending}
                onChange={(event) =>
                  setCourseId(event.target.value ? Number(event.target.value) : null)
                }
                className={cn(selectClass, 'w-full')}
              >
                <option value="">Select a course…</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.title}
                  </option>
                ))}
              </select>
            </label>

            <Button
              size="md"
              icon={Play}
              loading={isFetching}
              disabled={courseId === null || isFetching}
              onClick={() => {
                setSelected(null);
                setActiveCohortTitle(null);
                setSubmittedCourseId(courseId);
              }}
            >
              Run Risk Analysis
            </Button>
          </div>

          {/* Action Bar: File Upload + 1-Click Cohort Testing */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Student Data (.csv / .json)
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={AlertCircle}
              loading={uploading}
              onClick={() => loadSample('high-risk')}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            >
              High-Risk Cohort Sample
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={Check}
              loading={uploading}
              onClick={() => loadSample('safe')}
              className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            >
              Safe Cohort Sample
            </Button>
          </div>

          {/* Template Download Links & Active Badge */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-400">
            <span className="font-medium text-slate-300">Templates:</span>
            <a
              href="/samples/students_high_risk_cohort.csv"
              download="students_high_risk_cohort.csv"
              className="inline-flex items-center gap-1 font-mono text-rose-400/90 underline decoration-rose-400/40 hover:text-rose-300"
            >
              <Download className="h-3 w-3" /> High-Risk (.csv)
            </a>
            <span className="text-slate-600">·</span>
            <a
              href="/samples/students_safe_balanced_cohort.csv"
              download="students_safe_balanced_cohort.csv"
              className="inline-flex items-center gap-1 font-mono text-emerald-400/90 underline decoration-emerald-400/40 hover:text-emerald-300"
            >
              <Download className="h-3 w-3" /> Safe (.csv)
            </a>
            {activeCohortTitle ? (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-semibold text-amber-400">{activeCohortTitle}</span>
              </>
            ) : null}
          </div>

          {loadError ? <p className="text-[11px] text-rose-300">{loadError}</p> : null}

          {students.length ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-800 pt-3">
              <label>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Section
                </span>
                <select
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">All sections</option>
                  {sections.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Risk level
                </span>
                <select
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">All levels</option>
                  {Object.values(LEVELS).map((level) => (
                    <option key={level.key} value={level.key}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="pb-1.5 text-[11px] text-slate-500">
                Showing {visible.length} of {students.length} flagged records.
              </p>
            </div>
          ) : null}

          {coursesQuery.isError ? (
            <p className="mt-2 text-[11px] text-rose-300">
              Could not load the course list: {coursesQuery.error?.message}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* --- Results ------------------------------------------------------ */}
      {!submittedCourseId ? (
        <Card>
          <EmptyState
            icon={UserSearch}
            title="No analysis run yet"
            description="Pick a course and run the risk analysis. Results are pseudonymous academic indicators, ranked by risk score."
          />
        </Card>
      ) : auditQuery.isError ? (
        <Card>
          <EmptyState
            tone="critical"
            icon={AlertCircle}
            title="The risk analysis failed"
            description={auditQuery.error?.message ?? 'The request did not complete.'}
            actionLabel="Try again"
            onAction={() => auditQuery.refetch()}
          />
        </Card>
      ) : !report ? (
        <Card>
          <CardHeader icon={Radar} title="Scanning cohort" subtitle="Scoring academic indicators…" />
          <SkeletonTable rows={6} cols={8} />
        </Card>
      ) : !students.length ? (
        <Card>
          <EmptyState
            icon={Check}
            title="No students flagged"
            description="No record in this course crossed a risk threshold this term."
          />
        </Card>
      ) : !visible.length ? (
        <Card>
          <EmptyState
            icon={UserSearch}
            title="No records match these filters"
            description="Widen the section or risk level filter to see the rest of the cohort."
            actionLabel="Clear filters"
            onAction={() => {
              setSectionFilter('all');
              setLevelFilter('all');
            }}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            icon={Radar}
            title="Flagged records"
            subtitle="Click a row for the risk factor breakdown."
            action={
              <span className="text-[11px] tabular-nums text-slate-500">
                {report.at_risk_count} at risk
              </span>
            }
          />
          {isWide ? (
            <StudentTable
              students={visible}
              sort={sort}
              onSort={onSort}
              onSelect={setSelected}
              selectedHash={selected?.student_hash}
            />
          ) : (
            <StudentCards students={visible} onSelect={setSelected} />
          )}
        </Card>
      )}

      {selected ? <DetailDrawer student={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
