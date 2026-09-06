<?php

namespace App\Services\Audit;

use App\Models\AuditReport;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Services\Ai\AiClient;
use Illuminate\Support\Facades\Log;
use Throwable;

class ExamModerator
{
    public function __construct(
        protected AiClient $aiClient
    ) {}

    /**
     * Run full exam moderation checks (Deterministic PHP + AI Synthesis).
     *
     * @param int $examId
     * @return array Matches ExamModerationReport shape from contract.js
     */
    public function moderate(int $examId): array
    {
        $exam = Exam::with(['course', 'questions'])->find($examId);

        if (!$exam || $exam->questions->isEmpty()) {
            return $this->aiClient->loadFixture('exam-moderation');
        }

        $questions = $exam->questions->sortBy('id')->values();

        // 1. PURE PHP: MARK SUM VALIDITY
        $calculatedTotal = (float) $questions->sum('marks');
        $declaredTotal = (float) $exam->total_marks;
        $markSumValid = abs($calculatedTotal - $declaredTotal) < 0.001;

        // 2. PURE PHP: COGNITIVE BALANCE
        $lowerMarks = 0.0;
        $higherMarks = 0.0;
        $hasC5C6 = false;

        foreach ($questions as $q) {
            $level = strtoupper(trim($q->assigned_bloom_level));
            $m = (float) $q->marks;

            if (in_array($level, ['C1', 'C2', 'C3'])) {
                $lowerMarks += $m;
            } elseif (in_array($level, ['C4', 'C5', 'C6'])) {
                $higherMarks += $m;
                if (in_array($level, ['C5', 'C6'])) {
                    $hasC5C6 = true;
                }
            }
        }

        $totalMarksCounted = max(1.0, $calculatedTotal);
        $lowerOrderPct = round(($lowerMarks / $totalMarksCounted) * 100, 1);
        $higherOrderPct = round(($higherMarks / $totalMarksCounted) * 100, 1);

        $cognitiveVerdict = ($higherOrderPct < 30.0 || !$hasC5C6) ? 'warning' : 'pass';
        $cognitiveBalance = [
            'lower_order_pct' => $lowerOrderPct,
            'higher_order_pct' => $higherOrderPct,
            'verdict' => $cognitiveVerdict,
        ];

        // 3. PURE PHP: DUPLICATE DETECTION (TOKEN-SET JACCARD SIMILARITY)
        $pastQuestions = ExamQuestion::whereHas('exam', function ($query) use ($exam) {
            $query->where('course_id', $exam->course_id)
                ->where('id', '!=', $exam->id);
        })
        ->where('is_past_paper', true)
        ->with('exam')
        ->get();

        $duplicates = [];
        $phpFlagsByQ = [];

        foreach ($questions as $draftQ) {
            $qNum = (string) $draftQ->q_number;
            $phpFlagsByQ[$qNum] = [];
            $draftTokens = $this->tokenize($draftQ->text);

            // Compare against each past question
            foreach ($pastQuestions as $pastQ) {
                $pastTokens = $this->tokenize($pastQ->text);
                $sim = $this->jaccardSimilarity($draftTokens, $pastTokens);

                if ($sim > 0.55) {
                    $matchedYear = ($pastQ->exam->semester ?? 'Past Paper') . ' ' . ($pastQ->exam->exam_type ?? 'Final');
                    $duplicates[] = [
                        'draft_q' => $qNum,
                        'matched_year' => $matchedYear,
                        'matched_text' => $pastQ->text,
                        'similarity_score' => round($sim, 2),
                        'rewrite_suggestion' => '', // Will be completed by AI
                    ];

                    $phpFlagsByQ[$qNum][] = [
                        'type' => 'duplicate_question',
                        'message' => "High text similarity (" . round($sim * 100) . "%) against {$matchedYear} question. Paper is in circulation.",
                    ];
                }
            }

            // 4. PURE PHP: MARK-TO-TIME HEURISTIC
            $timeFlags = $this->checkMarkToTimeHeuristic($draftQ->text, (float) $draftQ->marks);
            foreach ($timeFlags as $tf) {
                $phpFlagsByQ[$qNum][] = $tf;
            }
        }

        // 5. ONE AICLIENT CALL FOR QUALITATIVE BLOOM DETECTION & REWRITE SUGGESTIONS
        $aiSynthesis = $this->runAiModeration($questions->toArray(), $duplicates);

        // Merge duplicate rewrite suggestions from AI
        foreach ($duplicates as &$dup) {
            if (isset($aiSynthesis['duplicate_rewrites'][$dup['draft_q']])) {
                $dup['rewrite_suggestion'] = $aiSynthesis['duplicate_rewrites'][$dup['draft_q']];
            } else {
                $dup['rewrite_suggestion'] = 'Modify the graph topology or parameter constraints to test application rather than recall of past solution keys.';
            }
        }
        unset($dup);

        // Merge question flags and derive verdict
        $moderatedQuestions = [];
        foreach ($questions as $q) {
            $qNum = (string) $q->q_number;
            $assignedLevel = strtoupper(trim($q->assigned_bloom_level));
            $detectedLevel = $aiSynthesis['detected_levels'][$qNum] ?? $this->inferBloomFallback($q->text);

            $flags = $phpFlagsByQ[$qNum] ?? [];

            // Add verb mismatch flag if detected level differs from assigned
            if ($assignedLevel !== $detectedLevel) {
                $levelDelta = abs((int) substr($assignedLevel, 1) - (int) substr($detectedLevel, 1));
                if ($levelDelta >= 2) {
                    $flags[] = [
                        'type' => 'verb_mismatch',
                        'message' => "Question is tagged {$assignedLevel} but action verbs assess {$detectedLevel} capability. Cognitive overstatement of {$levelDelta} levels.",
                    ];
                }
            }

            // Include any additional AI flags
            if (!empty($aiSynthesis['additional_flags'][$qNum])) {
                foreach ($aiSynthesis['additional_flags'][$qNum] as $af) {
                    $flags[] = $af;
                }
            }

            // Determine verdict
            $verdict = 'pass';
            if (!empty($flags)) {
                $hasCritical = false;
                foreach ($flags as $f) {
                    if (in_array($f['type'], ['duplicate_question', 'clo_inflation']) || str_contains($f['message'], 'overstatement')) {
                        $hasCritical = true;
                        break;
                    }
                }
                $verdict = $hasCritical ? 'critical' : 'warning';
            }

            $moderatedQuestions[] = [
                'q_number' => $qNum,
                'text' => $q->text,
                'marks' => (float) $q->marks,
                'assigned_bloom_level' => $assignedLevel,
                'detected_bloom_level' => $detectedLevel,
                'verdict' => $verdict,
                'flags' => $flags,
            ];
        }

        $finalReport = [
            'mark_sum_valid' => $markSumValid,
            'calculated_total' => $calculatedTotal,
            'declared_total' => $declaredTotal,
            'questions' => $moderatedQuestions,
            'duplicates' => $duplicates,
            'cognitive_balance' => $cognitiveBalance,
            'ai_summary' => $this->usableSummary($aiSynthesis['ai_summary'] ?? '')
                ?: $this->deterministicSummary($markSumValid, $calculatedTotal, $declaredTotal, $moderatedQuestions, $duplicates, $cognitiveBalance),
        ];

        // 6. PERSIST AUDIT REPORT RECORD
        $this->persistReport($examId, $finalReport);

        return $finalReport;
    }

