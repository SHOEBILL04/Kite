import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSpreadsheet,
  Grid,
  Info,
  Layers,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { del, get, post } from '../api/client.js';
import {
  ENDPOINTS,
  GRADING_BATCH_STATUS_LABELS,
  MIN_SECTIONS_FOR_PARITY,
  QUERY_KEYS,
} from '../api/contract.js';
import { useAuth } from '../hooks/useAuth.js';
import UploadMarksModal from '../components/grading/UploadMarksModal.jsx';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui/index.js';

/**
 * Mark Collection hub.
 *
 * Faculties and Heads of Department can open new exam assessment batches,
 * submit section marks via CSV upload or manual entry, and audit Outcome-Based
 * Education (OBE) Course Learning Outcome (CLO) attainment.
 */

const STATUS_TONE = {
  collecting: { variant: 'warning', icon: Clock },
  ready: { variant: 'pass', icon: CheckCircle2 },
  audited: { variant: 'default', icon: BarChart3 },
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
};

export default function GradingBatches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isHod = user?.role === 'head_of_department';

  const [uploadConfig, setUploadConfig] = useState(null); // { batch, initialMode }
  const [showCreate, setShowCreate] = useState(false);
  const [courseFilter, setCourseFilter] = useState('all');

  const {
    data: batches,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.gradingBatches,
    queryFn: () => get(ENDPOINTS.gradingBatches),
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gradingBatches });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: ({ batchId, submissionId }) =>
      del(ENDPOINTS.deleteGradingSubmission(batchId, submissionId)),
    onSuccess: invalidate,
  });

  const courses = useMemo(() => {
    const seen = new Map();
    (batches ?? []).forEach((b) => seen.set(b.course_id, b.course_code));
    return [...seen.entries()].map(([id, code]) => ({ id, code }));
  }, [batches]);

  const visible = useMemo(() => {
    if (courseFilter === 'all') return batches ?? [];
    return (batches ?? []).filter((b) => String(b.course_id) === String(courseFilter));
  }, [batches, courseFilter]);

  return (
    <div className="space-y-6 text-primary">
      {/* Header */}
      <section className="flex flex-col gap-4 rounded-xl border border-border-default bg-surface p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 text-action-primary shadow-2xs">
              <Upload className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-heading sm:text-xl">
              Mark Collection & Assessment Hub
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted max-w-2xl">
            Create new exam assessments, submit student marks (via CSV or manual entry), and monitor
            Outcome-Based Education (OBE) Course Learning Outcome (CLO) attainment across sections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {courses.length > 1 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="h-8.5 rounded-lg border border-border-default bg-surface px-3 text-xs font-medium text-primary focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus shadow-2xs"
              aria-label="Filter by course"
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          )}

          {/* Enabled for both faculty and HOD */}
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            New Exam / Assessment
          </Button>
        </div>
      </section>

      {/* States */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : isError ? (
        <Card padded>
          <EmptyState
            icon={X}
            title="Could not load grading batches"
            description={error?.message ?? 'The request failed.'}
            action={
              <Button size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={FileSpreadsheet}
            title="No assessments opened yet"
            description="Create a new exam or assessment for your course, and teachers can upload or enter marks for their sections."
            action={
              <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
                New Exam / Assessment
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {visible.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              isHod={isHod}
              onUpload={(mode = 'csv') => setUploadConfig({ batch, initialMode: mode })}
              onDelete={(submissionId) =>
                deleteMutation.mutate({ batchId: batch.id, submissionId })
              }
              deleting={deleteMutation.isPending}
              onAudit={() => navigate(`/grading-parity?batch=${batch.id}&autorun=1`)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {uploadConfig ? (
        <UploadMarksModal
          open
          batch={uploadConfig.batch}
          initialMode={uploadConfig.initialMode}
          lockedSection={isHod ? null : uploadConfig.batch.my_submission?.section_name ?? null}
          availableSections={
            uploadConfig.batch.total_sections >= 3
              ? ['Section A', 'Section B', 'Section C']
              : ['Section A', 'Section B']
          }
          onClose={() => setUploadConfig(null)}
          onUploaded={() => {
            invalidate();
            queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.myGradingStats(uploadConfig.batch.id),
            });
          }}
        />
      ) : null}

      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
 * BATCH CARD (Unified for both Faculty and Head of Department)
 * ======================================================================= */

function BatchCard({ batch, isHod, onUpload, onDelete, deleting, onAudit }) {
  const tone = STATUS_TONE[batch.status] ?? STATUS_TONE.collecting;
  const canAudit = batch.sections_submitted >= MIN_SECTIONS_FOR_PARITY;
  const submitted = Boolean(batch.my_submission);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.myGradingStats(batch.id),
    queryFn: () => get(ENDPOINTS.myGradingStats(batch.id)),
    enabled: submitted && !isHod,
    retry: false,
  });

  return (
    <Card className="overflow-hidden border border-border-default bg-surface shadow-xs">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default/70 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-heading">
                {batch.course_code} · {batch.assessment_name}
              </h2>
              <Badge variant={tone.variant}>
                {GRADING_BATCH_STATUS_LABELS[batch.status] ?? batch.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {batch.semester} · Total: <span className="font-semibold text-primary">{batch.max_marks} marks</span> · Opened by <span className="font-semibold text-primary">{batch.created_by_name || 'Faculty Member'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Grid}
              onClick={() => onUpload('manual')}
            >
              Enter Marks (Grid)
            </Button>

            <Button
              size="sm"
              icon={Upload}
              onClick={() => onUpload('csv')}
              variant={submitted ? 'ghost' : 'primary'}
            >
              {submitted ? 'Re-upload CSV' : 'Upload CSV'}
            </Button>

            {isHod && (
              <span
                title={
                  canAudit
                    ? 'Run cross-section parity audit'
                    : `Parity requires at least ${MIN_SECTIONS_FOR_PARITY} sections to submit.`
                }
              >
                <Button size="sm" icon={Scale} onClick={onAudit} disabled={!canAudit}>
                  Run Parity Audit
                </Button>
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <SubmissionProgress batch={batch} />

        {/* Alert for faculty if not submitted yet (HIGH CONTRAST) */}
        {!isHod && !submitted && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="font-medium">
              <strong className="font-bold">Attention:</strong> You have not uploaded marks for this assessment yet. Click <em>Enter Marks (Grid)</em> or <em>Upload CSV</em> to submit your section's marks.
            </div>
          </div>
        )}

        {/* Confirmation banner if submitted (HIGH CONTRAST) */}
        {!isHod && submitted && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 shadow-2xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              {batch.my_submission.section_name} submitted — {batch.my_submission.student_count} students on {formatWhen(batch.my_submission.uploaded_at)}
            </span>
          </div>
        )}

        {/* Faculty Own Section Summary Stats */}
        {!isHod && submitted && (
          statsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : stats ? (
            <MySectionSummary stats={stats} />
          ) : null
        )}

        {/* Section Submissions Table for HOD */}
        {isHod && (
          batch.submissions?.length ? (
            <div className="overflow-hidden rounded-lg border border-border-default">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle/70 text-heading">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">Section</th>
                    <th className="px-3 py-2.5 font-bold">Faculty Member</th>
                    <th className="px-3 py-2.5 font-bold">Students</th>
                    <th className="px-3 py-2.5 font-bold">Uploaded Date</th>
                    <th className="px-3 py-2.5 font-bold sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default text-primary">
                  {batch.submissions.map((s) => (
                    <tr key={s.id} className="hover:bg-subtle/30">
                      <td className="px-3 py-2 font-bold text-heading">{s.section_name}</td>
                      <td className="px-3 py-2">{s.faculty_name}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{s.student_count}</td>
                      <td className="px-3 py-2 text-muted">{formatWhen(s.uploaded_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onDelete(s.id)}
                          disabled={deleting}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-border-default bg-subtle/40 px-3.5 py-3 text-xs text-muted">
              No sections have submitted marks for this assessment yet.
            </div>
          )
        )}

        {/* Outcome-Based Education (OBE) CLO Attainment Card */}
        {batch.obe_attainment && batch.obe_attainment.total_students > 0 && (
          <ObeAttainmentCard attainment={batch.obe_attainment} />
        )}
      </div>
    </Card>
  );
}

/* ==========================================================================
 * OBE ATTAINMENT SCORECARD COMPONENT
 * ======================================================================= */

function ObeAttainmentCard({ attainment }) {
  const [expanded, setExpanded] = useState(true);

  const verdictBadgeVariant =
    attainment.overall_attainment_pct >= 70 ? 'pass' : (attainment.overall_attainment_pct >= 50 ? 'warning' : 'critical');

  return (
    <div className="rounded-xl border border-border-default bg-subtle/30 p-4 space-y-3.5">
      {/* Title & Overall Index */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-action-primary border border-emerald-200">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-heading sm:text-sm">
              Outcome-Based Education (OBE) CLO Attainment
            </h3>
            <p className="text-[11px] text-muted">
              Benchmark standard: &ge; {attainment.benchmark_threshold_pct}% marks attainment (target: &ge; {attainment.accreditation_target_pct}% students)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={verdictBadgeVariant}>
            {attainment.verdict} ({attainment.overall_attainment_pct}%)
          </Badge>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-muted hover:bg-subtle hover:text-primary transition"
            aria-label={expanded ? 'Collapse OBE details' : 'Expand OBE details'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* CLO Progress Bars */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
            {attainment.clo_attainments?.map((clo) => {
              const pass = clo.attainment_rate_pct >= attainment.accreditation_target_pct;
              const barColor = pass ? 'bg-action-primary' : (clo.attainment_rate_pct >= 50 ? 'bg-amber-500' : 'bg-rose-600');

              return (
                <div key={clo.code} className="rounded-lg border border-border-default bg-surface p-3 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-heading">{clo.code}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pass ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
                      {pass ? 'Achieved' : 'Action Needed'}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-secondary line-clamp-1" title={clo.title}>
                    {clo.title}
                  </p>
                  <p className="text-[10px] text-muted">{clo.bloom_domain}</p>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-heading mb-1">
                      <span>Attainment</span>
                      <span>{clo.attainment_rate_pct}% ({clo.attained_students}/{clo.total_students})</span>
                    </div>
                    {/* Progress with 70% threshold marker */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(100, clo.attainment_rate_pct)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] text-muted">
                      <span>0%</span>
                      <span className="font-semibold text-action-primary">70% target</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section Breakdown Comparison */}
          {attainment.section_breakdown?.length >= 2 && (
            <div className="rounded-lg border border-border-default bg-surface p-3 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-heading mb-2">
                Section-by-Section OBE Performance
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-subtle/60 text-heading">
                    <tr>
                      <th className="px-3 py-1.5 font-bold">Section</th>
                      <th className="px-3 py-1.5 font-bold">Faculty</th>
                      <th className="px-3 py-1.5 font-bold">Students</th>
                      <th className="px-3 py-1.5 font-bold">CLO1</th>
                      <th className="px-3 py-1.5 font-bold">CLO2</th>
                      <th className="px-3 py-1.5 font-bold">CLO3</th>
                      <th className="px-3 py-1.5 font-bold">CLO4</th>
                      <th className="px-3 py-1.5 font-bold text-right">Overall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default text-primary">
                    {attainment.section_breakdown.map((sec) => (
                      <tr key={sec.section_name} className="hover:bg-subtle/20">
                        <td className="px-3 py-1.5 font-bold text-heading">{sec.section_name}</td>
                        <td className="px-3 py-1.5">{sec.faculty_name}</td>
                        <td className="px-3 py-1.5 tabular-nums">{sec.student_count}</td>
                        <td className="px-3 py-1.5 tabular-nums font-semibold">{sec.clo_metrics?.CLO1?.attainment_rate_pct ?? '—'}%</td>
                        <td className="px-3 py-1.5 tabular-nums font-semibold">{sec.clo_metrics?.CLO2?.attainment_rate_pct ?? '—'}%</td>
                        <td className="px-3 py-1.5 tabular-nums font-semibold">{sec.clo_metrics?.CLO3?.attainment_rate_pct ?? '—'}%</td>
                        <td className="px-3 py-1.5 tabular-nums font-semibold">{sec.clo_metrics?.CLO4?.attainment_rate_pct ?? '—'}%</td>
                        <td className="px-3 py-1.5 text-right font-bold text-action-primary tabular-nums">
                          {sec.overall_attainment_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Continuous Quality Improvement (CQI) Actions */}
          {attainment.cqi_actions?.length > 0 && (
            <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-sky-900 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                Continuous Quality Improvement (CQI) Action Plan
              </div>
              <ul className="list-disc pl-4 space-y-1 text-sky-900 text-[11px]">
                {attainment.cqi_actions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ==========================================================================
 * FACULTY SECTION SUMMARY COMPONENT (Light Theme High-Contrast)
 * ======================================================================= */

function MySectionSummary({ stats }) {
  const peak = Math.max(1, ...stats.distribution.map((d) => d.count));

  return (
    <div className="rounded-xl border border-border-default bg-subtle/30 p-4 shadow-2xs">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Assessed Students', value: stats.n },
          { label: 'Section Mean', value: `${stats.mean} / ${stats.max_marks}` },
          { label: 'Standard Deviation', value: stats.std_dev },
          { label: 'Score Range', value: `${stats.min} – ${stats.max}` },
        ].map((cell) => (
          <div key={cell.label} className="rounded-lg border border-border-default bg-surface p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{cell.label}</p>
            <p className="mt-0.5 text-base font-extrabold tabular-nums text-heading">{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-heading">
          Section Score Frequency Distribution
        </p>
        <div className="flex items-end gap-2 h-16 pt-2" role="img" aria-label="Mark distribution">
          {stats.distribution.map((bucket) => (
            <div key={bucket.bucket} className="flex flex-1 flex-col items-center gap-1 h-full justify-end">
              <div
                className="w-full rounded-t-sm bg-action-primary hover:bg-action-primary-hover transition-colors shadow-2xs"
                style={{ height: `${Math.max(4, (bucket.count / peak) * 46)}px` }}
                title={`${bucket.bucket} marks: ${bucket.count} students`}
              />
              <span className="text-[10px] font-medium tabular-nums text-muted">{bucket.bucket}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * PROGRESS BAR
 * ======================================================================= */

function SubmissionProgress({ batch }) {
  const total = Math.max(batch.total_sections ?? MIN_SECTIONS_FOR_PARITY, 1);
  const done = batch.sections_submitted ?? 0;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-heading">
          <Users className="h-3.5 w-3.5 text-action-primary" />
          {done} of {total} sections submitted
        </span>
        <span className="tabular-nums font-bold text-primary">{pct}% Complete</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
        <div
          className={`h-full rounded-full transition-all ${
            done >= MIN_SECTIONS_FOR_PARITY ? 'bg-action-primary' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ==========================================================================
 * CREATE BATCH MODAL (High-Contrast University Light Theme)
 * ======================================================================= */

function CreateBatchModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    course_id: '',
    semester: '',
    assessment_name: '',
    max_marks: 30,
  });

  const { data: courses } = useQuery({
    queryKey: QUERY_KEYS.courses,
    queryFn: () => get(ENDPOINTS.courses),
  });

  const mutation = useMutation({
    mutationFn: (payload) => post(ENDPOINTS.createGradingBatch, payload),
    onSuccess: onCreated,
  });

  const selectedCourse = courses?.find((c) => String(c.id) === String(form.course_id));

  const submit = (e) => {
    e.preventDefault();
    mutation.mutate({
      course_id: Number(form.course_id),
      semester: form.semester || selectedCourse?.semester || 'Fall 2024',
      assessment_name: form.assessment_name,
      max_marks: Number(form.max_marks),
    });
  };

  const field =
    'h-9 w-full rounded-lg border border-border-default bg-surface px-3 text-xs font-medium text-primary focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus shadow-2xs';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="New Exam or Assessment Batch"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-border-default bg-surface shadow-2xl text-primary"
      >
        <div className="flex items-center justify-between border-b border-border-default bg-subtle/40 px-5 py-4 rounded-t-xl">
          <div>
            <h2 className="text-sm font-bold text-heading">Create New Exam / Assessment</h2>
            <p className="text-[11px] text-muted">Open an assessment batch for section mark collection</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition hover:bg-subtle hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-heading">Target Course</span>
            <select
              required
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              className={field}
            >
              <option value="">Select a course…</option>
              {courses?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-heading">Semester</span>
            <input
              required
              value={form.semester}
              onChange={(e) => setForm({ ...form, semester: e.target.value })}
              placeholder={selectedCourse?.semester ?? 'Fall 2024'}
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-heading">Assessment / Exam Name</span>
            <input
              required
              value={form.assessment_name}
              onChange={(e) => setForm({ ...form, assessment_name: e.target.value })}
              placeholder="e.g. Mid Term, Final Exam, Quiz 1"
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-heading">Maximum Marks</span>
            <input
              required
              type="number"
              min="1"
              max="1000"
              value={form.max_marks}
              onChange={(e) => setForm({ ...form, max_marks: e.target.value })}
              className={field}
            />
          </label>

          {mutation.isError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 shadow-2xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{mutation.error?.message ?? 'Could not create the exam batch.'}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-default bg-subtle/30 px-5 py-3 rounded-b-xl">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={mutation.isPending}>
            Create Assessment Batch
          </Button>
        </div>
      </form>
    </div>
  );
}
