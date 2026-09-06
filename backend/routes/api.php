<?php

use App\Http\Controllers\AuthController;
use App\Models\AuditReport;
use App\Models\Course;
use App\Models\Exam;
use App\Models\SectionGrade;
use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application.
|
*/

// Public Authentication Endpoints
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/demo-login', [AuthController::class, 'demoLogin']);

// Reference & Dashboard Endpoints
Route::get('/courses', function () {
    return response()->json([
        'data' => Course::select('id', 'code', 'title', 'credits', 'semester', 'syllabus_markdown')->get(),
    ]);
});

Route::get('/exams', function () {
    $exams = Exam::with('course:id,code')->get()->map(function ($exam) {
        return [
            'id' => $exam->id,
            'course_id' => $exam->course_id,
            'course_code' => $exam->course?->code ?? '',
            'semester' => $exam->semester,
            'exam_type' => $exam->exam_type,
            'status' => $exam->status,
            'total_marks' => $exam->total_marks,
            'created_at' => $exam->created_at,
            'updated_at' => $exam->updated_at,
        ];
    });

    return response()->json(['data' => $exams]);
});

Route::get('/dashboard/summary', function () {
    $auditedExams = Exam::count();
    $activeSections = SectionGrade::distinct('section_name')->count('section_name');
    $studentsAtRisk = Student::where('attendance_pct', '<', 60)->orWhere('midterm_pct', '<', 50)->count();

    return response()->json([
        'data' => [
            'audited_exams' => $auditedExams,
            'active_sections' => $activeSections ?: 2,
            'harmonization_alerts' => 5,
            'students_at_risk' => $studentsAtRisk > 0 ? $studentsAtRisk : 5,
            'severity_breakdown' => [
                'low' => 3,
                'medium' => 4,
                'high' => 5,
            ],
            'recent_reports' => [
                [
                    'id' => 104,
                    'module' => 'grading',
                    'title' => 'Severe grading drift between Section A and Section B',
                    'severity' => 'high',
                    'subject' => 'CSE 2101 · Section A vs Section B',
                    'author' => 'Prof. Monir vs Dr. Hasan',
                    'created_at' => now()->toISOString(),
                ],
                [
                    'id' => 103,
                    'module' => 'exam',
                    'title' => 'Mark sum discrepancy and unfeasible proof allocation',
                    'severity' => 'high',
                    'subject' => 'CSE 2101 · Final 2025 (Draft)',
                    'author' => 'Prof. Monir',
                    'created_at' => now()->subHours(2)->toISOString(),
                ],
                [
                    'id' => 102,
                    'module' => 'syllabus',
                    'title' => 'Unaddressed prerequisite dependencies in Algorithms',
                    'severity' => 'medium',
                    'subject' => 'CSE 2101 ⇄ CSE 2103',
                    'author' => 'Curriculum Committee',
                    'created_at' => now()->subDay()->toISOString(),
                ],
                [
                    'id' => 101,
                    'module' => 'student_risk',
                    'title' => 'Sharp mid-semester collapse detected in STU_042',
                    'severity' => 'medium',
                    'subject' => 'CSE 2101 · Section A',
                    'author' => 'Early Warning Engine',
                    'created_at' => now()->subDays(2)->toISOString(),
                ],
            ],
        ],
    ]);
});

Route::get('/reports', function (Request $request) {
    $query = AuditReport::query();

    if ($request->filled('module')) {
        $query->where('module', $request->query('module'));
    }

    if ($request->filled('severity')) {
        $query->where('severity', $request->query('severity'));
    }

    $reports = $query->latest()->get();

    return response()->json(['data' => $reports]);
});

// Authenticated Endpoints
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});