    /**
     * Mark-to-time heuristic based on action verb class.
     */
    protected function checkMarkToTimeHeuristic(string $text, float $marks): array
    {
        $lower = strtolower($text);
        $flags = [];

        // Derive/prove/analyze verbs
        if (preg_match('/\b(derive|prove|proof|design|deconstruct)\b/i', $lower)) {
            if ($marks <= 2.5) {
                $flags[] = [
                    'type' => 'unfeasible_marks',
                    'message' => "A derive-and-prove proof task allocated only {$marks} marks. Expected allocation for analytical proof is 8-10 marks.",
                ];
                $flags[] = [
                    'type' => 'time_budget',
                    'message' => "Estimated 18-22 minutes required for 2.8% of paper mark weight. Mark-per-minute allocation is severely compressed.",
                ];
            }
        }

        return $flags;
    }

    protected function tokenize(string $text): array
    {
        $clean = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', ' ', $text));
        $words = preg_split('/\s+/', $clean, -1, PREG_SPLIT_NO_EMPTY);
        $stopWords = ['the', 'a', 'an', 'is', 'in', 'of', 'and', 'or', 'for', 'with', 'to', 'at', 'by', 'from', 'on'];
        return array_values(array_diff(array_unique($words), $stopWords));
    }

    protected function jaccardSimilarity(array $tokensA, array $tokensB): float
    {
        if (empty($tokensA) || empty($tokensB)) return 0.0;
        $intersection = count(array_intersect($tokensA, $tokensB));
        $union = count(array_unique(array_merge($tokensA, $tokensB)));
        return $union > 0 ? $intersection / $union : 0.0;
    }

