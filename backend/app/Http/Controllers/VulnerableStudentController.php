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
            'course_id' => ['required', 'integer', 'exists:courses,id'],
        ]);

        $course = Course::findOrFail($validated['course_id']);

        return response()->json(['data' => $this->analyzer->analyze($course)]);
    }
}
