import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCheck,
  Braces,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Files,
  FileSearch,
  ListTree,
  Play,
  Plus,
  Scale,
  Sigma,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

import { BLOOM_LEVELS, ENDPOINTS, QUERY_KEYS } from '../api/contract.js';
import { get, post } from '../api/client.js';
import { cn } from '../lib/cn.js';
import { num, pct } from '../lib/format.js';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import {
  AiSummaryCard,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
} from '../components/ui/index.js';

/* ==========================================================================
 * Constants
 * ======================================================================= */

const DEFAULT_CLOS = ['CLO1', 'CLO2', 'CLO3', 'CLO4'];

const BLOOM_LABELS = {
  C1: 'C1 Remember',
  C2: 'C2 Understand',
  C3: 'C3 Apply',
  C4: 'C4 Analyse',
  C5: 'C5 Evaluate',
  C6: 'C6 Create',
};

/**
 * Single-hue ramp for Bloom levels C1 -> C6 using semantic theme tokens.
 */
const BLOOM_RAMP = {
  C1: 'var(--green-50)',
  C2: 'var(--green-200)',
  C3: 'var(--green-500)',
  C4: 'var(--teal-500)',
  C5: 'var(--amber-500)',
  C6: 'var(--green-900)',
};

/** Contract Verdict -> presentation mapping */
const VERDICT_TONES = {
  pass: {
    badge: 'pass',
    label: 'Pass',
    border: 'border-l-pass-border',
    text: 'text-pass-text',
    ring: 'var(--pass-border)',
  },
  warning: {
    badge: 'warning',
    label: 'Warning',
    border: 'border-l-warning-border',
    text: 'text-warning-text',
    ring: 'var(--warning-border)',
  },
  critical: {
    badge: 'critical',
    label: 'Critical',
    border: 'border-l-critical-border',
    text: 'text-critical-text',
    ring: 'var(--critical-border)',
  },
};

const FLAG_ICONS = {
  verb_mismatch: Tag,
  clo_inflation: TrendingUp,
  duplicate_question: Files,
  unfeasible_marks: Scale,
  time_budget: Clock,
};

const AUDIT_STAGES = [
  'Parsing question stems…',
  'Classifying Bloom verbs against the tagged levels…',
  'Matching the draft against past papers…',
  'Checking mark feasibility and time budget…',
  'Composing the moderation summary…',
];

const EMPTY_QUESTION = {
  q_number: '',
  text: '',
  marks: 0,
  assigned_bloom_level: 'C1',
  assigned_clo: DEFAULT_CLOS[0],
};

/* ==========================================================================
 * Editor model
 * ======================================================================= */

let rowSequence = 0;
const withKey = (question) => ({ ...question, _key: `row-${(rowSequence += 1)}` });
const toDraftQuestion = ({ _key, ...question }) => question;

const sumMarks = (questions) =>
  questions.reduce((total, question) => total + (Number(question.marks) || 0), 0);

function parseQuestionsJson(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (failure) {
    return { ok: false, message: failure.message };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, message: 'Expected a JSON array of question objects.' };
  }

  const offender = parsed.findIndex(
    (entry) => entry === null || typeof entry !== 'object' || Array.isArray(entry)
  );
  if (offender !== -1) {
    return { ok: false, message: `Item ${offender + 1} is not an object.` };
  }

  return {
    ok: true,
    questions: parsed.map((entry) =>
      withKey({
        q_number: String(entry.q_number ?? ''),
        text: String(entry.text ?? ''),
        marks: Number(entry.marks) || 0,
        assigned_bloom_level: BLOOM_LEVELS.includes(entry.assigned_bloom_level)
          ? entry.assigned_bloom_level
          : 'C1',
        assigned_clo: String(entry.assigned_clo ?? DEFAULT_CLOS[0]),
      })
    ),
  };
}

function parseCsvQuestions(source) {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, message: 'The uploaded CSV file is empty.' };
  }

  let startIdx = 0;
  if (/q_number|question|bloom/i.test(lines[0])) {
    startIdx = 1;
  }

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        if (inQuotes && line[c + 1] === '"') {
          cur += '"';
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur.trim());

    if (parts.length >= 2) {
      const qNum = parts[0] || String(rows.length + 1);
      const qText = parts[1] || '';
      const marks = Number(parts[2]) || 0;
      const rawBloom = (parts[3] || '').trim().toUpperCase();
      const bloom = BLOOM_LEVELS.includes(rawBloom) ? rawBloom : 'C1';
      const clo = (parts[4] || '').trim() || DEFAULT_CLOS[0];

      rows.push(
        withKey({
          q_number: qNum,
          text: qText,
          marks,
          assigned_bloom_level: bloom,
          assigned_clo: clo,
        })
      );
    }
  }

  if (rows.length === 0) {
    return { ok: false, message: 'No valid question rows found in CSV.' };
  }

  return { ok: true, questions: rows };
}

