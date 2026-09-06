<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Exam;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditEnginesTest extends TestCase
{
    protected User $user;
    protected Course $courseCSE2101;
    protected Course $courseCSE2103;
    protected Exam $draftExam;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::first() ?? User::factory()->create();
        Sanctum::actingAs($this->user);

        $this->courseCSE2101 = Course::where('code', 'CSE 2101')->firstOrFail();
        $this->courseCSE2103 = Course::where('code', 'CSE 2103')->firstOrFail();
        $this->draftExam = Exam::where('semester', 'Fall 2025')->where('status', 'draft')->firstOrFail();
    }

    public function test_grading_drift_calculates_deterministic_ols_and_zscore(): void
    {
        $response = $this->postJson('/api/audit/grading-drift', [
            'course_id' => $this->courseCSE2101->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'drift_detected',
                    'severity',
                    'section_stats' => [
                        '*' => [
                            'section_name',
                            'instructor',
                            'n',
                            'mean',
                            'std_dev',
                            'skewness',
                            'z_score',
                            'leniency_index',
                            'distribution',
                        ],
                    ],
                    'insights',
                    'normalization' => [
                        'section_name',
                        'suggested_shift',
                        'rationale',
                    ],
                    'ai_summary',
                ],
            ]);

        $data = $response->json('data');

        $this->assertTrue($data['drift_detected']);
        $this->assertEquals('high', $data['severity']);
        $this->assertCount(2, $data['section_stats']);

        // Check Section A (Monir) and Section B (Hasan) statistics
        $secA = collect($data['section_stats'])->firstWhere('section_name', 'Section A');
        $secB = collect($data['section_stats'])->firstWhere('section_name', 'Section B');

        $this->assertNotNull($secA);
        $this->assertNotNull($secB);

        $this->assertEquals(20, $secA['n']);
        $this->assertEquals(20, $secB['n']);

        // Section A is around 24.0, Section B around 16.5
        $this->assertGreaterThan(22.0, $secA['mean']);
        $this->assertLessThan(18.0, $secB['mean']);

        // Suggested shift for Section B should be positive
        $this->assertGreaterThan(0, $data['normalization']['suggested_shift']);

        // Verify audit_reports table entry
        $this->assertDatabaseHas('audit_reports', [
            'auditable_type' => Course::class,
            'auditable_id' => $this->courseCSE2101->id,
            'module' => 'grading',
        ]);
    }

    public function test_syllabus_harmonizer_computes_deterministic_alignment_score(): void
    {
        $response = $this->postJson('/api/audit/syllabus', [
            'course_a_id' => $this->courseCSE2101->id,
            'course_b_id' => $this->courseCSE2103->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'alignment_score',
                    'redundant_topics',
                    'missing_prerequisites',
                    'bloom_coverage',
                    'actionable_changes',
                    'ai_summary',
                ],
            ]);

        $data = $response->json('data');

        // Score must be clamped between 0 and 100
        $this->assertGreaterThanOrEqual(0, $data['alignment_score']);
        $this->assertLessThanOrEqual(100, $data['alignment_score']);

        $this->assertDatabaseHas('audit_reports', [
            'auditable_type' => Course::class,
            'auditable_id' => $this->courseCSE2101->id,
            'module' => 'syllabus',
        ]);
    }

    public function test_syllabus_harmonizer_handles_custom_uploaded_curricula(): void
    {
        $syllabusA = file_get_contents(storage_path('app/samples/curriculum_cse2101_data_structures.md'));
        $syllabusB = file_get_contents(storage_path('app/samples/curriculum_cse2103_algorithms.md'));

        $response = $this->postJson('/api/audit/syllabus', [
            'syllabus_a_markdown' => $syllabusA,
            'syllabus_b_markdown' => $syllabusB,
            'course_a_code' => 'CSE 2101',
            'course_b_code' => 'CSE 2103',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'alignment_score',
                    'redundant_topics',
                    'missing_prerequisites',
                    'bloom_coverage',
                    'actionable_changes',
                    'ai_summary',
                ],
            ]);

        $data = $response->json('data');
        $this->assertGreaterThan(0, count($data['redundant_topics']));
        $this->assertNotEmpty($data['ai_summary']);
    }

    public function test_cross_audit_new_course_against_catalog_with_groq(): void
    {
        $proposedSyllabus = file_get_contents(storage_path('app/samples/curriculum_proposed_cse3105_machine_learning.md'));

        $response = $this->postJson('/api/audit/syllabus/cross-audit', [
            'syllabus_markdown' => $proposedSyllabus,
            'code' => 'CSE 3105',
            'title' => 'Machine Learning & Data Analytics',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'proposed_course',
                    'most_matched_course',
                    'catalog_matches',
                    'novel_topics',
                    'novel_topics_count',
                    'bloom_coverage',
                    'ai_summary',
                ],
            ]);

        $data = $response->json('data');
        $this->assertEquals('CSE 3105', $data['proposed_course']['code']);
        $this->assertNotEmpty($data['most_matched_course']['course_code']);
        $this->assertGreaterThan(0, $data['novel_topics_count']);
        $this->assertNotEmpty($data['ai_summary']);
    }

    public function test_exam_moderator_flags_mark_sum_and_jaccard_duplicates(): void
    {
        $response = $this->postJson('/api/audit/exam-moderation', [
            'exam_id' => $this->draftExam->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'mark_sum_valid',
                    'calculated_total',
                    'declared_total',
                    'questions' => [
                        '*' => [
                            'q_number',
                            'text',
                            'marks',
                            'assigned_bloom_level',
                            'detected_bloom_level',
                            'verdict',
                            'flags',
                        ],
                    ],
                    'duplicates',
                    'cognitive_balance',
                    'ai_summary',
                ],
            ]);

        $data = $response->json('data');

        // Mark sum planted defect: sums to 72, declared is 70
        $this->assertFalse($data['mark_sum_valid']);
        $this->assertEquals(72, $data['calculated_total']);
        $this->assertEquals(70, $data['declared_total']);

        // Jaccard similarity must catch planted Q4 duplicate
        $q4 = collect($data['questions'])->firstWhere('q_number', '4');
        $this->assertNotNull($q4);
        $this->assertEquals('critical', $q4['verdict']);
        $this->assertNotEmpty($data['duplicates']);

        $this->assertDatabaseHas('audit_reports', [
            'auditable_type' => Exam::class,
            'auditable_id' => $this->draftExam->id,
            'module' => 'exam',
        ]);
    }

    public function test_dashboard_summary_and_reports_endpoints(): void
    {
        $summaryRes = $this->getJson('/api/dashboard/summary');
        $summaryRes->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'audited_exams',
                    'active_sections',
                    'harmonization_alerts',
                    'students_at_risk',
                    'severity_breakdown',
                    'recent_reports',
                ],
            ]);

        $reportsRes = $this->getJson('/api/reports?module=grading');
        $reportsRes->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'module',
                        'title',
                        'subject',
                        'severity',
                        'ai_summary',
                        'anomaly_count',
                        'from_cache',
                        'created_at',
                    ],
                ],
            ]);

        $coursesRes = $this->getJson('/api/courses');
        $coursesRes->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'code', 'title', 'credits', 'semester'],
                ],
            ]);
    }

    public function test_exam_moderator_handles_custom_uploaded_questions_without_ai(): void
    {
        $balancedPath = storage_path('app/samples/sample_exam_balanced.json');
        $this->assertFileExists($balancedPath);
        $balancedSample = json_decode(file_get_contents($balancedPath), true);

        $resBalanced = $this->postJson('/api/audit/exam-moderation', [
            'declared_total' => 70,
            'course_id' => $this->courseCSE2101->id,
            'questions' => $balancedSample,
        ]);

        $resBalanced->assertStatus(200)
            ->assertJsonPath('data.mark_sum_valid', true)
            ->assertJsonPath('data.calculated_total', 70)
            ->assertJsonPath('data.cognitive_balance.verdict', 'pass');

        $this->assertEmpty($resBalanced->json('data.duplicates'));

        // Now test defective sample
        $defectivePath = storage_path('app/samples/sample_exam_defective.json');
        $this->assertFileExists($defectivePath);
        $defectiveSample = json_decode(file_get_contents($defectivePath), true);

        $resDefective = $this->postJson('/api/audit/exam-moderation', [
            'declared_total' => 70,
            'course_id' => $this->courseCSE2101->id,
            'questions' => $defectiveSample,
        ]);

        $resDefective->assertStatus(200)
            ->assertJsonPath('data.mark_sum_valid', false)
            ->assertJsonPath('data.calculated_total', 72);

        $this->assertNotEmpty($resDefective->json('data.duplicates'));
    }

    public function test_vulnerable_students_handles_custom_uploaded_cohort_without_ai(): void
    {
        // 1. Test High Risk Cohort
        $highRiskPath = storage_path('app/samples/students_high_risk_cohort.csv');
        $this->assertFileExists($highRiskPath);

        $csvLines = array_map('str_getcsv', file($highRiskPath));
        $header = array_shift($csvLines);
        $highRiskStudents = [];
        foreach ($csvLines as $row) {
            if (count($row) === count($header)) {
                $highRiskStudents[] = array_combine($header, $row);
            }
        }

        $resHighRisk = $this->postJson('/api/audit/vulnerable-students', [
            'students' => $highRiskStudents,
        ]);

        $resHighRisk->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'at_risk_count',
                    'students' => [
                        '*' => [
                            'student_hash',
                            'section_name',
                            'risk_level',
                            'risk_score',
                            'ml_probability',
                            'attendance_pct',
                            'quiz_trend',
                            'midterm_pct',
                            'triggers',
                            'recommended_action',
                            'narrative',
                        ],
                    ],
                ],
            ]);

        $dataHigh = $resHighRisk->json('data');
        $this->assertGreaterThan(0, $dataHigh['at_risk_count']);

        $stu042 = collect($dataHigh['students'])->firstWhere('student_hash', 'STU_042');
        $this->assertNotNull($stu042);
        $this->assertContains($stu042['risk_level'], ['high', 'critical', 'medium']);
        $this->assertNotEmpty($stu042['triggers']);

        // 2. Test Safe Cohort
        $safePath = storage_path('app/samples/students_safe_balanced_cohort.csv');
        $this->assertFileExists($safePath);

        $safeLines = array_map('str_getcsv', file($safePath));
        $safeHeader = array_shift($safeLines);
        $safeStudents = [];
        foreach ($safeLines as $row) {
            if (count($row) === count($safeHeader)) {
                $safeStudents[] = array_combine($safeHeader, $row);
            }
        }

        $resSafe = $this->postJson('/api/audit/vulnerable-students', [
            'students' => $safeStudents,
        ]);

        $resSafe->assertStatus(200);
        $dataSafe = $resSafe->json('data');
        $this->assertEquals(0, $dataSafe['at_risk_count']);
        foreach ($dataSafe['students'] as $s) {
            $this->assertEquals('low', $s['risk_level']);
        }
    }
}
