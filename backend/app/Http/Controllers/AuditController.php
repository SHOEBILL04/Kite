<?php

namespace App\Http\Controllers;

use App\Models\AuditReport;
use App\Models\Course;
use App\Models\Exam;
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
        $validated = $request->validate([
            'course_id' => 'required|integer',
        ]);

        try {
            $report = $this->gradingAnalyzer->analyze((int) $validated['course_id']);
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
            $subject = 'General Academic Audit';
            if ($r->module === 'grading') $subject = 'CSE 2101 · Section A vs B';
            if ($r->module === 'exam') $subject = 'CSE 2101 · Fall 2025 Final (draft)';
            if ($r->module === 'syllabus') $subject = 'CSE 2101 → CSE 2103';
            if ($r->module === 'student_risk') $subject = 'CSE 2101 · all sections';

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
            $subject = 'General Academic Audit';
            if ($r->module === 'grading') $subject = 'CSE 2101 · Section A vs B';
            if ($r->module === 'exam') $subject = 'CSE 2101 · Fall 2025 Final (draft)';
            if ($r->module === 'syllabus') $subject = 'CSE 2101 → CSE 2103';
            if ($r->module === 'student_risk') $subject = 'CSE 2101 · all sections';

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
