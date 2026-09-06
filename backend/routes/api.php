<?php

use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\VulnerableStudentController;
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
*/

// Public Authentication Endpoints
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/demo-login', [AuthController::class, 'demoLogin']);

// Reference data
Route::get('/courses', [AuditController::class, 'courses']);
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

Route::get('/exams/{exam}/questions', [AuditController::class, 'examQuestions']);

// Dashboard & Reports
Route::get('/dashboard/summary', [AuditController::class, 'dashboardSummary']);
Route::get('/reports', [AuditController::class, 'reports']);

// Audit Engines
Route::post('/audit/grading-drift', [AuditController::class, 'gradingDrift']);
Route::post('/audit/syllabus', [AuditController::class, 'syllabus']);
Route::post('/audit/exam-moderation', [AuditController::class, 'examModeration']);
Route::post('/audit/vulnerable-students', VulnerableStudentController::class);

// Authenticated Endpoints (Sanctum Protected)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});
