<?php

namespace App\Services\Risk;

use App\Models\AuditReport;
use App\Models\Course;
use App\Models\Student;
use App\Services\Ai\AiClient;
use Illuminate\Support\Collection;

/**
 * Orchestrates the two independent scorers and reconciles them.
 *
 * The comparison is the point. RuleEngine encodes what the faculty already
 * believe risk looks like; MlScorer encodes what the data says it looks like.
 * Where they agree, the flag is easy to defend. Where they disagree, that
 * disagreement is itself the finding -- so `agreement` is surfaced per student
 * rather than hidden behind a blended score.
 *
 * The final tier is the MORE SEVERE of the two. For a support system,
 * under-flagging costs a student and over-flagging costs an advisor ten
 * minutes, so the bias is deliberately conservative.
 */
class RiskAnalyzer
{
    /**
     * These constraints are contractual, not stylistic. They are what makes it
     * defensible to put a generated sentence about a real student in front of
     * an advisor, so they are passed to the model verbatim on every request.
     */
    private const SYSTEM_PROMPT = <<<'PROMPT'
    You are an academic early-warning assistant supporting university faculty advisors.

    You must obey all of the following constraints:
    - Reference ONLY the supplied academic metrics.
    - Never speculate about personal, family, financial, medical, or psychological causes.
    - Never diagnose anything.
    - Frame every recommendation as a supportive academic intervention an advisor could act on this week.
    - Address the student by pseudonymous hash only.
    - Output must be non-judgmental in tone.

    Example of the target quality:
    "STU_042 sustained strong performance through week 4 (quiz avg 78) before a sharp decline in weeks 5-6 (quiz 3: 38, midterm: 41) while attendance remained high at 82%. The pattern suggests a specific conceptual block rather than disengagement. Recommended: advisor check-in focused on the dynamic programming unit, plus an optional problem-solving session before the final."
    PROMPT;

    /** Rule/ML tiers are internal; the API contract speaks low/medium/high. */
    private const TIER_TO_SEVERITY = [
        RuleEngine::TIER_SAFE => 'low',
        RuleEngine::TIER_MODERATE => 'medium',
        RuleEngine::TIER_CRITICAL => 'high',
    ];

    private const TIER_RANK = [
        RuleEngine::TIER_SAFE => 0,
        RuleEngine::TIER_MODERATE => 1,
        RuleEngine::TIER_CRITICAL => 2,
    ];

    public function __construct(
        private RuleEngine $rules,
        private MlScorer $ml,
        private AiClient $ai,
    ) {}

    /**
     * Analyze every student in a course.
     *
     * @return array{at_risk_count:int, students:array<int, array<string, mixed>>}
     */
    public function analyze(Course $course): array
    {
        $students = Student::where('course_id', $course->id)->get();

        $analyzed = $students
            ->map(fn (Student $student) => $this->scoreStudent($student))
            ->sortByDesc('risk_score')
            ->values();

        $this->persistScores($analyzed);

        // Only flagged students get a narrative -- a safe student does not need
        // an advisor intervention, and the tokens are better spent elsewhere.
        $flagged = $analyzed->filter(fn (array $s) => $s['tier'] !== RuleEngine::TIER_SAFE)->values();

        $narratives = $this->generateNarratives($flagged);

        $payloadStudents = $analyzed
            ->map(fn (array $s) => $this->toContractShape($s, $narratives[$s['student_hash']] ?? null))
            ->values()
            ->all();

        $report = [
            'at_risk_count' => $flagged->count(),
            'students' => $payloadStudents,
        ];

        $this->persistAuditReport($course, $analyzed, $flagged);

        return $report;
    }

    /**
     * Analyze custom uploaded student cohort data in real-time (100% deterministic, zero AI API dependency).
     *
     * @param  array<int, array<string, mixed>>  $rawStudents
     * @param  int|null  $courseId
     * @return array{at_risk_count:int, students:array<int, array<string, mixed>>}
     */
    public function analyzeCustomStudents(array $rawStudents, ?int $courseId = null): array
    {
        $analyzed = collect($rawStudents)->map(function (array $row) use ($courseId) {
            $student = new Student([
                'course_id' => $courseId ?? 1,
                'student_hash' => (string) ($row['student_hash'] ?? 'STU_'.uniqid()),
                'section_name' => (string) ($row['section_name'] ?? 'Section A'),
                'attendance_pct' => (int) ($row['attendance_pct'] ?? 80),
                'quiz1' => (float) ($row['quiz1'] ?? 75),
                'quiz2' => (float) ($row['quiz2'] ?? 75),
                'quiz3' => (float) ($row['quiz3'] ?? 75),
                'midterm_pct' => (float) ($row['midterm_pct'] ?? 75),
                'assignment_delay_count' => (int) ($row['assignment_delay_count'] ?? 0),
            ]);

            return $this->scoreStudent($student);
        })
        ->sortByDesc('risk_score')
        ->values();

        $flagged = $analyzed->filter(fn (array $s) => $s['tier'] !== RuleEngine::TIER_SAFE)->values();

        $payloadStudents = $analyzed
            ->map(fn (array $s) => $this->toContractShape($s, null))
            ->values()
            ->all();

        return [
            'at_risk_count' => $flagged->count(),
            'students' => $payloadStudents,
        ];
    }