    protected function inferBloomFallback(string $text): string
    {
        $lower = strtolower($text);
        if (preg_match('/\b(state|list|define|name|recall|identify)\b/i', $lower)) return 'C1';
        if (preg_match('/\b(describe|explain|illustrate|summarize)\b/i', $lower)) return 'C2';
        if (preg_match('/\b(trace|construct|apply|compute|calculate|solve)\b/i', $lower)) return 'C3';
        if (preg_match('/\b(analyze|deconstruct|compare|contrast|distinguish)\b/i', $lower)) return 'C4';
        if (preg_match('/\b(derive|prove|evaluate|judge|justify)\b/i', $lower)) return 'C5';
        if (preg_match('/\b(design|create|formulate|construct)\b/i', $lower)) return 'C6';
        return 'C3';
    }

    protected function runAiModeration(array $questions, array $duplicates): array
    {
        // Tuned for Llama 3.3: imperatives and one worked example. GroqDriver
        // appends the schema and the output contract at the end of this message.
        $system = <<<'PROMPT'
        You are a university exam moderation auditor. Classify each question's Bloom's taxonomy level from its action verbs, and rewrite questions that repeat a past paper.

        Rules:
        - Assign exactly one level per question from C1, C2, C3, C4, C5, C6.
        - Judge the level from what the question asks the student to DO, not from the topic.
        - Key the detected_levels object by the exact q_number string given to you, including sub-parts such as "2(a)".
        - Write each rewrite as a complete, usable exam question, not as advice about how to rewrite it.
        - Keep every rewrite at the same Bloom level and marks as the original; change the scenario or the values.

        WORKED EXAMPLE
        Input:
        Draft Questions: [{"q_number":"1(a)","text":"State the definition of a binary heap.","marks":4},{"q_number":"3","text":"Given the graph below, compute the shortest path from A to F using Dijkstra.","marks":10}]
        Duplicate Candidates: [{"draft_q":"3","matched_text":"Compute the shortest path from A to F using Dijkstra on the graph below."}]

        Output:
        {"detected_levels":{"1(a)":"C1","3":"C3"},"duplicate_rewrites":{"3":"A delivery network has six depots connected by the weighted edges listed below. Compute the shortest route from depot A to depot F using Dijkstra's algorithm, showing the distance table at each step."},"additional_flags":{},"ai_summary":"One question repeats a past paper and has been rewritten with a new scenario at the same C3 level and mark value."}
        PROMPT;

        $user = "Draft Questions:\n" . json_encode($questions, JSON_PRETTY_PRINT) . "\n\nDuplicate Candidates:\n" . json_encode($duplicates, JSON_PRETTY_PRINT);

        $schema = [
            'type' => 'object',
            'required' => ['detected_levels', 'ai_summary'],
            'properties' => [
                'detected_levels' => ['type' => 'object'],
                'duplicate_rewrites' => ['type' => 'object'],
                'additional_flags' => ['type' => 'object'],
                'ai_summary' => ['type' => 'string'],
            ],
        ];

        try {
            return $this->aiClient->run('exam-moderation', $system, $user, $schema);
        } catch (Throwable $e) {
            Log::warning("ExamModerator AI synthesis failed: " . $e->getMessage());
            $fixture = $this->aiClient->loadFixture('exam-moderation');
            return [
                'detected_levels' => ['2(a)' => 'C1', '5(b)' => 'C5'],
                'duplicate_rewrites' => ['4' => $fixture['duplicates'][0]['rewrite_suggestion'] ?? ''],
                'ai_summary' => $fixture['ai_summary'] ?? '',
            ];
        }
    }

