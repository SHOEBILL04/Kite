<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\Exam;
use App\Models\GradingBatch;
use App\Models\GradingSubmission;
use App\Models\SectionGrade;
use App\Models\User;
use App\Services\Grading\MarksCsvParser;
use App\Services\Grading\ObeAttainmentCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Multi-teacher mark collection.
 *
 * Both faculty and heads of department can create assessment batches.
 * Uploads and manual submissions are limited to the assigned section.
 */
class GradingBatchController extends Controller
{
    public function __construct(
        private MarksCsvParser $parser,
        private ObeAttainmentCalculator $obeCalculator
    ) {}

    // ------------------------------------------------------------------ create

    /** POST /api/grading-batches — opened by faculty or heads of department. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'semester' => ['required', 'string', 'max:100'],
            'assessment_name' => ['required', 'string', 'max:100'],
            'max_marks' => ['required', 'integer', 'min:1', 'max:1000'],
        ]);

        $batch = GradingBatch::create([
            ...$validated,
            'created_by' => $user->id,
            'status' => GradingBatch::STATUS_COLLECTING,
        ]);

        // Keep Exam record synchronized so it is available across Exam Moderation and Grading
        $normalizedType = stripos($validated['assessment_name'], 'final') !== false ? 'Final' : 'Mid';
        Exam::firstOrCreate([
            'course_id' => $validated['course_id'],
            'semester' => $validated['semester'],
            'exam_type' => $normalizedType,
        ], [
            'status' => 'draft',
            'total_marks' => $validated['max_marks'],
        ]);

        return response()->json([
            'data' => $this->presentBatch($batch->fresh(['course', 'submissions.faculty']), $user),
        ], 201);
    }

    // -------------------------------------------------------------------- list

    /**
     * GET /api/grading-batches
     *
     * Every signed-in faculty member sees every batch and every submission on
     * it. Only the write actions are role-limited: opening a batch is a head of
     * department's, and uploading is limited to the section you are assigned.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Not scoped by course: parity is open to every faculty member, so the
        // batch list they choose from is the whole department's.
        $query = GradingBatch::with(['course', 'submissions.faculty', 'creator'])->latest('id');

        $batches = $query->get()->map(fn (GradingBatch $b) => $this->presentBatch($b, $user));

        return response()->json(['data' => $batches->values()]);
    }

    // ------------------------------------------------------------------ upload

    /** POST /api/grading-batches/{batch}/upload */
    public function upload(Request $request, GradingBatch $batch): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'file' => ['required', 'file', 'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel', 'max:2048'],
            'section_name' => ['required', 'string', 'max:100'],
        ]);

        $sectionName = trim($request->input('section_name'));

        if (! $this->canUploadFor($user, $batch, $sectionName)) {
            return $this->forbidden(
                "You are not the assigned faculty for {$sectionName} in {$batch->course->code}."
            );
        }

        $file = $request->file('file');
        $result = $this->parser->parse((string) file_get_contents($file->getRealPath()), $batch);

        if (! $result['ok']) {
            return response()->json([
                'message' => 'The file was rejected. No marks were imported.',
                'row_errors' => $result['errors'],
                'total_errors' => $result['total_errors'],
                'total_rows' => $result['total_rows'],
            ], 422);
        }

        $existing = $batch->submissions()->where('section_name', $sectionName)->first();
        $replaced = $existing !== null;

        // The delete and the insert are one unit: a failure part-way through
        // would leave the section with no marks at all.
        $submission = DB::transaction(function () use ($batch, $sectionName, $user, $file, $result, $existing) {
            if ($existing) {
                SectionGrade::where('grading_submission_id', $existing->id)->delete();
                $existing->delete();
            }

            $submission = GradingSubmission::create([
                'grading_batch_id' => $batch->id,
                'section_name' => $sectionName,
                'faculty_id' => $user->id,
                'student_count' => count($result['rows']),
                'uploaded_at' => now(),
                'file_name' => $file->getClientOriginalName(),
            ]);

            $now = now();
            $payload = array_map(fn (array $row) => [
                'course_id' => $batch->course_id,
                'grading_batch_id' => $batch->id,
                'grading_submission_id' => $submission->id,
                'section_name' => $sectionName,
                'faculty_id' => $user->id,
                'student_hash' => $row['student_hash'],
                'mid_marks' => $row['mid_marks'],
                'quiz_avg' => $row['quiz_avg'],
                'attendance_pct' => $row['attendance_pct'],
                'created_at' => $now,
                'updated_at' => $now,
            ], $result['rows']);

            SectionGrade::insert($payload);

            return $submission;
        });

        $batch->refresh();
        $batch->refreshStatus();
        $batch->refresh();

        return response()->json([
            'data' => [
                'submission' => $this->presentSubmission($submission->load('faculty')),
                'batch_status' => $batch->status,
                'sections_submitted' => $batch->submissions()->count(),
                'total_sections' => $this->totalSectionsFor($batch),
                'replaced' => $replaced,
            ],
        ]);
    }

    // ----------------------------------------------------------- manual submit

    /** POST /api/grading-batches/{batch}/manual-submit */
    public function manualSubmit(Request $request, GradingBatch $batch): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'section_name' => ['required', 'string', 'max:100'],
            'rows' => ['required', 'array', 'min:1'],
            'rows.*.student_id' => ['required', 'string', 'max:50'],
            'rows.*.mid_marks' => ['required', 'numeric', 'min:0', "max:{$batch->max_marks}"],
            'rows.*.quiz_avg' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'rows.*.attendance_pct' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $sectionName = trim($validated['section_name']);

        if (! $this->canUploadFor($user, $batch, $sectionName)) {
            return $this->forbidden(
                "You are not the assigned faculty for {$sectionName} in {$batch->course->code}."
            );
        }

        // Check for duplicate student IDs within the submission
        $seen = [];
        foreach ($validated['rows'] as $i => $row) {
            $sid = trim((string) $row['student_id']);
            if (isset($seen[$sid])) {
                return response()->json([
                    'message' => "Duplicate student ID '{$sid}' found in submission (row " . ($i + 1) . ").",
                ], 422);
            }
            $seen[$sid] = true;
        }

        $existing = $batch->submissions()->where('section_name', $sectionName)->first();
        $replaced = $existing !== null;

        $submission = DB::transaction(function () use ($batch, $sectionName, $user, $validated, $existing) {
            if ($existing) {
                SectionGrade::where('grading_submission_id', $existing->id)->delete();
                $existing->delete();
            }

            $submission = GradingSubmission::create([
                'grading_batch_id' => $batch->id,
                'section_name' => $sectionName,
                'faculty_id' => $user->id,
                'student_count' => count($validated['rows']),
                'uploaded_at' => now(),
                'file_name' => 'manual_entry_grid',
            ]);

            $now = now();
            $records = [];
            foreach ($validated['rows'] as $row) {
                $records[] = [
                    'course_id' => $batch->course_id,
                    'grading_batch_id' => $batch->id,
                    'grading_submission_id' => $submission->id,
                    'section_name' => $sectionName,
                    'faculty_id' => $user->id,
                    'student_hash' => $this->parser->hashIdentifier((string) $row['student_id']),
                    'mid_marks' => (int) round($row['mid_marks']),
                    'quiz_avg' => isset($row['quiz_avg']) ? (int) round($row['quiz_avg']) : 75,
                    'attendance_pct' => isset($row['attendance_pct']) ? (int) round($row['attendance_pct']) : 85,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            SectionGrade::insert($records);

            return $submission;
        });

        $batch->refresh();
        $batch->refreshStatus();
        $batch->refresh();

        return response()->json([
            'data' => [
                'submission' => $this->presentSubmission($submission->load('faculty')),
                'batch_status' => $batch->status,
                'sections_submitted' => $batch->submissions()->count(),
                'total_sections' => $this->totalSectionsFor($batch),
                'replaced' => $replaced,
            ],
        ]);
    }

    // ---------------------------------------------------------- obe attainment

    /** GET /api/grading-batches/{batch}/obe-attainment */
    public function obeAttainment(GradingBatch $batch): JsonResponse
    {
        return response()->json([
            'data' => $this->obeCalculator->calculate($batch),
        ]);
    }

    // ---------------------------------------------------------------- template

    /** GET /api/grading-batches/{batch}/template */
    public function template(GradingBatch $batch): StreamedResponse
    {
        $max = $batch->max_marks;

        $rows = [
            MarksCsvParser::REQUIRED_COLUMNS,
            ['2021831001', (string) (int) round($max * 0.8), '78', '92'],
            ['2021831002', (string) (int) round($max * 0.6), '61', '84'],
            ['2021831003', (string) (int) round($max * 0.45), '52', '67'],
        ];

        $filename = sprintf(
            '%s-%s-template.csv',
            str_replace(' ', '', $batch->course->code ?? 'course'),
            str_replace(' ', '-', mb_strtolower($batch->assessment_name))
        );

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }

    // ------------------------------------------------------------------ delete

    /** DELETE /api/grading-batches/{batch}/submissions/{submission} */
    public function destroySubmission(Request $request, GradingBatch $batch, GradingSubmission $submission): JsonResponse
    {
        $user = $request->user();

        if ($submission->grading_batch_id !== $batch->id) {
            return response()->json(['message' => 'That submission does not belong to this batch.'], 404);
        }

        if (! $this->isHod($user) && $submission->faculty_id !== $user->id) {
            return $this->forbidden('You can only remove your own submission.');
        }

        DB::transaction(function () use ($submission) {
            SectionGrade::where('grading_submission_id', $submission->id)->delete();
            $submission->delete();
        });

        $batch->refresh();
        $batch->refreshStatus();
        $batch->refresh();

        return response()->json([
            'data' => [
                'deleted' => true,
                'batch_status' => $batch->status,
                'sections_submitted' => $batch->submissions()->count(),
                'total_sections' => $this->totalSectionsFor($batch),
            ],
        ]);
    }

    // ---------------------------------------------------------------- my-stats

    /**
     * GET /api/grading-batches/{batch}/my-stats
     *
     * Deliberately narrow: a teacher sees the shape of their own marking and
     * nothing about anyone else's. No leniency index, no z-score, no cohort
     * mean -- those are comparative by construction, and comparison is a
     * department-level conversation, not a leaderboard.
     */
    public function myStats(Request $request, GradingBatch $batch): JsonResponse
    {
        $user = $request->user();

        $submission = $batch->submissions()
            ->where('faculty_id', $user->id)
            ->with('faculty')
            ->first();

        if (! $submission) {
            return response()->json(['message' => 'You have not uploaded marks for this batch.'], 404);
        }

        $marks = SectionGrade::where('grading_submission_id', $submission->id)
            ->pluck('mid_marks')
            ->map(fn ($v) => (float) $v)
            ->values()
            ->all();

        $n = count($marks);
        $mean = $n > 0 ? array_sum($marks) / $n : 0.0;

        $variance = 0.0;
        foreach ($marks as $m) {
            $variance += ($m - $mean) ** 2;
        }
        $stdDev = $n > 1 ? sqrt($variance / ($n - 1)) : 0.0;

        return response()->json([
            'data' => [
                'batch_id' => $batch->id,
                'section_name' => $submission->section_name,
                'assessment_name' => $batch->assessment_name,
                'max_marks' => $batch->max_marks,
                'n' => $n,
                'mean' => round($mean, 1),
                'std_dev' => round($stdDev, 1),
                'min' => $n ? (float) min($marks) : 0.0,
                'max' => $n ? (float) max($marks) : 0.0,
                'distribution' => $this->distribution($marks, $batch->max_marks),
                'uploaded_at' => $submission->uploaded_at?->toISOString(),
            ],
        ]);
    }

    // ----------------------------------------------------------------- helpers

    private function isHod(?User $user): bool
    {
        return $user?->role === 'head_of_department';
    }


    /**
     * A faculty member may upload only for a section they are assigned to; a
     * head of department may upload for any section.
     */
    private function canUploadFor(User $user, GradingBatch $batch, string $sectionName): bool
    {
        if ($this->isHod($user)) {
            return true;
        }

        // Assignment is established by already holding marks for that section
        // of that course, or by already owning the submission in this batch.
        $assigned = SectionGrade::where('course_id', $batch->course_id)
            ->where('section_name', $sectionName)
            ->where('faculty_id', $user->id)
            ->exists();

        $ownsSubmission = $batch->submissions()
            ->where('section_name', $sectionName)
            ->where('faculty_id', $user->id)
            ->exists();

        return $assigned || $ownsSubmission;
    }

    /**
     * How many sections this course is expected to produce.
     *
     * Derived from the sections that exist for the course, with a floor of two
     * because a parity audit needs at least two to say anything.
     */
    private function totalSectionsFor(GradingBatch $batch): int
    {
        $known = SectionGrade::where('course_id', $batch->course_id)
            ->distinct()
            ->pluck('section_name')
            ->merge($batch->submissions()->pluck('section_name'))
            ->unique()
            ->count();

        return max($known, GradingBatch::MIN_SECTIONS_FOR_AUDIT);
    }

    /**
     * Six equal bands across the assessment's mark range.
     *
     * @param  array<int, float>  $marks
     * @return array<int, array{bucket:string, count:int}>
     */
    private function distribution(array $marks, int $maxMarks): array
    {
        $bands = 6;
        $width = max(1, (int) ceil($maxMarks / $bands));

        $buckets = [];
        for ($low = 0; $low < $maxMarks; $low += $width) {
            $high = min($low + $width - 1, $maxMarks);
            $count = 0;

            foreach ($marks as $m) {
                if ($m >= $low && $m <= $high) {
                    $count++;
                }
            }

            $buckets[] = ['bucket' => "{$low}-{$high}", 'count' => $count];
        }

        return $buckets;
    }

    /**
     * @return array<string, mixed>
     */
    private function presentBatch(GradingBatch $batch, User $viewer): array
    {
        $submissions = $batch->relationLoaded('submissions')
            ? $batch->submissions
            : $batch->submissions()->with('faculty')->get();

        $mine = $submissions->firstWhere('faculty_id', $viewer->id);

        $payload = [
            'id' => $batch->id,
            'course_id' => $batch->course_id,
            'course_code' => $batch->course?->code ?? '',
            'course_title' => $batch->course?->title ?? '',
            'semester' => $batch->semester,
            'assessment_name' => $batch->assessment_name,
            'max_marks' => $batch->max_marks,
            'status' => $batch->status,
            'created_by' => $batch->created_by,
            'created_by_name' => $batch->creator?->name ?? '',
            'sections_submitted' => $submissions->count(),
            'total_sections' => $this->totalSectionsFor($batch),
            'my_submission' => $mine ? $this->presentSubmission($mine) : null,
            'created_at' => $batch->created_at?->toISOString(),
            'updated_at' => $batch->updated_at?->toISOString(),
        ];

        // Every faculty member sees who else has uploaded. Parity is a
        // comparison of colleagues' marking by design, and a teacher is
        // entitled to see how their own section sits against the others.
        $payload['submissions'] = $submissions->map(fn ($s) => $this->presentSubmission($s))->values()->all();
        $payload['obe_attainment'] = $this->obeCalculator->calculate($batch);

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function presentSubmission(GradingSubmission $submission): array
    {
        return [
            'id' => $submission->id,
            'grading_batch_id' => $submission->grading_batch_id,
            'section_name' => $submission->section_name,
            'faculty_id' => $submission->faculty_id,
            'faculty_name' => $submission->faculty?->name ?? '',
            'student_count' => $submission->student_count,
            'file_name' => $submission->file_name,
            'uploaded_at' => $submission->uploaded_at?->toISOString(),
        ];
    }

    private function forbidden(string $message): JsonResponse
    {
        return response()->json(['message' => $message], 403);
    }
}
