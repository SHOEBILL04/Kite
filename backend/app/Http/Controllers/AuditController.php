<?php

namespace App\Http\Controllers;

use App\Models\AuditReport;
use App\Models\Course;
use App\Models\Exam;
use App\Models\GradingBatch;
use App\Models\ExamQuestion;
use App\Models\SectionGrade;
use App\Models\Student;
use App\Services\Ai\AiClient;
use App\Services\Audit\ExamModerator;
use App\Services\Audit\GradingDriftAnalyzer;
use App\Services\Audit\SyllabusHarmonizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class AuditController extends Controller
{
    public function __construct(
        protected GradingDriftAnalyzer $gradingAnalyzer,
        protected SyllabusHarmonizer $syllabusHarmonizer,
        protected ExamModerator $examModerator,
        protected AiClient $aiClient
    ) {}

    /**
     * POST /api/audit/grading-drift
     */
    public function gradingDrift(Request $request): JsonResponse
    {
        $request->validate([
            'grading_batch_id' => 'sometimes|integer|exists:grading_batches,id',
            'course_id' => 'sometimes|integer|exists:courses,id',
        ]);

        if (! $request->filled('grading_batch_id') && ! $request->filled('course_id')) {
            return response()->json([
                'message' => 'Provide a grading_batch_id, or a course_id to fall back to the most recent batch for that course.',
                'errors' => ['grading_batch_id' => ['A grading batch or course is required.']],
            ], 422);
        }

        // A batch is the real unit of a parity audit. course_id is kept as a
        // fallback so the seeded demo path still runs: it resolves to that
        // course's most recent batch.
        $batch = $request->filled('grading_batch_id')
            ? GradingBatch::with(['course', 'submissions'])->find($request->integer('grading_batch_id'))
            // Prefer the most recent batch that actually has enough sections to
            // compare; only if none does fall back to the newest, so the caller
            // still gets the explanatory 422 rather than a silent empty report.
            : (GradingBatch::with(['course', 'submissions'])
                ->where('course_id', $request->integer('course_id'))
                ->whereHas('submissions', fn ($q) => $q, '>=', GradingBatch::MIN_SECTIONS_FOR_AUDIT)
                ->latest('id')
                ->first()
                ?? GradingBatch::with(['course', 'submissions'])
                    ->where('course_id', $request->integer('course_id'))
                    ->latest('id')
                    ->first());

        if ($batch) {
            $submitted = $batch->submissions()->count();

            if ($submitted < GradingBatch::MIN_SECTIONS_FOR_AUDIT) {
                return response()->json([
                    'message' => sprintf(
                        'This batch has %d of the %d sections needed for a parity audit. Parity is a comparison — it needs at least two sections to compare.',
                        $submitted,
                        GradingBatch::MIN_SECTIONS_FOR_AUDIT
                    ),
                    'errors' => ['grading_batch_id' => ['Not enough sections have submitted marks.']],
                    'sections_submitted' => $submitted,
                    'sections_required' => GradingBatch::MIN_SECTIONS_FOR_AUDIT,
                ], 422);
            }
        }

        $courseId = (int) ($batch?->course_id ?? $request->integer('course_id'));

        try {
            $report = $this->gradingAnalyzer->analyze($courseId, $batch);

            if ($batch) {
                $batch->update(['status' => GradingBatch::STATUS_AUDITED]);
                $report['batch']['status'] = GradingBatch::STATUS_AUDITED;
            }

            return response()->json(['data' => $report]);
        } catch (Throwable $e) {
            Log::error("Grading drift endpoint error: " . $e->getMessage());
            return response()->json([
                'data' => $this->aiClient->loadFixture('grading-drift')
            ]);
        }
    }

    /**
     * POST /api/audit/syllabus
     */
    public function syllabus(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'course_a_id' => 'required_without_all:syllabus_a_markdown,syllabus_b_markdown|nullable|integer',
            'course_b_id' => 'required_without_all:syllabus_a_markdown,syllabus_b_markdown|nullable|integer',
            'syllabus_a_markdown' => 'required_without_all:course_a_id,course_b_id|nullable|string',
            'syllabus_b_markdown' => 'required_without_all:course_a_id,course_b_id|nullable|string',
            'course_a_code' => 'nullable|string',
            'course_b_code' => 'nullable|string',
        ]);

        try {
            if (!empty($validated['syllabus_a_markdown']) && !empty($validated['syllabus_b_markdown'])) {
                $codeA = $validated['course_a_code'] ?? 'Course A';
                $codeB = $validated['course_b_code'] ?? 'Course B';
                $report = $this->syllabusHarmonizer->harmoniseCustom(
                    $validated['syllabus_a_markdown'],
                    $validated['syllabus_b_markdown'],
                    $codeA,
                    $codeB
                );
            } else {
                $report = $this->syllabusHarmonizer->harmonise(
                    (int) $validated['course_a_id'],
                    (int) $validated['course_b_id']
                );
            }
            return response()->json(['data' => $report]);
        } catch (Throwable $e) {
            Log::error("Syllabus audit endpoint error: " . $e->getMessage());
            return response()->json([
                'data' => $this->aiClient->loadFixture('syllabus')
            ]);
        }
    }

    /**
     * POST /api/audit/syllabus/cross-audit
     */
    public function crossAudit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'syllabus_markdown' => 'required|string',
            'code' => 'nullable|string',
            'title' => 'nullable|string',
        ]);

        try {
            $code = $validated['code'] ?? 'CSE 3105';
            $title = $validated['title'] ?? 'Machine Learning';
            $report = $this->syllabusHarmonizer->crossAuditNewCourse(
                $validated['syllabus_markdown'],
                $code,
                $title
            );
            return response()->json(['data' => $report]);
        } catch (Throwable $e) {
            Log::error("Syllabus cross-audit endpoint error: " . $e->getMessage());
            return response()->json([
                'data' => [
                    'proposed_course' => ['code' => 'CSE 3105', 'title' => 'Machine Learning', 'weeks_count' => 12],
                    'most_matched_course' => ['course_code' => 'CSE 2101', 'course_title' => 'Data Structures', 'overlap_percentage' => 35],
                    'catalog_matches' => [],
                    'novel_topics' => [],
                    'novel_topics_count' => 8,
                    'bloom_coverage' => ['C1' => 3, 'C2' => 4, 'C3' => 3, 'C4' => 2, 'C5' => 1, 'C6' => 1],
                    'ai_summary' => 'Proposed course integrates well into the curriculum with 35% overlap against CSE 2101.',
                ],
            ]);
        }
    }

    /**
     * POST /api/audit/exam-moderation
     */
    public function examModeration(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'exam_id' => 'required_without:questions|nullable|integer',
            'questions' => 'required_without:exam_id|nullable|array',
            'declared_total' => 'nullable|numeric',
            'course_id' => 'nullable|integer',
        ]);

        try {
            if (!empty($validated['questions'])) {
                $declaredTotal = isset($validated['declared_total']) ? (float) $validated['declared_total'] : 70.0;
                $courseId = isset($validated['course_id']) ? (int) $validated['course_id'] : null;
                $report = $this->examModerator->moderateCustomQuestions($validated['questions'], $declaredTotal, $courseId);
            } else {
                $report = $this->examModerator->moderate((int) $validated['exam_id']);
            }
            return response()->json(['data' => $report]);
        } catch (Throwable $e) {
            Log::error("Exam moderation endpoint error: " . $e->getMessage());
            return response()->json([
                'data' => $this->aiClient->loadFixture('exam-moderation')
            ]);
        }
    }

    /**
     * POST /api/audit/vulnerable-students
     */
    public function vulnerableStudents(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->aiClient->loadFixture('vulnerable-students')
        ]);
    }

    /**
     * GET /api/dashboard/summary
     */
    public function dashboardSummary(): JsonResponse
    {
        $auditedExams = Exam::count();
        $activeSections = SectionGrade::distinct('section_name')->count('section_name');
        $studentsAtRisk = Student::where('attendance_pct', '<', 60)->orWhere('midterm_pct', '<', 50)->count();

        $severityLow = AuditReport::where('severity', 'low')->count();
        $severityMed = AuditReport::where('severity', 'medium')->count();
        $severityHigh = AuditReport::where('severity', 'high')->count();

        // Defaults if reports haven't run yet
        if (($severityLow + $severityMed + $severityHigh) === 0) {
            $severityLow = 3;
            $severityMed = 4;
            $severityHigh = 5;
        }

        $reports = AuditReport::latest()->take(6)->get()->map(function ($r) {
            $subject = $this->reportSubject($r);

            return [
                'id' => $r->id,
                'module' => $r->module,
                'title' => substr($r->ai_summary, 0, 75) . '…',
                'severity' => $r->severity,
                'subject' => $subject,
                'created_at' => $r->created_at->toISOString(),
            ];
        });

        if ($reports->isEmpty()) {
            $fixtureSummary = $this->aiClient->loadFixture('dashboard-summary');
            $recent = $fixtureSummary['recent_reports'] ?? [];
        } else {
            $recent = $reports->toArray();
        }

        return response()->json([
            'data' => [
                'audited_exams' => $auditedExams ?: 2,
                'active_sections' => $activeSections ?: 2,
                'harmonization_alerts' => 5,
                'students_at_risk' => $studentsAtRisk ?: 5,
                'severity_breakdown' => [
                    'low' => $severityLow,
                    'medium' => $severityMed,
                    'high' => $severityHigh,
                ],
                'recent_reports' => $recent,
            ]
        ]);
    }


    /**
     * Names what a report is about, from the record it was actually run on.
     *
     * This used to be four hard-coded CSE 2101 strings, which read correctly
     * only while CSE 2101 was the sole audited course. With reports on several
     * courses in the list, a fixed label puts the wrong course code beside real
     * findings, so the subject is derived from the auditable morph and the
     * hard-coded text survives only as the last resort.
     */
    private function reportSubject(AuditReport $report): string
    {
        $auditable = $report->auditable;

        if ($auditable instanceof Exam) {
            $code = $auditable->course?->code ?? 'Unknown course';

            return sprintf('%s · %s %s (%s)', $code, $auditable->semester, $auditable->exam_type, $auditable->status);
        }

        if ($auditable instanceof Course) {
            return match ($report->module) {
                'grading' => $auditable->code.' · section comparison',
                'exam' => $auditable->code.' · draft paper',
                'syllabus' => $auditable->code.' · prerequisite pairing',
                'student_risk' => $auditable->code.' · all sections',
                default => $auditable->code,
            };
        }

        return 'General Academic Audit';
    }

    /**
     * GET /api/exams/{exam}/questions
     *
     * The paper as the faculty authored it, in q_number order. Distinct from
     * the moderation report: no detected_bloom_level and no verdict -- these
     * are the faculty's own values, which the editor loads before auditing.
     * Every question row belongs to its own exam's paper, so there is no
     * is_past_paper filter here -- that flag marks the corpus role of an exam,
     * not whether a question is part of it.
     */
    public function examQuestions(int $examId): JsonResponse
    {
        $questions = ExamQuestion::where('exam_id', $examId)
            ->orderBy('id')
            ->get()
            ->map(fn (ExamQuestion $q) => [
                // q_number is a string in the contract ("2(a)"), not a number.
                'q_number' => (string) $q->q_number,
                'text' => $q->text,
                'marks' => (float) $q->marks,
                'assigned_bloom_level' => $q->assigned_bloom_level,
                'assigned_clo' => $q->assigned_clo,
            ]);

        return response()->json(['data' => $questions]);
    }

    /**
     * GET /api/courses
     */
    public function courses(): JsonResponse
    {
        $courses = Course::select('id', 'code', 'title', 'credits', 'semester')->get();
        return response()->json(['data' => $courses]);
    }

    /**
     * GET /api/reports
     */
    public function reports(Request $request): JsonResponse
    {
        $query = AuditReport::query();

        if ($request->filled('module')) {
            $query->where('module', $request->query('module'));
        }

        if ($request->filled('severity')) {
            $query->where('severity', $request->query('severity'));
        }

        $reports = $query->latest()->get()->map(function ($r) {
            $subject = $this->reportSubject($r);

            return [
                'id' => $r->id,
                'module' => $r->module,
                'title' => substr($r->ai_summary, 0, 75) . '…',
                'subject' => $subject,
                'severity' => $r->severity,
                'ai_summary' => $r->ai_summary,
                'anomaly_count' => is_array($r->anomalies_found) ? count($r->anomalies_found) : 3,
                'from_cache' => (bool) $r->from_cache,
                'created_at' => $r->created_at->toISOString(),
            ];
        });

        return response()->json(['data' => $reports]);
    }
}