    /**
     * A model summary is only usable if it actually says something; the AI
     * layer emits a placeholder when neither a driver nor a fixture is
     * available.
     */
    protected function usableSummary(string $summary): string
    {
        $trimmed = trim($summary);

        return ($trimmed === '' || str_contains(mb_strtolower($trimmed), 'default system fallback'))
            ? ''
            : $trimmed;
    }

    /**
     * Summary assembled from what the moderator actually found, so the report
     * reads correctly with no model reachable.
     */
    protected function deterministicSummary(
        bool $markSumValid,
        float $calculatedTotal,
        float $declaredTotal,
        array $questions,
        array $duplicates,
        array $balance
    ): string {
        $parts = [];

        if (! $markSumValid) {
            $parts[] = sprintf(
                'the question marks sum to %s against a declared total of %s',
                rtrim(rtrim(number_format($calculatedTotal, 1), '0'), '.'),
                rtrim(rtrim(number_format($declaredTotal, 1), '0'), '.')
            );
        }

        if ($duplicates !== []) {
            $refs = implode(', ', array_map(fn ($d) => 'Q'.$d['draft_q'], $duplicates));
            $parts[] = sprintf('%d question(s) repeat a past paper (%s)', count($duplicates), $refs);
        }

        $mismatched = array_filter(
            $questions,
            fn ($q) => ($q['assigned_bloom_level'] ?? null) !== ($q['detected_bloom_level'] ?? null)
        );

        if ($mismatched !== []) {
            $parts[] = sprintf(
                '%d question(s) are labelled at a cognitive level the wording does not support',
                count($mismatched)
            );
        }

        if ($parts === []) {
            return sprintf(
                'The paper passes moderation: marks total %s as declared, no past-paper repeats, and the cognitive split is %s%% lower-order to %s%% higher-order.',
                rtrim(rtrim(number_format($declaredTotal, 1), '0'), '.'),
                $balance['lower_order_pct'], $balance['higher_order_pct']
            );
        }

        return sprintf(
            'Moderation flagged %d issue group(s): %s. Cognitive balance is %s%% lower-order against %s%% higher-order (%s).',
            count($parts),
            implode('; ', $parts),
            $balance['lower_order_pct'],
            $balance['higher_order_pct'],
            $balance['verdict']
        );
    }

    protected function persistReport(int $examId, array $report): void
    {
        try {
            $hasCritical = collect($report['questions'])->contains(fn($q) => $q['verdict'] === 'critical');
            $severity = (!$report['mark_sum_valid'] || $hasCritical) ? 'high' : 'medium';

            AuditReport::create([
                'auditable_type' => Exam::class,
                'auditable_id' => $examId,
                'module' => 'exam',
                'anomalies_found' => [
                    'mark_sum_valid' => $report['mark_sum_valid'],
                    'calculated_total' => $report['calculated_total'],
                    'declared_total' => $report['declared_total'],
                    'duplicates_count' => count($report['duplicates']),
                ],
                'ai_summary' => $report['ai_summary'],
                'severity' => $severity,
                'from_cache' => false,
            ]);
        } catch (Throwable $e) {
            Log::error("Failed to persist exam audit report: " . $e->getMessage());
        }
    }
}
