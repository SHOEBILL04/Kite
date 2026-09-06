<?php

namespace App\Services\Grading;

use App\Models\GradingBatch;
use App\Models\SectionGrade;

class ObeAttainmentCalculator
{
    /** Standard benchmark threshold: student must achieve at least 50% marks to attain a CLO. */
    public const BENCHMARK_PASS_PCT = 50.0;

    /** International accreditation threshold: at least 70% of students must achieve the benchmark. */
    public const ACCREDITATION_TARGET_PCT = 70.0;

    /**
     * Compute comprehensive OBE CLO Attainment for a grading batch.
     *
     * @return array<string, mixed>
     */
    public function calculate(GradingBatch $batch): array
    {
        $grades = SectionGrade::where('grading_batch_id', $batch->id)
            ->with(['submission.faculty'])
            ->get();

        $maxMarks = max(1, $batch->max_marks);
        $totalStudents = $grades->count();

        // Standard 4 Course Learning Outcomes (OBE Framework)
        $cloDefinitions = [
            'CLO1' => [
                'code' => 'CLO1',
                'title' => 'Foundational Data Structures & ADTs',
                'bloom_domain' => 'C1-C2 (Knowledge & Comprehension)',
                'weight_pct' => 25,
            ],
            'CLO2' => [
                'code' => 'CLO2',
                'title' => 'Complex Structures & Hierarchical Trees',
                'bloom_domain' => 'C3 (Application)',
                'weight_pct' => 30,
            ],
            'CLO3' => [
                'code' => 'CLO3',
                'title' => 'Graph Algorithms & Practical Problem Solving',
                'bloom_domain' => 'C4 (Analysis)',
                'weight_pct' => 25,
            ],
            'CLO4' => [
                'code' => 'CLO4',
                'title' => 'Algorithmic Complexity & Optimization Trade-offs',
                'bloom_domain' => 'C5-C6 (Evaluation & Creation)',
                'weight_pct' => 20,
            ],
        ];

        if ($totalStudents === 0) {
            return [
                'batch_id' => $batch->id,
                'course_code' => $batch->course?->code ?? '',
                'assessment_name' => $batch->assessment_name,
                'max_marks' => $maxMarks,
                'total_students' => 0,
                'sections_count' => 0,
                'overall_attainment_pct' => 0.0,
                'verdict' => 'Pending Submissions',
                'verdict_tone' => 'warning',
                'clo_attainments' => [],
                'section_breakdown' => [],
                'cqi_actions' => ['No student marks submitted yet.'],
            ];
        }

        // Group by section
        $sections = $grades->groupBy('section_name');
        $sectionBreakdown = [];

        foreach ($sections as $secName => $secGrades) {
            $nSec = $secGrades->count();
            $secFacultyName = $secGrades->first()?->submission?->faculty?->name
                ?? $secGrades->first()?->faculty?->name
                ?? 'Assigned Faculty';

            $secClos = [];
            foreach ($cloDefinitions as $cloCode => $cloDef) {
                $attainedCount = 0;
                $scoresSum = 0.0;

                foreach ($secGrades as $row) {
                    $scorePct = $this->calculateStudentCloScorePct($row, $maxMarks, $cloCode);
                    $scoresSum += $scorePct;
                    if ($scorePct >= self::BENCHMARK_PASS_PCT) {
                        $attainedCount++;
                    }
                }

                $attainmentRate = $nSec > 0 ? round(($attainedCount / $nSec) * 100, 1) : 0.0;
                $avgScore = $nSec > 0 ? round($scoresSum / $nSec, 1) : 0.0;

                $secClos[$cloCode] = [
                    'clo' => $cloCode,
                    'attained_count' => $attainedCount,
                    'total_students' => $nSec,
                    'attainment_rate_pct' => $attainmentRate,
                    'avg_score_pct' => $avgScore,
                    'status' => $attainmentRate >= self::ACCREDITATION_TARGET_PCT ? 'achieved' : ($attainmentRate >= 50.0 ? 'moderate' : 'action_required'),
                ];
            }

            $secOverallAttainment = round(array_sum(array_column($secClos, 'attainment_rate_pct')) / count($secClos), 1);

            $sectionBreakdown[] = [
                'section_name' => $secName,
                'faculty_name' => $secFacultyName,
                'student_count' => $nSec,
                'overall_attainment_pct' => $secOverallAttainment,
                'status' => $secOverallAttainment >= self::ACCREDITATION_TARGET_PCT ? 'Compliant' : ($secOverallAttainment >= 50.0 ? 'Needs Attention' : 'Critical Gap'),
                'clo_metrics' => $secClos,
            ];
        }

        // Cohort-wide CLO attainment
        $cohortClos = [];
        $totalAttainmentSum = 0.0;
        $cqiActions = [];

        foreach ($cloDefinitions as $cloCode => $cloDef) {
            $attainedCount = 0;
            $scoresSum = 0.0;

            foreach ($grades as $row) {
                $scorePct = $this->calculateStudentCloScorePct($row, $maxMarks, $cloCode);
                $scoresSum += $scorePct;
                if ($scorePct >= self::BENCHMARK_PASS_PCT) {
                    $attainedCount++;
                }
            }

            $attainmentRate = round(($attainedCount / $totalStudents) * 100, 1);
            $avgScore = round($scoresSum / $totalStudents, 1);
            $totalAttainmentSum += $attainmentRate;

            $status = $attainmentRate >= self::ACCREDITATION_TARGET_PCT
                ? 'achieved'
                : ($attainmentRate >= 50.0 ? 'moderate' : 'action_required');

            if ($status !== 'achieved') {
                $cqiActions[] = sprintf(
                    '%s (%s) attainment is at %.1f%% (target: 70%%). Recommend remedial problem-solving sessions and lab tutorials.',
                    $cloCode,
                    $cloDef['title'],
                    $attainmentRate
                );
            }

            $cohortClos[] = [
                'code' => $cloCode,
                'title' => $cloDef['title'],
                'bloom_domain' => $cloDef['bloom_domain'],
                'weight_pct' => $cloDef['weight_pct'],
                'benchmark_pass_pct' => self::BENCHMARK_PASS_PCT,
                'attained_students' => $attainedCount,
                'total_students' => $totalStudents,
                'attainment_rate_pct' => $attainmentRate,
                'avg_score_pct' => $avgScore,
                'target_met' => $attainmentRate >= self::ACCREDITATION_TARGET_PCT,
                'status' => $status,
            ];
        }

        $overallAttainmentPct = round($totalAttainmentSum / count($cloDefinitions), 1);

        // Section parity gap check
        if (count($sectionBreakdown) >= 2) {
            $secA = $sectionBreakdown[0];
            $secB = $sectionBreakdown[1];
            $diff = abs($secA['overall_attainment_pct'] - $secB['overall_attainment_pct']);
            if ($diff > 12.0) {
                $cqiActions[] = sprintf(
                    'Parity Alert: %.1f%% attainment gap between %s (%.1f%%) and %s (%.1f%%). Teaching team harmonization recommended.',
                    $diff,
                    $secA['section_name'],
                    $secA['overall_attainment_pct'],
                    $secB['section_name'],
                    $secB['overall_attainment_pct']
                );
            }
        }

        if (empty($cqiActions)) {
            $cqiActions[] = 'All course learning outcomes meet or exceed the 70% OBE accreditation benchmark. Maintain current curriculum pacing.';
        }

        $verdict = $overallAttainmentPct >= self::ACCREDITATION_TARGET_PCT
            ? 'Accreditation Ready'
            : ($overallAttainmentPct >= 50.0 ? 'Substantially Compliant' : 'Remediation Required');

        $verdictTone = $overallAttainmentPct >= self::ACCREDITATION_TARGET_PCT
            ? 'pass'
            : ($overallAttainmentPct >= 50.0 ? 'warning' : 'critical');

        return [
            'batch_id' => $batch->id,
            'course_code' => $batch->course?->code ?? '',
            'assessment_name' => $batch->assessment_name,
            'max_marks' => $maxMarks,
            'total_students' => $totalStudents,
            'sections_count' => count($sectionBreakdown),
            'benchmark_threshold_pct' => self::BENCHMARK_PASS_PCT,
            'accreditation_target_pct' => self::ACCREDITATION_TARGET_PCT,
            'overall_attainment_pct' => $overallAttainmentPct,
            'verdict' => $verdict,
            'verdict_tone' => $verdictTone,
            'clo_attainments' => $cohortClos,
            'section_breakdown' => $sectionBreakdown,
            'cqi_actions' => $cqiActions,
        ];
    }

