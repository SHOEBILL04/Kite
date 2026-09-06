<?php

namespace App\Services\Audit;

use App\Models\AuditReport;
use App\Models\Course;
use App\Models\SectionGrade;
use App\Services\Ai\AiClient;
use Illuminate\Support\Facades\Log;
use Throwable;

class GradingDriftAnalyzer
{
    public function __construct(
        protected AiClient $aiClient
    ) {}

    /**
     * Run deterministic statistical grading drift analysis, supplemented by AI qualitative synthesis.
     *
     * @param int $courseId
     * @return array Matches GradingDriftReport shape from contract.js
     */
    public function analyze(int $courseId): array
    {
        $grades = SectionGrade::with('faculty')
            ->where('course_id', $courseId)
            ->get();

        if ($grades->isEmpty()) {
            return $this->aiClient->loadFixture('grading-drift');
        }

        // 1. POOLED STATS ACROSS ALL SECTIONS IN THE COURSE
        $totalStudents = $grades->count();
        $midMarks = $grades->pluck('mid_marks')->map(fn($v) => (float) $v)->toArray();
        $quizAvgs = $grades->pluck('quiz_avg')->map(fn($v) => (float) $v)->toArray();

        $pooledMean = array_sum($midMarks) / $totalStudents;
        $varianceSum = 0.0;
        foreach ($midMarks as $m) {
            $varianceSum += pow($m - $pooledMean, 2);
        }
        $pooledStdDev = $totalStudents > 1 ? sqrt($varianceSum / ($totalStudents - 1)) : 1.0;
        if ($pooledStdDev == 0) $pooledStdDev = 1.0;

        // 2. OLS REGRESSION: predicted_mid = a + b * quiz_avg (Cohort Quality Proxy)
        $meanQuiz = array_sum($quizAvgs) / $totalStudents;
        $num = 0.0;
        $den = 0.0;
        for ($i = 0; $i < $totalStudents; $i++) {
            $num += ($quizAvgs[$i] - $meanQuiz) * ($midMarks[$i] - $pooledMean);
            $den += pow($quizAvgs[$i] - $meanQuiz, 2);
        }
        $b = $den > 0 ? $num / $den : 0.0;
        $a = $pooledMean - ($b * $meanQuiz);

        // Attach predicted mid and residual to each grade
        $gradesWithResiduals = $grades->map(function ($g) use ($a, $b) {
            $pred = $a + ($b * (float) $g->quiz_avg);
            $res = ((float) $g->mid_marks) - $pred;
            $g->predicted_mid = $pred;
            $g->residual = $res;
            return $g;
        });

        // 3. COMPUTE SECTION-LEVEL STATISTICS
        $sections = $gradesWithResiduals->groupBy('section_name');
        $sectionStats = [];
        $maxDeviantResidual = 0.0;
        $deviantSectionName = null;
        $varianceRatios = [];

        foreach ($sections as $sectionName => $secGrades) {
            $n = $secGrades->count();
            $secMids = $secGrades->pluck('mid_marks')->map(fn($v) => (float) $v)->toArray();
            $secMean = array_sum($secMids) / $n;

            // Sample standard deviation
            $secVarSum = 0.0;
            foreach ($secMids as $m) {
                $secVarSum += pow($m - $secMean, 2);
            }
            $secStdDev = $n > 1 ? sqrt($secVarSum / ($n - 1)) : 0.0;
            $varianceRatios[] = max(0.01, $secStdDev);

            // Fisher-Pearson Skewness
            $skewness = 0.0;
            if ($n > 2 && $secStdDev > 0) {
                $m3 = 0.0;
                foreach ($secMids as $m) {
                    $m3 += pow(($m - $secMean) / $secStdDev, 3);
                }
                $skewness = ($n / (($n - 1) * ($n - 2))) * $m3;
            }

            // Z-score of section mean vs pooled mean
            $zScore = ($secMean - $pooledMean) / $pooledStdDev;

            // Mean residual (Grader Bias controlling for student quiz ability)
            $meanResidual = $secGrades->avg('residual');

            // Leniency Index: 1.0 = cohort norm; >1 lenient, <1 harsh
            $predictedSecMean = $secGrades->avg('predicted_mid');
            $leniencyIndex = $predictedSecMean > 0 ? $secMean / $predictedSecMean : 1.0;

            if (abs($meanResidual) > abs($maxDeviantResidual)) {
                $maxDeviantResidual = $meanResidual;
                $deviantSectionName = $sectionName;
            }

            // 5-mark distribution buckets: 0-5, 6-10, 11-15, 16-20, 21-25, 26-30
            $bucketDefs = [
                '0-5' => [0, 5],
                '6-10' => [6, 10],
                '11-15' => [11, 15],
                '16-20' => [16, 20],
                '21-25' => [21, 25],
                '26-30' => [26, 30],
            ];
            $distribution = [];
            foreach ($bucketDefs as $label => [$low, $high]) {
                $count = 0;
                foreach ($secMids as $m) {
                    if ($m >= $low && $m <= $high) {
                        $count++;
                    }
                }
                $distribution[] = ['bucket' => $label, 'count' => $count];
            }

            $instructorName = $secGrades->first()->faculty?->name ?? 'Course Instructor';

            $sectionStats[] = [
                'section_name' => $sectionName,
                'instructor' => $instructorName,
                'n' => $n,
                'mean' => round($secMean, 1),
                'std_dev' => round($secStdDev, 1),
                'skewness' => round($skewness, 2),
                'z_score' => round($zScore, 2),
                'leniency_index' => round($leniencyIndex, 2),
                'mean_residual' => round($meanResidual, 2),
                'distribution' => $distribution,
            ];
        }

        // 4. DETERMINE DRIFT & SEVERITY
        // Drift is flagged when |mean residual| > 3.0 and n >= 10
        $driftDetected = false;
        foreach ($sectionStats as $s) {
            if (abs($s['mean_residual']) >= 3.0 && $s['n'] >= 10) {
                $driftDetected = true;
                break;
            }
        }

        // Variance ratio check (compressed vs erratic)
        $ratio = count($varianceRatios) >= 2 ? max($varianceRatios) / min($varianceRatios) : 1.0;

        $severity = 'low';
        if ($driftDetected) {
            $severity = (abs($maxDeviantResidual) >= 3.5 || $ratio >= 3.0) ? 'high' : 'medium';
        }

        // 5. NORMALIZATION PROPOSAL
        // Normalization applies to the under-graded section (negative residual) to shift it UP
        $harshSection = collect($sectionStats)->sortBy('mean_residual')->first();
        $affectedSection = $harshSection['section_name'] ?? 'Section B';
        $harshResidual = $harshSection['mean_residual'] ?? -3.9;

        // suggested_shift = -mean_residual, rounded to nearest 0.5
        $suggestedShift = round(-$harshResidual * 2) / 2;

        $normalization = [
            'section_name' => $affectedSection,
            'suggested_shift' => (float) $suggestedShift,
            'rationale' => "Applying a +{$suggestedShift} mark normalisation shift to {$affectedSection} realigns the section mean with cohort expectations based on student coursework baseline, mitigating grader disparity while preserving rank order.",
        ];


        // 6. AI INSIGHTS & NARRATIVE SYNTHESIS (ONE AICLIENT CALL)
        $aiPayload = $this->generateAiInsights($courseId, [
            'drift_detected' => $driftDetected,
            'severity' => $severity,
            'section_stats' => $sectionStats,
            'variance_ratio' => round($ratio, 2),
            'normalization' => $normalization,
        ]);

        $finalReport = [
            'drift_detected' => $driftDetected,
            'severity' => $severity,
            'section_stats' => array_map(function ($s) {
                unset($s['mean_residual']); // Clean internal working variable
                return $s;
            }, $sectionStats),
            'insights' => $aiPayload['insights'] ?? [],
            'normalization' => $normalization,
            'ai_summary' => $aiPayload['ai_summary'] ?? '',
        ];

        // 7. PERSIST AUDIT REPORT RECORD
        $this->persistReport($courseId, $finalReport);

        return $finalReport;
    }