/* ==========================================================================
 * Left pane — question editor
 * ======================================================================= */

const FIELD_CLASS =
  'focus-ring w-full rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary ' +
  'placeholder:text-text-muted transition-colors hover:border-border-strong';

function QuestionRow({ question, index, clos, verdict, flagCount, onChange, onRemove }) {
  const tone = verdict ? VERDICT_TONES[verdict] : null;

  return (
    <li
      className={cn(
        'rounded-lg border border-l-2 border-border-default bg-bg-surface p-3 transition-colors',
        tone ? tone.border : 'border-l-border-default'
      )}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-20 shrink-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">No.</span>
          <input
            value={question.q_number}
            onChange={(event) => onChange(index, { q_number: event.target.value })}
            placeholder="2(a)"
            className={FIELD_CLASS}
          />
        </label>

        <label className="w-20 shrink-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">Marks</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={question.marks}
            onChange={(event) => onChange(index, { marks: Number(event.target.value) })}
            className={cn(FIELD_CLASS, 'tabular-nums')}
          />
        </label>

        <label className="min-w-[7.5rem] flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">Bloom</span>
          <select
            value={question.assigned_bloom_level}
            onChange={(event) => onChange(index, { assigned_bloom_level: event.target.value })}
            className={FIELD_CLASS}
          >
            {BLOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {BLOOM_LABELS[level]}
              </option>
            ))}
          </select>
        </label>

        <label className="w-24 shrink-0">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">CLO</span>
          <select
            value={question.assigned_clo}
            onChange={(event) => onChange(index, { assigned_clo: event.target.value })}
            className={FIELD_CLASS}
          >
            {clos.map((clo) => (
              <option key={clo} value={clo}>
                {clo}
              </option>
            ))}
          </select>
        </label>

        <Button
          variant="ghost"
          size="md"
          icon={Trash2}
          onClick={() => onRemove(index)}
          aria-label={`Remove question ${question.q_number || index + 1}`}
          className="shrink-0"
        />
      </div>

      <textarea
        value={question.text}
        onChange={(event) => onChange(index, { text: event.target.value })}
        rows={3}
        placeholder="Question stem…"
        className={cn(FIELD_CLASS, 'mt-2 resize-y leading-relaxed')}
      />

      {tone ? (
        <p className={cn('mt-2 flex items-center gap-1.5 text-[11px]', tone.text)}>
          <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Moderation: {tone.label}
          {flagCount ? ` · ${flagCount} ${flagCount === 1 ? 'flag' : 'flags'}` : ''}
        </p>
      ) : null}
    </li>
  );
}

function JsonEditor({ value, onChange, validity }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {validity.ok ? (
          <Badge variant="pass" dot>
            Valid JSON · {validity.count} {validity.count === 1 ? 'question' : 'questions'}
          </Badge>
        ) : (
          <Badge variant="critical" dot>
            Invalid JSON
          </Badge>
        )}
        {!validity.ok ? (
          <span className="min-w-0 truncate text-[11px] text-critical-text">{validity.message}</span>
        ) : (
          <span className="text-[11px] text-text-muted">Parsed into the editor as you type.</span>
        )}
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        rows={22}
        aria-label="Questions as JSON"
        className={cn(
          'focus-ring w-full resize-y rounded-lg border bg-bg-surface p-3 font-mono text-[12px] leading-relaxed text-text-primary',
          validity.ok ? 'border-border-default' : 'border-critical-border'
        )}
      />
    </div>
  );
}