    /**
     * Run both scorers over one student and reconcile them.
     *
     * @return array<string, mixed>
     */
    private function scoreStudent(Student $student): array
    {
        $rule = $this->rules->score($student);
        $ml = $this->ml->score($student);

        // Conservative bias: take the worse of the two verdicts.
        $tier = self::TIER_RANK[$ml['tier']] > self::TIER_RANK[$rule['tier']]
            ? $ml['tier']
            : $rule['tier'];

        return [
            'model' => $student,
            'student_hash' => $student->student_hash,
            'section_name' => $student->section_name,
            'risk_score' => $rule['score'],
            'ml_probability' => $ml['probability'],
            'rule_tier' => $rule['tier'],
            'ml_tier' => $ml['tier'],
            'tier' => $tier,
            'agreement' => $rule['tier'] === $ml['tier'],
            'factors' => $rule['factors'],
        ];
    }

    /**
     * ONE batched call for every flagged student. Per-student calls would be
     * simpler but would exhaust free-tier rate limits on a class of thirty, and
     * the model writes better comparative narratives when it can see the cohort.
     *
     * @param  Collection<int, array<string, mixed>>  $flagged
     * @return array<string, array{narrative:string, recommended_action:string}>
     */
    private function generateNarratives(Collection $flagged): array
    {
        if ($flagged->isEmpty()) {
            return [];
        }

        $payload = $flagged->map(function (array $s) {
            /** @var Student $student */
            $student = $s['model'];

            return [
                'student_hash' => $s['student_hash'],
                'attendance_pct' => (float) $student->attendance_pct,
                'quiz_scores' => [(float) $student->quiz1, (float) $student->quiz2, (float) $student->quiz3],
                'midterm_pct' => (float) $student->midterm_pct,
                'late_assignments' => (int) $student->assignment_delay_count,
                'risk_score' => $s['risk_score'],
                'ml_probability' => $s['ml_probability'],
                'risk_level' => $s['tier'],
                'scorers_agree' => $s['agreement'],
                'triggered_rules' => array_map(
                    fn (array $f) => $f['factor'].' -- '.$f['evidence'],
                    $s['factors']
                ),
            ];
        })->all();

        $prompt = "Write one narrative and one recommended action for each of the following students.\n\n"
            .json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            ."\n\nReturn an entry for every student_hash listed above.";

        $result = $this->ai->structured(self::SYSTEM_PROMPT, $prompt, $this->narrativeSchema());

        $byHash = [];
        foreach ($result['students'] ?? [] as $entry) {
            if (isset($entry['student_hash'], $entry['narrative'], $entry['recommended_action'])) {
                $byHash[$entry['student_hash']] = [
                    'narrative' => $entry['narrative'],
                    'recommended_action' => $entry['recommended_action'],
                ];
            }
        }

        return $byHash;
    }