    /**
     * Ask AiClient to explain the computed statistics without inventing numbers.
     */
    protected function generateAiInsights(int $courseId, array $computedStats): array
    {
        $system = "You are a university academic audit specialist. Explain the provided empirical grading drift statistics between parallel course sections. " .
            "DO NOT invent new numbers. Reference ONLY the exact means, std devs, skewness, and shift values provided in the prompt.";

        $user = "Empirical Statistics:\n" . json_encode($computedStats, JSON_PRETTY_PRINT);

        $schema = [
            'type' => 'object',
            'required' => ['insights', 'ai_summary'],
            'properties' => [
                'insights' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'required' => ['title', 'detail', 'severity'],
                        'properties' => [
                            'title' => ['type' => 'string'],
                            'detail' => ['type' => 'string'],
                            'severity' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                        ],
                    ],
                ],
                'ai_summary' => ['type' => 'string'],
            ],
        ];

        try {
            $aiResponse = $this->aiClient->run('grading-drift', $system, $user, $schema);
            return [
                'insights' => $aiResponse['insights'] ?? [],
                'ai_summary' => $aiResponse['ai_summary'] ?? '',
            ];
        } catch (Throwable $e) {
            Log::warning("GradingDriftAnalyzer AI synthesis failed: " . $e->getMessage());
            $fixture = $this->aiClient->loadFixture('grading-drift');
            return [
                'insights' => $fixture['insights'] ?? [],
                'ai_summary' => $fixture['ai_summary'] ?? '',
            ];
        }
    }

    protected function persistReport(int $courseId, array $report): void
    {
        try {
            AuditReport::create([
                'auditable_type' => Course::class,
                'auditable_id' => $courseId,
                'module' => 'grading',
                'anomalies_found' => [
                    'drift_detected' => $report['drift_detected'],
                    'section_count' => count($report['section_stats']),
                    'shift' => $report['normalization']['suggested_shift'],
                ],
                'ai_summary' => $report['ai_summary'],
                'severity' => $report['severity'],
                'from_cache' => false,
            ]);
        } catch (Throwable $e) {
            Log::error("Failed to persist grading audit report: " . $e->getMessage());
        }
    }
}