function MarkTotalFooter({ questions, declaredTotal }) {
  const total = sumMarks(questions);
  const known = typeof declaredTotal === 'number';
  const matches = known && Math.abs(total - declaredTotal) < 0.001;
  const delta = known ? total - declaredTotal : 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        !known
          ? 'border-border-default bg-bg-subtle'
          : matches
            ? 'border-pass-border bg-pass-fill'
            : 'border-critical-border bg-critical-fill'
      )}
    >
      <div className="flex items-center gap-2.5">
        {known ? (
          matches ? (
            <Check className="h-4 w-4 text-pass-text" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <X className="h-4 w-4 text-critical-text" strokeWidth={2.5} aria-hidden="true" />
          )
        ) : (
          <Sigma className="h-4 w-4 text-text-muted" strokeWidth={2} aria-hidden="true" />
        )}
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Marks on the paper</div>
          <div
            className={cn(
              'text-lg font-semibold tabular-nums',
              !known ? 'text-text-primary' : matches ? 'text-pass-text' : 'text-critical-text'
            )}
          >
            {num(total, 1)}
            <span className="text-sm font-normal text-text-muted">
              {' '}
              / {known ? num(declaredTotal, 1) : '—'} declared
            </span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </div>
        {known && !matches ? (
          <div className="text-[12px] font-medium tabular-nums text-critical-text">
            {delta > 0 ? '+' : ''}
            {num(delta, 1)} against the declared total
          </div>
        ) : (
          <div className="text-[12px] text-text-muted">
            {known ? 'Mark sum reconciles' : 'Load an exam to compare'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
 * Right pane — scorecard
 * ======================================================================= */

function overallVerdict(report) {
  const verdicts = (report.questions ?? []).map((question) => question.verdict);
  if (!report.mark_sum_valid || verdicts.includes('critical')) return 'critical';
  if (verdicts.includes('warning') || report.cognitive_balance?.verdict === 'warning') {
    return 'warning';
  }
  return 'pass';
}

function ScorecardHeader({ report, exam }) {
  const verdict = overallVerdict(report);
  const tone = VERDICT_TONES[verdict];
  const sumValid = report.mark_sum_valid;

  return (
    <Card>
      <CardHeader
        icon={BadgeCheck}
        title="Moderation scorecard"
        subtitle={
          exam ? `${exam.course_code} · ${exam.semester} ${exam.exam_type} (${exam.status})` : undefined
        }
        action={
          <Badge variant={tone.badge} dot>
            {tone.label}
          </Badge>
        }
      />
      <CardBody className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Questions</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-text-heading">
            {report.questions?.length ?? 0}
          </div>
        </div>

        <div
          className={cn(
            'rounded-lg border px-3 py-2 sm:col-span-2',
            sumValid ? 'border-pass-border bg-pass-fill' : 'border-critical-border bg-critical-fill'
          )}
        >
          <div className="text-[11px] uppercase tracking-wide text-text-muted">Mark sum</div>
          <div className="mt-0.5 flex items-center gap-2">
            {sumValid ? (
              <Check className="h-4 w-4 shrink-0 text-pass-text" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-critical-text" strokeWidth={2.5} aria-hidden="true" />
            )}
            <span
              className={cn(
                'text-xl font-semibold tabular-nums',
                sumValid ? 'text-pass-text' : 'text-critical-text'
              )}
            >
              {num(report.calculated_total, 1)}
              <span className="text-sm font-normal text-text-muted">
                {' '}
                calculated / {num(report.declared_total, 1)} declared
              </span>
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function BloomAlignmentGauge({ questions }) {
  const total = questions?.length ?? 0;
  const matched = (questions ?? []).filter(
    (question) => question.detected_bloom_level === question.assigned_bloom_level
  ).length;
  const percentage = total ? (matched / total) * 100 : 0;

  const verdict = percentage >= 90 ? 'pass' : percentage >= 70 ? 'warning' : 'critical';
  const tone = VERDICT_TONES[verdict];

  return (
    <Card className="flex-1">
      <CardHeader
        icon={ListTree}
        title="Bloom alignment"
        subtitle="Detected level vs the level the paper claims"
      />
      <CardBody>
        <div className="relative mx-auto h-44 w-44">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={[{ name: 'aligned', value: percentage, fill: tone.ring }]}
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              barSize={14}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                background={{ fill: 'var(--bg-subtle)' }}
                dataKey="value"
                cornerRadius={7}
                isAnimationActive={false}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-3xl font-semibold tabular-nums leading-none', tone.text)}>
              {pct(percentage, 0)}
            </span>
            <span className="mt-1 text-[11px] text-text-muted">aligned</span>
          </div>
        </div>

        <p className="mt-3 text-center text-[12px] text-text-secondary">
          <span className="tabular-nums text-text-heading font-medium">
            {matched} of {total}
          </span>{' '}
          questions carry the Bloom level their verbs actually demand.
        </p>
      </CardBody>
    </Card>
  );
}

function CognitiveDemandHeatmap({ questions, balance }) {
  const segments = useMemo(() => {
    const marksByLevel = Object.fromEntries(BLOOM_LEVELS.map((level) => [level, 0]));
    for (const question of questions ?? []) {
      const level = question.assigned_bloom_level;
      if (level in marksByLevel) marksByLevel[level] += Number(question.marks) || 0;
    }
    const total = Object.values(marksByLevel).reduce((sum, marks) => sum + marks, 0);
    return BLOOM_LEVELS.map((level) => ({
      level,
      marks: marksByLevel[level],
      share: total ? (marksByLevel[level] / total) * 100 : 0,
    }));
  }, [questions]);

  const thin = (balance?.higher_order_pct ?? 0) < 30;

  return (
    <Card className="flex-1">
      <CardHeader
        icon={Scale}
        title="Cognitive demand"
        subtitle="Marks allocated per Bloom level across the paper"
        action={
          thin ? (
            <Badge variant="warning" dot>
              Higher-order below 30%
            </Badge>
          ) : null
        }
      />
      <CardBody>
        <div className="flex h-7 w-full overflow-hidden rounded-lg border border-border-default bg-bg-subtle">
          {segments.map((segment) =>
            segment.share > 0 ? (
              <div
                key={segment.level}
                title={`${segment.level} — ${num(segment.marks, 0)} marks (${pct(segment.share, 1)})`}
                style={{ width: `${segment.share}%`, backgroundColor: BLOOM_RAMP[segment.level] }}
                className="flex items-center justify-center text-[10px] font-semibold text-text-heading"
              >
                {segment.share >= 8 ? segment.level : null}
              </div>
            ) : null
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment) => (
            <span key={segment.level} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: BLOOM_RAMP[segment.level] }}
                aria-hidden="true"
              />
              {segment.level}
              <span className="tabular-nums text-text-secondary">{num(segment.marks, 0)}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Lower-order C1–C3</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
              {pct(balance?.lower_order_pct, 1)}
            </div>
          </div>
          <div className="rounded-lg border border-border-default bg-bg-subtle px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Higher-order C4–C6</div>
            <div
              className={cn(
                'mt-0.5 text-lg font-semibold tabular-nums',
                thin ? 'text-warning-text' : 'text-text-primary'
              )}
            >
              {pct(balance?.higher_order_pct, 1)}
            </div>
          </div>
        </div>

        {thin ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-fill px-3 py-2 text-[12px] leading-relaxed text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Under 30% of the marks reach C4 and above. The paper cannot evidence the higher-order
            outcomes it is meant to assess.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function LintRow({ question, expanded, onToggle }) {
  const tone = VERDICT_TONES[question.verdict] ?? VERDICT_TONES.pass;
  const bloomDrift = question.detected_bloom_level !== question.assigned_bloom_level;

  return (
    <li className={cn('border-l-2 bg-bg-surface', tone.border)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="focus-ring flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        <span className="w-12 shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-text-primary">
          {question.q_number}
        </span>

        <span
          className={cn(
            'min-w-0 flex-1 text-[13px] leading-relaxed text-text-secondary',
            !expanded && 'line-clamp-2'
          )}
        >
          {question.text}
        </span>

        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-[12px] tabular-nums text-text-muted">{num(question.marks, 0)}m</span>
          {question.flags?.length ? (
            <span className={cn('text-[11px] tabular-nums', tone.text)}>
              {question.flags.length}
            </span>
          ) : null}
          <Badge variant={tone.badge}>{tone.label}</Badge>
          <ChevronDown
            className={cn('h-4 w-4 text-text-muted transition-transform', expanded && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border-default px-3 py-3 pl-[3.75rem]">
          <p className="text-[13px] leading-relaxed text-text-primary">{question.text}</p>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-text-muted">Tagged</span>
            <Badge>{BLOOM_LABELS[question.assigned_bloom_level] ?? question.assigned_bloom_level}</Badge>
            <span className="text-text-muted">Detected</span>
            <Badge variant={bloomDrift ? tone.badge : 'neutral'}>
              {BLOOM_LABELS[question.detected_bloom_level] ?? question.detected_bloom_level}
            </Badge>
          </div>

          {question.flags?.length ? (
            <ul className="space-y-2">
              {question.flags.map((flag) => {
                const Icon = FLAG_ICONS[flag.type] ?? AlertTriangle;
                return (
                  <li key={`${flag.type}-${flag.message}`} className="flex items-start gap-2">
                    <Icon
                      className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.text)}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        {flag.type.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[12px] leading-relaxed text-text-secondary">{flag.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-[12px] text-pass-text">
              <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              No defects found on this question.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function LintReport({ questions }) {
  const defective = (questions ?? []).filter((question) => question.verdict !== 'pass');
  const [expanded, setExpanded] = useState(
    () => new Set(defective.map((question) => question.q_number))
  );

  const toggle = (qNumber) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(qNumber)) next.delete(qNumber);
      else next.add(qNumber);
      return next;
    });

  return (
    <Card>
      <CardHeader
        icon={FileSearch}
        title="Lint report"
        subtitle="One row per question. Flagged questions open by default."
        action={
          <span className="text-[11px] tabular-nums text-text-muted">
            {defective.length} of {questions?.length ?? 0} flagged
          </span>
        }
      />
      <ul className="divide-y divide-border-default">
        {(questions ?? []).map((question) => (
          <LintRow
            key={question.q_number}
            question={question}
            expanded={expanded.has(question.q_number)}
            onToggle={() => toggle(question.q_number)}
          />
        ))}
      </ul>
    </Card>
  );
}

function DuplicateCard({ duplicate, draftText }) {
  const [showRewrite, setShowRewrite] = useState(false);
  const { copiedKey, copy } = useCopyToClipboard();

  const overlap = Math.max(0, Math.min(1, duplicate.similarity_score ?? 0)) * 100;
  const severe = overlap > 80;

  return (
    <article
      className={cn(
        'rounded-lg border p-3',
        severe ? 'border-critical-border bg-critical-fill' : 'border-warning-border bg-warning-fill'
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-text-heading">
          <Files className={cn('h-3.5 w-3.5', severe ? 'text-critical-text' : 'text-warning-text')} strokeWidth={1.75} />
          Question {duplicate.draft_q} repeats {duplicate.matched_year}
        </h3>
        <Badge variant={severe ? 'critical' : 'warning'} dot>
          {pct(overlap, 0)} overlap
        </Badge>
      </header>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border-default bg-bg-subtle p-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
            Draft · Q{duplicate.draft_q}
          </div>
          <p className="text-[12px] leading-relaxed text-text-secondary">
            {draftText ?? 'The draft question is not in the audited question list.'}
          </p>
        </div>
        <div className="rounded-lg border border-border-default bg-bg-subtle p-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
            {duplicate.matched_year}
          </div>
          <p className="text-[12px] leading-relaxed text-text-secondary">{duplicate.matched_text}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-text-muted">Overlap severity</span>
          <span className={cn('tabular-nums font-semibold', severe ? 'text-critical-text' : 'text-warning-text')}>
            {pct(overlap, 0)}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-sm bg-bg-subtle border border-border-default"
          role="meter"
          aria-valuenow={Math.round(overlap)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overlap severity"
        >
          <div
            className={cn('h-full rounded-sm', severe ? 'bg-critical-border' : 'bg-warning-border')}
            style={{ width: `${overlap}%` }}
          />
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowRewrite((value) => !value)}
          aria-expanded={showRewrite}
          className="focus-ring flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-text-heading"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', showRewrite && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Rewrite suggestion
        </button>

        {showRewrite ? (
          <div className="mt-2 rounded-lg border border-border-default bg-bg-subtle p-2.5">
            <p className="text-[12px] leading-relaxed text-text-primary">
              {duplicate.rewrite_suggestion}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={copiedKey === duplicate.draft_q ? Check : Copy}
              onClick={() => copy(duplicate.rewrite_suggestion, duplicate.draft_q)}
              className="mt-2"
            >
              {copiedKey === duplicate.draft_q ? 'Copied' : 'Copy rewrite'}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DuplicationAlerts({ duplicates, questions }) {
  return (
    <Card>
      <CardHeader
        icon={Files}
        title="Duplication alerts"
        subtitle="Draft questions matched against papers already in circulation"
        action={
          <span className="text-[11px] tabular-nums text-text-muted">{duplicates?.length ?? 0}</span>
        }
      />
      {duplicates?.length ? (
        <CardBody className="space-y-3">
          {duplicates.map((duplicate) => (
            <DuplicateCard
              key={`${duplicate.draft_q}-${duplicate.matched_year}`}
              duplicate={duplicate}
              draftText={
                questions?.find((question) => question.q_number === duplicate.draft_q)?.text
              }
            />
          ))}
        </CardBody>
      ) : (
        <EmptyState
          icon={Check}
          title="No duplicated questions"
          description="Nothing on this draft matches a past paper closely enough to flag."
        />
      )}
    </Card>
  );
}

/* ==========================================================================
 * Scorecard states
 * ======================================================================= */

function ScorecardSkeleton({ stage }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={BadgeCheck} title="Moderation scorecard" subtitle={stage} />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14 sm:col-span-2" />
        </CardBody>
      </Card>

      <div className="flex flex-col gap-4 xl:flex-row">
        <Card className="flex-1">
          <CardHeader icon={ListTree} title="Bloom alignment" />
          <CardBody className="flex flex-col items-center">
            <Skeleton className="h-44 w-44 rounded-full" />
            <Skeleton className="mt-3 h-3 w-3/4" />
          </CardBody>
        </Card>
        <Card className="flex-1">
          <CardHeader icon={Scale} title="Cognitive demand" />
          <CardBody className="space-y-3">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader icon={FileSearch} title="Lint report" subtitle={stage} />
        <div className="divide-y divide-border-default">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ==========================================================================
 * Page
 * ======================================================================= */

export default function ExamModerationPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('structured');
  const [questions, setQuestions] = useState([]);
  const [jsonDraft, setJsonDraft] = useState('[]');
  const [exam, setExam] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [runCount, setRunCount] = useState(0);

  const examsQuery = useQuery({ queryKey: QUERY_KEYS.exams, queryFn: () => get(ENDPOINTS.exams) });

  const auditMutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.auditExamModeration, payload),
    onSuccess: () => {
      setRunCount((c) => c + 1);
    },
  });

  const report = auditMutation.data;
  const isAuditing = auditMutation.isPending;

  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isAuditing) return undefined;
    setStage(0);
    const timer = setInterval(
      () => setStage((current) => Math.min(current + 1, AUDIT_STAGES.length - 1)),
      300
    );
    return () => clearInterval(timer);
  }, [isAuditing]);

  const jsonValidity = useMemo(() => {
    if (mode !== 'json') return { ok: true, count: questions.length };
    const result = parseQuestionsJson(jsonDraft);
    return result.ok
      ? { ok: true, count: result.questions.length }
      : { ok: false, message: result.message };
  }, [mode, jsonDraft, questions.length]);

  const serialize = (rows) => JSON.stringify(rows.map(toDraftQuestion), null, 2);

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'json') setJsonDraft(serialize(questions));
    setMode(next);
  };

  const onJsonChange = (value) => {
    setJsonDraft(value);
    const result = parseQuestionsJson(value);
    if (result.ok) setQuestions(result.questions);
  };

  const updateQuestion = (index, patch) =>
    setQuestions((current) =>
      current.map((question, position) => (position === index ? { ...question, ...patch } : question))
    );

  const removeQuestion = (index) =>
    setQuestions((current) => current.filter((_, position) => position !== index));

  const addQuestion = () =>
    setQuestions((current) => [
      ...current,
      withKey({ ...EMPTY_QUESTION, q_number: String(current.length + 1) }),
    ]);

  const runAudit = (customQuestions = null, customTotal = null) => {
    const qList = customQuestions ?? questions;
    const declaredTotal = customTotal ?? (exam?.total_marks ?? 70);

    if (qList.length > 0) {
      auditMutation.mutate({
        questions: qList.map(toDraftQuestion),
        declared_total: declaredTotal,
        course_id: exam?.course_id ?? 1,
      });
    } else if (exam?.id) {
      auditMutation.mutate({ exam_id: exam.id });
    }
  };

  const loadDemoExam = async (autoRun = false) => {
    setLoadError(null);
    setLoadingDraft(true);
    try {
      const exams = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.exams,
        queryFn: () => get(ENDPOINTS.exams),
      });
      const draft = exams.find((candidate) => candidate.status === 'draft') ?? exams[0];
      if (!draft) throw new Error('No exam is available to load.');

      const loaded = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.examQuestions(draft.id),
        queryFn: () => get(ENDPOINTS.examQuestions(draft.id)),
      });

      const rows = loaded.map(withKey);
      setExam(draft);
      setQuestions(rows);
      setJsonDraft(serialize(rows));

      if (autoRun) {
        auditMutation.mutate({ exam_id: draft.id });
      }
    } catch (failure) {
      setLoadError(failure.message ?? 'Could not load the demo exam.');
    } finally {
      setLoadingDraft(false);
    }
  };

  const loadSample = async (sampleType) => {
    setLoadError(null);
    setLoadingDraft(true);
    try {
      const fileName =
        sampleType === 'defective'
          ? '/samples/sample_exam_defective.json'
          : '/samples/sample_exam_balanced.json';
      const res = await fetch(fileName);
      if (!res.ok) throw new Error(`Could not fetch sample file: ${fileName}`);
      const data = await res.json();
      const rows = data.map(withKey);
      const syntheticExam = {
        id: null,
        course_code: 'CSE 2101',
        course_id: 1,
        semester: 'Fall 2025',
        exam_type: sampleType === 'defective' ? 'Draft (Planted Anomalies)' : 'Draft (Balanced)',
        status: 'draft',
        total_marks: 70,
      };
      setExam(syntheticExam);
      setQuestions(rows);
      setJsonDraft(serialize(rows));

      auditMutation.mutate({
        questions: rows.map(toDraftQuestion),
        declared_total: 70,
        course_id: 1,
      });
    } catch (err) {
      setLoadError(err.message ?? 'Could not load sample.');
    } finally {
      setLoadingDraft(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') return;

      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const result = isCsv ? parseCsvQuestions(content) : parseQuestionsJson(content);

      if (!result.ok) {
        setLoadError(`Failed to parse ${file.name}: ${result.message}`);
        return;
      }

      const rows = result.questions;
      const syntheticExam = {
        id: null,
        course_code: 'CSE 2101',
        course_id: 1,
        semester: 'Fall 2025',
        exam_type: `Uploaded (${file.name})`,
        status: 'draft',
        total_marks: 70,
      };
      setExam(syntheticExam);
      setQuestions(rows);
      setJsonDraft(serialize(rows));

      auditMutation.mutate({
        questions: rows.map(toDraftQuestion),
        declared_total: 70,
        course_id: 1,
      });
    };

    reader.onerror = () => {
      setLoadError('Failed to read file from disk.');
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autorun') === '1') {
      loadDemoExam(true);
    }
  }, []);

  const clos = useMemo(() => {
    const used = questions.map((question) => question.assigned_clo).filter(Boolean);
    return [...new Set([...DEFAULT_CLOS, ...used])].sort();
  }, [questions]);

  const verdictByQuestion = useMemo(() => {
    const map = new Map();
    for (const question of report?.questions ?? []) {
      map.set(question.q_number, { verdict: question.verdict, flags: question.flags?.length ?? 0 });
    }
    return map;
  }, [report]);

  const canRun = (Boolean(exam) || questions.length > 0) && !auditMutation.isPending && !loadingDraft;

  return (
    <div className="grid gap-4 lg:grid-cols-[45fr_55fr] lg:items-start">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".json,.csv"
        className="hidden"
      />

      {/* ================= LEFT PANE — editor ============================= */}
      <Card>
        <CardHeader
          icon={Braces}
          title="Question editor"
          subtitle={
            exam
              ? `${exam.course_code} · ${exam.semester} ${exam.exam_type}`
              : 'Upload an exam paper, pick a sample, or draft from scratch.'
          }
          action={
            <div className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-subtle p-0.5">
              {['structured', 'json'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => switchMode(option)}
                  aria-pressed={mode === option}
                  className={cn(
                    'focus-ring rounded px-2 py-1 text-[12px] font-medium transition-colors',
                    mode === option
                      ? 'bg-bg-surface text-action-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  {option === 'structured' ? 'Structured' : 'Raw JSON'}
                </button>
              ))}
            </div>
          }
        />

        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Exam (.json / .csv)
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={AlertTriangle}
              loading={loadingDraft}
              onClick={() => loadSample('defective')}
              className="border-warning-border text-warning-text hover:bg-warning-fill"
            >
              Defective Sample
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={Check}
              loading={loadingDraft}
              onClick={() => loadSample('balanced')}
              className="border-pass-border text-pass-text hover:bg-pass-fill"
            >
              Balanced Sample
            </Button>

            <Button
              variant="ghost"
              size="sm"
              icon={FileSearch}
              loading={loadingDraft}
              onClick={() => loadDemoExam(false)}
              disabled={examsQuery.isPending}
            >
              Seeded Exam
            </Button>

            {mode === 'structured' ? (
              <Button variant="ghost" size="sm" icon={Plus} onClick={addQuestion}>
                Add question
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-subtle px-3 py-1.5 text-[11px] text-text-muted">
            <span className="font-medium text-text-secondary">Templates:</span>
            <a
              href="/samples/sample_exam_defective.csv"
              download="sample_exam_defective.csv"
              className="inline-flex items-center gap-1 font-mono text-warning-text underline decoration-warning-border hover:opacity-80"
            >
              <Download className="h-3 w-3" /> Defective (.csv)
            </a>
            <span className="text-text-muted">·</span>
            <a
              href="/samples/sample_exam_balanced.csv"
              download="sample_exam_balanced.csv"
              className="inline-flex items-center gap-1 font-mono text-pass-text underline decoration-pass-border hover:opacity-80"
            >
              <Download className="h-3 w-3" /> Balanced (.csv)
            </a>
            <span className="text-text-muted">·</span>
            <a
              href="/samples/sample_exam_defective.json"
              download="sample_exam_defective.json"
              className="inline-flex items-center gap-1 font-mono text-text-secondary underline hover:text-text-heading"
            >
              <Download className="h-3 w-3" /> Defective (.json)
            </a>
          </div>

          {loadError ? <p className="text-[11px] text-critical-text">{loadError}</p> : null}

          {mode === 'json' ? (
            <JsonEditor value={jsonDraft} onChange={onJsonChange} validity={jsonValidity} />
          ) : questions.length ? (
            <ul className="space-y-2">
              {questions.map((question, index) => {
                const echo = verdictByQuestion.get(question.q_number);
                return (
                  <QuestionRow
                    key={question._key}
                    question={question}
                    index={index}
                    clos={clos}
                    verdict={echo?.verdict}
                    flagCount={echo?.flags}
                    onChange={updateQuestion}
                    onRemove={removeQuestion}
                  />
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Braces}
              title="No questions loaded yet"
              description="Upload a CSV/JSON exam paper, load a ready sample to test planted defects, or add questions manually."
              actionLabel="Load Defective Sample"
              onAction={() => loadSample('defective')}
            />
          )}
        </CardBody>

        <div className="space-y-3 border-t border-border-default p-4">
          <MarkTotalFooter questions={questions} declaredTotal={exam?.total_marks ?? 70} />

          <Button
            size="lg"
            icon={Play}
            className="w-full"
            loading={auditMutation.isPending}
            disabled={!canRun}
            onClick={() => runAudit()}
          >
            Run Moderation Audit
          </Button>

          {!exam && questions.length === 0 ? (
            <p className="text-center text-[11px] text-text-muted">
              Upload a paper or load a sample to run real-time moderation.
            </p>
          ) : null}
        </div>
      </Card>

      {/* ================= RIGHT PANE — scorecard ========================= */}
      <div className="space-y-4">
        {!report && !auditMutation.isPending && !auditMutation.isError ? (
          <Card>
            <EmptyState
              icon={BadgeCheck}
              title="No moderation run yet"
              description="Upload an exam paper (.json/.csv) or click one of the sample buttons on the left to see real-time Bloom verification, past-paper duplicate alerts, and mark feasibility."
            />
          </Card>
        ) : auditMutation.isError ? (
          <Card>
            <EmptyState
              tone="critical"
              icon={AlertTriangle}
              title="The moderation audit failed"
              description={auditMutation.error?.message ?? 'The request did not complete.'}
              actionLabel="Try again"
              onAction={() => runAudit()}
            />
          </Card>
        ) : auditMutation.isPending ? (
          <ScorecardSkeleton stage={AUDIT_STAGES[stage]} />
        ) : (
          <>
            <ScorecardHeader report={report} exam={exam} />

            <div className="flex flex-col gap-4 xl:flex-row">
              <BloomAlignmentGauge questions={report.questions} />
              <CognitiveDemandHeatmap
                questions={report.questions}
                balance={report.cognitive_balance}
              />
            </div>

            <LintReport key={`run-${runCount}`} questions={report.questions} />
            <DuplicationAlerts duplicates={report.duplicates} questions={report.questions} />
            <AiSummaryCard
              summary={report.ai_summary}
              meta={exam ? `${exam.course_code} · ${exam.semester} ${exam.exam_type}` : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