    /**
     * Compute a student's score percentage for a given Course Learning Outcome.
     * Evaluates assessment performance with cognitive weighting.
     */
    private function calculateStudentCloScorePct(SectionGrade $row, int $maxMarks, string $cloCode): float
    {
        $midScorePct = ($row->mid_marks / $maxMarks) * 100.0;
        $quizPct = (float) ($row->quiz_avg ?? 0);
        $attPct = (float) ($row->attendance_pct ?? 0);

        // Realistic curriculum weighting across outcomes:
        // CLO1 (Foundational): reinforced by quiz recall and mid core
        // CLO2 (Structures): weighted heavily by mid analytical problems
        // CLO3 (Practical algorithms): mid + quiz continuous testing
        // CLO4 (Complexity & trade-offs): advanced analytical mid questions
        switch ($cloCode) {
            case 'CLO1':
                $pct = (0.60 * $midScorePct) + (0.30 * $quizPct) + (0.10 * $attPct);
                break;
            case 'CLO2':
                $pct = (0.75 * $midScorePct) + (0.25 * $quizPct);
                break;
            case 'CLO3':
                $pct = (0.70 * $midScorePct) + (0.20 * $quizPct) + (0.10 * $attPct);
                break;
            case 'CLO4':
            default:
                // Higher-order analytical rigor: requires solid mid performance
                $pct = (0.85 * $midScorePct) + (0.15 * $quizPct);
                break;
        }

        return max(0.0, min(100.0, round($pct, 1)));
    }
}
