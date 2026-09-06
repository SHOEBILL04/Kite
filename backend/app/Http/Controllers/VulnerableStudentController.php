<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Services\Risk\RiskAnalyzer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VulnerableStudentController extends Controller
{
    public function __construct(private RiskAnalyzer $analyzer) {}

    /**
     * POST /api/audit/vulnerable-students
     */
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'course_id' => ['required_without:students', 'nullable', 'integer', 'exists:courses,id'],
            'students' => ['required_without:course_id', 'nullable', 'array'],
        ]);

        if (!empty($validated['students'])) {
            $courseId = isset($validated['course_id']) ? (int) $validated['course_id'] : null;
            return response()->json(['data' => $this->analyzer->analyzeCustomStudents($validated['students'], $courseId)]);
        }

        $course = Course::findOrFail($validated['course_id']);

        return response()->json(['data' => $this->analyzer->analyze($course)]);
    }
}