    /**
     * @return array<string, mixed>
     */
    private function narrativeSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'students' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'student_hash' => [
                                'type' => 'string',
                                'description' => 'The pseudonymous hash exactly as supplied.',
                            ],
                            'narrative' => [
                                'type' => 'string',
                                'description' => 'One paragraph describing the academic pattern in the supplied metrics.',
                            ],
                            'recommended_action' => [
                                'type' => 'string',
                                'description' => 'One supportive academic intervention an advisor could act on this week.',
                            ],
                        ],
                        'required' => ['student_hash', 'narrative', 'recommended_action'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['students'],
            'additionalProperties' => false,
        ];
    }

    /**
     * Write the scores back so the dashboard and reports can read them without
     * re-running the audit.
     *
     * @param  Collection<int, array<string, mixed>>  $analyzed
     */
    private function persistScores(Collection $analyzed): void
    {
        foreach ($analyzed as $s) {
            /** @var Student $student */
            $student = $s['model'];
            $student->forceFill([
                'risk_score' => $s['risk_score'],
                'ml_probability' => $s['ml_probability'],
                'risk_level' => $s['tier'],
            ])->save();
        }
    }

    /**
     * Shape one student for the API contract. `risk_level` is translated from
     * the internal safe/moderate/critical tier to the contract's low/medium/high.
     *
     * @param  array<string, mixed>  $s
     * @param  array{narrative:string, recommended_action:string}|null  $narrative
     * @return array<string, mixed>
     */
    private function toContractShape(array $s, ?array $narrative): array
    {
        /** @var Student $student */
        $student = $s['model'];

        return [
            'student_hash' => $s['student_hash'],
            'section_name' => $s['section_name'],
            'risk_level' => self::TIER_TO_SEVERITY[$s['tier']],
            'risk_score' => $s['risk_score'],
            'ml_probability' => $s['ml_probability'],
            'attendance_pct' => (int) $student->attendance_pct,
            'quiz_trend' => [(float) $student->quiz1, (float) $student->quiz2, (float) $student->quiz3],
            'midterm_pct' => (float) $student->midterm_pct,
            'triggers' => array_column($s['factors'], 'factor'),
            'recommended_action' => $narrative['recommended_action'] ?? $this->fallbackAction($s),
            'narrative' => $narrative['narrative'] ?? $this->fallbackNarrative($s),

            // Beyond the contract's required fields, but additive and relied on
            // by the "why was this flagged" drawer and the two-scorer comparison.
            'agreement' => $s['agreement'],
            'rule_tier' => $s['rule_tier'],
            'ml_tier' => $s['ml_tier'],
            'factors' => $s['factors'],
        ];
    }

    /**
     * Deterministic stand-in used when the AI call is unavailable. Built from
     * the same itemized evidence, so the report degrades rather than breaks.
     *
     * @param  array<string, mixed>  $s
     */
    private function fallbackNarrative(array $s): string
    {
        if ($s['factors'] === []) {
            return sprintf(
                '%s shows no rule-based risk indicators; the model places failure probability at %.0f%%.',
                $s['student_hash'],
                $s['ml_probability'] * 100
            );
        }

        return sprintf(
            '%s scored %d/100 on the rule engine with a model probability of %.0f%%. Contributing factors: %s',
            $s['student_hash'],
            $s['risk_score'],
            $s['ml_probability'] * 100,
            implode(' ', array_column($s['factors'], 'evidence'))
        );
    }

    /**
     * @param  array<string, mixed>  $s
     */
    private function fallbackAction(array $s): string
    {
        return match ($s['tier']) {
            RuleEngine::TIER_CRITICAL => 'Schedule a one-to-one advisor check-in this week to review the flagged coursework.',
            RuleEngine::TIER_MODERATE => 'Invite the student to an optional review session covering the recent assessment topics.',
            default => 'No intervention required; continue routine monitoring.',
        };
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $analyzed
     * @param  Collection<int, array<string, mixed>>  $flagged
     */
    private function persistAuditReport(Course $course, Collection $analyzed, Collection $flagged): void
    {
        $critical = $flagged->where('tier', RuleEngine::TIER_CRITICAL)->count();
        $disagreements = $analyzed->where('agreement', false)->count();

        $severity = match (true) {
            $critical > 0 => 'high',
            $flagged->isNotEmpty() => 'medium',
            default => 'low',
        };

        AuditReport::create([
            'auditable_type' => Course::class,
            'auditable_id' => $course->id,
            'module' => 'student_risk',
            'anomalies_found' => [
                'analyzed' => $analyzed->count(),
                'at_risk' => $flagged->count(),
                'critical' => $critical,
                'scorer_disagreements' => $disagreements,
                'model_version' => $this->ml->version(),
                'model_metrics' => $this->ml->metrics(),
                'students' => $flagged->map(fn (array $s) => [
                    'student_hash' => $s['student_hash'],
                    'section_name' => $s['section_name'],
                    'risk_score' => $s['risk_score'],
                    'ml_probability' => $s['ml_probability'],
                    'risk_level' => $s['tier'],
                    'agreement' => $s['agreement'],
                    'factors' => $s['factors'],
                ])->all(),
            ],
            'ai_summary' => sprintf(
                '%d of %d students flagged (%d critical) in %s. The rule engine and the model disagreed on %d student(s).',
                $flagged->count(),
                $analyzed->count(),
                $critical,
                $course->code,
                $disagreements
            ),
            'severity' => $severity,
            'from_cache' => false,
        ]);
    }
}
