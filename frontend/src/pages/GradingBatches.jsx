import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Info,
  Plus,
  Scale,
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
 * The mark-collection hub.
 *
 * Both roles land here, but they are doing different jobs: a head of department
 * is tracking who has and has not submitted, while a teacher is submitting and
 * checking their own numbers. The page is one route with two shapes rather than
 * two routes, because the underlying object — the batch — is the same.
 */

const STATUS_TONE = {
  collecting: { variant: 'warning', icon: Clock },
  ready: { variant: 'pass', icon: CheckCircle2 },
  audited: { variant: 'default', icon: BarChart3 },
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export default function GradingBatches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isHod = user?.role === 'head_of_department';

  const [uploadTarget, setUploadTarget] = useState(null);
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
    <div className="space-y-6">
      {/* Header ---------------------------------------------------------- */}
      <section className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-amber-400" />
            <h1 className="text-lg font-bold tracking-tight text-slate-100 sm:text-xl">
              Mark Collection
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {isHod
              ? 'Open a batch, track which sections have submitted, and run the parity audit once two are in.'
              : 'Upload your section’s marks. You will see your own figures as soon as they import.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {courses.length > 1 ? (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              aria-label="Filter by course"
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          ) : null}

          {isHod ? (
            <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
              New Grading Batch
            </Button>
          ) : null}
        </div>
      </section>

      {/* States ---------------------------------------------------------- */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <Card>
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
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title={isHod ? 'No grading batches yet' : 'Nothing to upload yet'}
            description={
              isHod
                ? 'Open a batch for an assessment, and the teaching team can upload their sections into it.'
                : 'When your head of department opens a batch for one of your courses, it will appear here.'
            }
            action={
              isHod ? (
                <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
                  New Grading Batch
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((batch) =>
            isHod ? (
              <HodBatchCard
                key={batch.id}
                batch={batch}
                onUpload={() => setUploadTarget(batch)}
                onDelete={(submissionId) =>
                  deleteMutation.mutate({ batchId: batch.id, submissionId })
                }
                deleting={deleteMutation.isPending}
                onAudit={() => navigate(`/grading-parity?batch=${batch.id}&autorun=1`)}
              />
            ) : (
              <FacultyBatchCard
                key={batch.id}
                batch={batch}
                onUpload={() => setUploadTarget(batch)}
              />
            )
          )}
        </div>
      )}

      {/* Modals ---------------------------------------------------------- */}
      {uploadTarget ? (
        <UploadMarksModal
          open
          batch={uploadTarget}
          lockedSection={isHod ? null : uploadTarget.my_submission?.section_name ?? null}
          availableSections={
            uploadTarget.total_sections >= 3
              ? ['Section A', 'Section B', 'Section C']
              : ['Section A', 'Section B']
          }
          onClose={() => setUploadTarget(null)}
          onUploaded={() => {
            invalidate();
            queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.myGradingStats(uploadTarget.id),
            });
          }}
        />
      ) : null}

      {showCreate ? (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
 * HEAD OF DEPARTMENT — tracking who has submitted
 * ======================================================================= */

function HodBatchCard({ batch, onUpload, onDelete, deleting, onAudit }) {
  const tone = STATUS_TONE[batch.status] ?? STATUS_TONE.collecting;
  const canAudit = batch.sections_submitted >= MIN_SECTIONS_FOR_PARITY;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                {batch.course_code} · {batch.assessment_name}
              </h2>
              <Badge variant={tone.variant}>
                {GRADING_BATCH_STATUS_LABELS[batch.status] ?? batch.status}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {batch.semester} · out of {batch.max_marks} marks · opened by {batch.created_by_name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={Upload} onClick={onUpload}>
              Upload
            </Button>

            {/* Disabled with an explanation rather than hidden: the reason it
                is unavailable is the useful information. */}
            <span
              title={
                canAudit
                  ? 'Run the cross-section parity audit'
                  : `Parity compares sections — at least ${MIN_SECTIONS_FOR_PARITY} must submit first.`
              }
            >
              <Button size="sm" icon={Scale} onClick={onAudit} disabled={!canAudit}>
                Run Parity Audit
              </Button>
            </span>
          </div>
        </div>

        <SubmissionProgress batch={batch} />

        {batch.submissions?.length ? (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Faculty</th>
                  <th className="px-3 py-2 font-medium">Students</th>
                  <th className="px-3 py-2 font-medium">Uploaded</th>
                  <th className="px-3 py-2 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {batch.submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium text-slate-200">{s.section_name}</td>
                    <td className="px-3 py-2">{s.faculty_name}</td>
                    <td className="px-3 py-2 tabular-nums">{s.student_count}</td>
                    <td className="px-3 py-2 text-slate-400">{formatWhen(s.uploaded_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        disabled={deleting}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
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
          <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            No sections have submitted yet.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ==========================================================================
 * FACULTY — submitting, and seeing only their own numbers
 * ======================================================================= */

function FacultyBatchCard({ batch, onUpload }) {
  const tone = STATUS_TONE[batch.status] ?? STATUS_TONE.collecting;
  const submitted = Boolean(batch.my_submission);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.myGradingStats(batch.id),
    queryFn: () => get(ENDPOINTS.myGradingStats(batch.id)),
    enabled: submitted,
    retry: false,
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                {batch.course_code} · {batch.assessment_name}
              </h2>
              <Badge variant={tone.variant}>
                {GRADING_BATCH_STATUS_LABELS[batch.status] ?? batch.status}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {batch.semester} · out of {batch.max_marks} marks
            </p>
          </div>

          <Button size="sm" icon={Upload} onClick={onUpload} variant={submitted ? 'ghost' : 'primary'}>
            {submitted ? 'Re-upload Marks' : 'Upload Marks'}
          </Button>
        </div>

        {submitted ? (
          <>
            <p className="flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {batch.my_submission.section_name} submitted —{' '}
              {batch.my_submission.student_count} students on{' '}
              {formatWhen(batch.my_submission.uploaded_at)}
            </p>

            {statsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : stats ? (
              <MySectionSummary stats={stats} />
            ) : null}
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>You have not uploaded marks for this assessment yet.</span>
          </p>
        )}

        <p className="text-[11px] text-slate-500">
          Comparative analysis is reviewed at department level.
        </p>
      </div>
    </Card>
  );
}

/**
 * A teacher's own numbers. Deliberately shows no cohort mean, no leniency index
 * and no other section — the endpoint does not return them, and this is the
 * surface where that restraint is visible.
 */
function MySectionSummary({ stats }) {
  const peak = Math.max(1, ...stats.distribution.map((d) => d.count));

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Students', value: stats.n },
          { label: 'Mean', value: `${stats.mean} / ${stats.max_marks}` },
          { label: 'Std dev', value: stats.std_dev },
          { label: 'Range', value: `${stats.min}–${stats.max}` },
        ].map((cell) => (
          <div key={cell.label}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{cell.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
          Your mark distribution
        </p>
        <div className="flex items-end gap-1" role="img" aria-label="Mark distribution">
          {stats.distribution.map((bucket) => (
            <div key={bucket.bucket} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-sky-500/70"
                style={{ height: `${Math.max(2, (bucket.count / peak) * 44)}px` }}
                title={`${bucket.bucket}: ${bucket.count}`}
              />
              <span className="text-[9px] tabular-nums text-slate-500">{bucket.bucket}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * SHARED
 * ======================================================================= */

function SubmissionProgress({ batch }) {
  const total = Math.max(batch.total_sections ?? MIN_SECTIONS_FOR_PARITY, 1);
  const done = batch.sections_submitted ?? 0;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Users className="h-3.5 w-3.5" />
          {done} of {total} sections submitted
        </span>
        <span className="tabular-nums text-slate-500">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${
            done >= MIN_SECTIONS_FOR_PARITY ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

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
      semester: form.semester || selectedCourse?.semester || '',
      assessment_name: form.assessment_name,
      max_marks: Number(form.max_marks),
    });
  };

  const field = 'h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="New grading batch"
    >
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">New Grading Batch</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Course</span>
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
            <span className="mb-1 block text-xs font-medium text-slate-400">Semester</span>
            <input
              required
              value={form.semester}
              onChange={(e) => setForm({ ...form, semester: e.target.value })}
              placeholder={selectedCourse?.semester ?? 'Fall 2024'}
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Assessment name</span>
            <input
              required
              value={form.assessment_name}
              onChange={(e) => setForm({ ...form, assessment_name: e.target.value })}
              placeholder="Mid Term"
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Maximum marks</span>
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

          {mutation.isError ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {mutation.error?.message ?? 'Could not create the batch.'}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={mutation.isPending}>
            Create batch
          </Button>
        </div>
      </form>
    </div>
  );
}
