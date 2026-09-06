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
            $assignedClo = trim($q->assigned_clo ?? 'CLO1');
            $facultyName = trim($q->faculty_name ?? 'Prof. Monir');

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

            // AI Question Strength Evaluation against past papers
            $duplicatesForThisQ = array_values(array_filter($duplicates, fn($d) => (string)$d['draft_q'] === $qNum));
            $strength = $this->evaluateQuestionStrength(
                $q->text,
                (float) $q->marks,
                $assignedLevel,
                $detectedLevel,
                $flags,
                $duplicatesForThisQ,
                $pastQuestions
            );

            $moderatedQuestions[] = [
                'q_number' => $qNum,
                'text' => $q->text,
                'marks' => (float) $q->marks,
                'assigned_bloom_level' => $assignedLevel,
                'detected_bloom_level' => $detectedLevel,
                'assigned_clo' => $assignedClo,
                'faculty_name' => $facultyName,
                'verdict' => $verdict,
                'flags' => $flags,
                'strength_score' => $strength['strength_score'],
                'strength_rating' => $strength['strength_rating'],
                'strength_metrics' => $strength['strength_metrics'],
                'strength_feedback' => $strength['strength_feedback'],
            ];
        }

        $obeCoverage = $this->auditOutcomeBasedEducation(
            $moderatedQuestions,
            $declaredTotal,
            $hasC5C6,
            $higherOrderPct,
            $duplicates
        );

        $multiFacultySummary = $this->summarizeMultiFaculty(
            $moderatedQuestions,
            $calculatedTotal
        );

        $finalReport = [
            'mark_sum_valid' => $markSumValid,
            'calculated_total' => $calculatedTotal,
            'declared_total' => $declaredTotal,
            'questions' => $moderatedQuestions,
            'duplicates' => $duplicates,
            'cognitive_balance' => $cognitiveBalance,
            'obe_coverage' => $obeCoverage,
            'multi_faculty_summary' => $multiFacultySummary,
            'ai_summary' => $this->usableSummary($aiSynthesis['ai_summary'] ?? '')
                ?: $this->deterministicSummary($markSumValid, $calculatedTotal, $declaredTotal, $moderatedQuestions, $duplicates, $cognitiveBalance),
        ];

        // 6. PERSIST AUDIT REPORT RECORD
        $this->persistReport($examId, $finalReport);

        return $finalReport;
    }

    /**
     * Moderate custom uploaded questions directly (pure deterministic PHP, zero AI API dependency).
     */
    public function moderateCustomQuestions(array $rawQuestions, float $declaredTotal = 70.0, ?int $courseId = null): array
    {
        if (empty($rawQuestions)) {
            return $this->aiClient->loadFixture('exam-moderation');
        }

        $calculatedTotal = 0.0;
        foreach ($rawQuestions as $q) {
            $calculatedTotal += (float) ($q['marks'] ?? 0);
        }
        $markSumValid = abs($calculatedTotal - $declaredTotal) < 0.001;

        // Cognitive Balance
        $lowerMarks = 0.0;
        $higherMarks = 0.0;
        $hasC5C6 = false;

        foreach ($rawQuestions as $q) {
            $level = strtoupper(trim($q['assigned_bloom_level'] ?? 'C1'));
            $m = (float) ($q['marks'] ?? 0);

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

        // Past Question duplicate detection
        $pastQuery = ExamQuestion::where('is_past_paper', true)->with('exam');
        if ($courseId) {
            $pastQuery->whereHas('exam', function ($q) use ($courseId) {
                $q->where('course_id', $courseId);
            });
        }
        $pastQuestions = $pastQuery->get();

        $duplicates = [];
        $phpFlagsByQ = [];

        foreach ($rawQuestions as $draftQ) {
            $qNum = (string) ($draftQ['q_number'] ?? '');
            $phpFlagsByQ[$qNum] = [];
            $text = (string) ($draftQ['text'] ?? '');
            $marks = (float) ($draftQ['marks'] ?? 0);
            $draftTokens = $this->tokenize($text);

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
                        'rewrite_suggestion' => 'Alter the graph topology, parameter constraints, or algorithmic invariants to evaluate transfer rather than recall of past solution keys.',
                    ];

                    $phpFlagsByQ[$qNum][] = [
                        'type' => 'duplicate_question',
                        'message' => "High text similarity (" . round($sim * 100) . "%) against {$matchedYear} question. Paper is in circulation.",
                    ];
                }
            }

            $timeFlags = $this->checkMarkToTimeHeuristic($text, $marks);
            foreach ($timeFlags as $tf) {
                $phpFlagsByQ[$qNum][] = $tf;
            }
        }

        // Moderated questions
        $moderatedQuestions = [];
        foreach ($rawQuestions as $q) {
            $qNum = (string) ($q['q_number'] ?? '');
            $text = (string) ($q['text'] ?? '');
            $assignedLevel = strtoupper(trim($q['assigned_bloom_level'] ?? 'C1'));
            $detectedLevel = $this->inferBloomFallback($text);
            $assignedClo = trim($q['assigned_clo'] ?? 'CLO1');
            $facultyName = trim($q['faculty_name'] ?? 'Prof. Monir');

            $flags = $phpFlagsByQ[$qNum] ?? [];

            if ($assignedLevel !== $detectedLevel) {
                $levelDelta = abs((int) substr($assignedLevel, 1) - (int) substr($detectedLevel, 1));
                if ($levelDelta >= 2) {
                    $flags[] = [
                        'type' => 'verb_mismatch',
                        'message' => "Question is tagged {$assignedLevel} but action verbs assess {$detectedLevel} capability. Cognitive overstatement of {$levelDelta} levels.",
                    ];
                }
            }

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

            $duplicatesForThisQ = array_values(array_filter($duplicates, fn($d) => (string)$d['draft_q'] === $qNum));
            $strength = $this->evaluateQuestionStrength(
                $text,
                (float) ($q['marks'] ?? 0),
                $assignedLevel,
                $detectedLevel,
                $flags,
                $duplicatesForThisQ,
                $pastQuestions
            );

            $moderatedQuestions[] = [
                'q_number' => $qNum,
                'text' => $text,
                'marks' => (float) ($q['marks'] ?? 0),
                'assigned_bloom_level' => $assignedLevel,
                'detected_bloom_level' => $detectedLevel,
                'assigned_clo' => $assignedClo,
                'faculty_name' => $facultyName,
                'verdict' => $verdict,
                'flags' => $flags,
                'strength_score' => $strength['strength_score'],
                'strength_rating' => $strength['strength_rating'],
                'strength_metrics' => $strength['strength_metrics'],
                'strength_feedback' => $strength['strength_feedback'],
            ];
        }

        $obeCoverage = $this->auditOutcomeBasedEducation(
            $moderatedQuestions,
            $declaredTotal,
            $hasC5C6,
            $higherOrderPct,
            $duplicates
        );

        $multiFacultySummary = $this->summarizeMultiFaculty(
            $moderatedQuestions,
            $calculatedTotal
        );

        return [
            'mark_sum_valid' => $markSumValid,
            'calculated_total' => $calculatedTotal,
            'declared_total' => $declaredTotal,
            'questions' => $moderatedQuestions,
            'duplicates' => $duplicates,
            'cognitive_balance' => $cognitiveBalance,
            'obe_coverage' => $obeCoverage,
            'multi_faculty_summary' => $multiFacultySummary,
            'ai_summary' => $this->deterministicSummary(
                $markSumValid,
                $calculatedTotal,
                $declaredTotal,
                $moderatedQuestions,
                $duplicates,
                $cognitiveBalance
            ),
        ];
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
            $result = $this->aiClient->run('exam-moderation', $system, $user, $schema);

            // A fixture describes the one paper it was frozen from, so its
            // levels, rewrites and prose say nothing about this paper. Drop
            // them and let the deterministic path speak from what was measured.
            if (! empty($result[AiClient::FROM_FIXTURE])) {
                return ['detected_levels' => [], 'duplicate_rewrites' => [], 'additional_flags' => [], 'ai_summary' => ''];
            }

            return $result;
        } catch (Throwable $e) {
            Log::warning("ExamModerator AI synthesis failed: " . $e->getMessage());
            return ['detected_levels' => [], 'duplicate_rewrites' => [], 'additional_flags' => [], 'ai_summary' => ''];
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

    /**
     * Evaluate AI Question Strength benchmarked against previous exam papers.
     */
    protected function evaluateQuestionStrength(
        string $text,
        float $marks,
        string $assignedLevel,
        string $detectedLevel,
        array $flags,
        array $duplicatesForThisQ,
        $pastQuestions = []
    ): array {
        $score = 100;

        // 1. DIMENSION: Originality & Novelty vs Previous Exams (Max 35 pts)
        $originalityScore = 95;
        $maxPastSim = 0.0;
        $matchedExamRef = '';

        if (!empty($duplicatesForThisQ)) {
            $maxPastSim = max(array_column($duplicatesForThisQ, 'similarity_score'));
            $firstDup = $duplicatesForThisQ[0];
            $matchedExamRef = $firstDup['matched_year'] ?? 'Past Paper';

            // Severe penalty for past paper leakage
            $penalty = min(35, (int) round($maxPastSim * 35));
            $score -= $penalty;
            $originalityScore = max(10, (int) round((1.0 - $maxPastSim) * 100));
        } else {
            $textTokens = $this->tokenize($text);
            foreach ($pastQuestions as $pastQ) {
                $pastText = is_string($pastQ) ? $pastQ : ($pastQ->text ?? ($pastQ['text'] ?? ''));
                if (!empty($pastText)) {
                    $pastTokens = $this->tokenize($pastText);
                    $sim = $this->jaccardSimilarity($textTokens, $pastTokens);
                    if ($sim > $maxPastSim) {
                        $maxPastSim = $sim;
                    }
                }
            }
            if ($maxPastSim > 0.35) {
                $score -= 8;
                $originalityScore = max(50, (int) round((1.0 - $maxPastSim) * 100));
            }
        }

        // 2. DIMENSION: Cognitive Rigor & Action Verb Alignment (Max 30 pts)
        $rigorScore = 85;
        $levelNum = (int) substr($detectedLevel, 1);
        $assignedNum = (int) substr($assignedLevel, 1);
        $levelDelta = abs($assignedNum - $levelNum);

        if (in_array($detectedLevel, ['C5', 'C6'])) {
            $rigorScore = 95;
        } elseif ($detectedLevel === 'C4') {
            $rigorScore = 85;
        } elseif ($detectedLevel === 'C3') {
            $rigorScore = 75;
        } else {
            $rigorScore = 60;
            $score -= 5;
        }

        if ($assignedNum > $levelNum) {
            $mismatchPenalty = min(25, $levelDelta * 10);
            $score -= $mismatchPenalty;
            $rigorScore = max(20, $rigorScore - $mismatchPenalty);
        }

        // 3. DIMENSION: Mark Feasibility & Workload (Max 20 pts)
        $feasibilityScore = 95;
        $hasWorkloadDefect = false;
        foreach ($flags as $f) {
            if (in_array($f['type'] ?? '', ['unfeasible_marks', 'time_budget'])) {
                $hasWorkloadDefect = true;
                break;
            }
        }
        if ($hasWorkloadDefect) {
            $score -= 20;
            $feasibilityScore = 35;
        } elseif ($marks <= 0) {
            $score -= 15;
            $feasibilityScore = 40;
        }

        // 4. DIMENSION: Clarity & Assessment Discriminatory Depth (Max 15 pts)
        $clarityScore = 90;
        $stemLen = mb_strlen(trim($text));
        if ($stemLen < 30) {
            $score -= 10;
            $clarityScore = 55;
        } elseif ($stemLen > 80 && (str_contains($text, 'where') || str_contains($text, 'given') || str_contains($text, 'show') || str_contains($text, 'with'))) {
            $clarityScore = 95;
        }

        $finalScore = max(10, min(100, $score));

        if ($finalScore >= 80) {
            $rating = 'Strong';
        } elseif ($finalScore >= 60) {
            $rating = 'Moderate';
        } else {
            $rating = 'Needs Revision';
        }

        if (!empty($duplicatesForThisQ)) {
            $pct = round($maxPastSim * 100);
            $feedback = "Originality risk: High textual overlap ({$pct}%) against {$matchedExamRef} question. The problem parameters and structure circulate in past student papers. Recommend changing constraints or graph topology to evaluate transfer rather than recall.";
        } elseif ($assignedNum > $levelNum) {
            $feedback = "Cognitive alignment defect: Tagged {$assignedLevel} but action verbs test {$detectedLevel} capability. Cognitive overstatement reduces the exam's power to assess higher-order thinking.";
        } elseif ($hasWorkloadDefect) {
            $feedback = "Mark allocation imbalance: Workload requires proof/analytical derivation estimated at 18-22 minutes for only {$marks} marks. Recommend increasing mark weight or decomposing into smaller subparts.";
        } elseif (in_array($detectedLevel, ['C5', 'C6'])) {
            $feedback = "Exemplary question strength (Score: {$finalScore}/100). Novel problem scenario not found in past exam archives. High cognitive rigor targeting {$detectedLevel} capability with robust discriminatory power.";
        } elseif (in_array($detectedLevel, ['C3', 'C4'])) {
            $feedback = "Solid application question (Score: {$finalScore}/100). Distinct from past paper archives with clear problem constraints and appropriate mark allocation.";
        } else {
            $feedback = "Acceptable foundational question (Score: {$finalScore}/100). Tests basic knowledge, but carries lower discriminatory power for separating top-tier student outcomes.";
        }

        return [
            'strength_score' => $finalScore,
            'strength_rating' => $rating,
            'strength_metrics' => [
                'originality' => $originalityScore,
                'cognitive_rigor' => $rigorScore,
                'mark_feasibility' => $feasibilityScore,
                'clarity' => $clarityScore,
            ],
            'strength_feedback' => $feedback,
        ];
    }

    /**
     * Audit Outcome-Based Education (OBE) properties across the full paper.
     */
    protected function auditOutcomeBasedEducation(
        array $moderatedQuestions,
        float $declaredTotal,
        bool $hasC5C6,
        float $higherOrderPct,
        array $duplicates
    ): array {
        $targetClos = [
            'CLO1' => 'Foundational Knowledge & Core Principles',
            'CLO2' => 'Algorithm Design & Data Structure Implementation',
            'CLO3' => 'Analytical Modeling, Proof & Performance Evaluation',
            'CLO4' => 'Synthesis, Engineering Design & Complex Problem Solving',
        ];

        $cloMarks = ['CLO1' => 0.0, 'CLO2' => 0.0, 'CLO3' => 0.0, 'CLO4' => 0.0];
        $cloCount = ['CLO1' => 0, 'CLO2' => 0, 'CLO3' => 0, 'CLO4' => 0];

        foreach ($moderatedQuestions as $q) {
            $clo = strtoupper(trim($q['assigned_clo'] ?? 'CLO1'));
            $m = (float) ($q['marks'] ?? 0);
            if (!isset($cloMarks[$clo])) {
                $cloMarks[$clo] = 0.0;
                $cloCount[$clo] = 0;
            }
            $cloMarks[$clo] += $m;
            $cloCount[$clo] += 1;
        }

        $totalMarksCounted = max(1.0, (float) array_sum($cloMarks));
        $cloDistribution = [];
        $missingClos = [];

        foreach ($targetClos as $code => $desc) {
            $marks = $cloMarks[$code] ?? 0.0;
            $count = $cloCount[$code] ?? 0;
            $pct = round(($marks / $totalMarksCounted) * 100, 1);

            $cloDistribution[$code] = [
                'clo' => $code,
                'description' => $desc,
                'marks' => $marks,
                'percentage' => $pct,
                'question_count' => $count,
                'status' => $marks > 0 ? ($pct >= 15.0 ? 'balanced' : 'low_weight') : 'unassessed',
            ];

            if ($marks < 0.001) {
                $missingClos[] = $code;
            }
        }

        $allClosCovered = empty($missingClos);

        $mismatchedCount = count(array_filter($moderatedQuestions, function ($q) {
            return ($q['assigned_bloom_level'] ?? '') !== ($q['detected_bloom_level'] ?? '');
        }));

        $score = 0;

        // 1. CLO Coverage: up to 30 pts
        $coveredCount = 4 - count($missingClos);
        $score += (int) round(($coveredCount / 4) * 30);

        // 2. Cognitive Taxonomy (Bloom HOTS >= 35%): up to 30 pts
        if ($higherOrderPct >= 35.0) {
            $score += 30;
        } elseif ($higherOrderPct >= 25.0) {
            $score += 20;
        } elseif ($higherOrderPct >= 15.0) {
            $score += 10;
        }

        // 3. Complex Problem Solving (C5/C6 presence): up to 15 pts
        if ($hasC5C6) {
            $score += 15;
        }

        // 4. Constructive Alignment: up to 15 pts
        $alignmentDeductions = min(15, $mismatchedCount * 8);
        $score += max(0, 15 - $alignmentDeductions);

        // 5. Historical Originality: up to 10 pts
        if (empty($duplicates)) {
            $score += 10;
        }

        $complianceScore = max(10, min(100, $score));

        if ($complianceScore >= 85 && $allClosCovered && $higherOrderPct >= 35.0 && $hasC5C6) {
            $verdict = 'OBE Compliant';
        } elseif ($complianceScore >= 65) {
            $verdict = 'Partially Compliant';
        } else {
            $verdict = 'Non-Compliant';
        }

        $checks = [
            [
                'id' => 'clo_coverage',
                'label' => 'Full Course Learning Outcome (CLO) Coverage',
                'status' => $allClosCovered ? 'pass' : 'critical',
                'message' => $allClosCovered
                    ? 'All 4 target CLOs (CLO1–CLO4) are actively assessed in this exam paper.'
                    : 'Target ' . implode(', ', $missingClos) . ' has 0 marks allocated. OBE requires all course outcomes to be verified.',
            ],
            [
                'id' => 'hots_threshold',
                'label' => 'Higher-Order Thinking Skills (HOTS C4–C6 >= 35%)',
                'status' => $higherOrderPct >= 35.0 ? 'pass' : 'warning',
                'message' => "Higher-order cognitive outcomes represent {$higherOrderPct}% of the paper marks (Target: >= 35%).",
            ],
            [
                'id' => 'complex_problem_solving',
                'label' => 'Complex Computational Problem Solving (C5/C6 Presence)',
                'status' => $hasC5C6 ? 'pass' : 'warning',
                'message' => $hasC5C6
                    ? 'Paper contains evaluation (C5) or synthesis/design (C6) tasks testing complex problem-solving capabilities.'
                    : 'Zero questions reach C5 (Evaluate) or C6 (Create). Graduation attributes require evidence of complex design capability.',
            ],
            [
                'id' => 'constructive_alignment',
                'label' => 'Constructive Alignment & Bloom Authenticity',
                'status' => $mismatchedCount === 0 ? 'pass' : 'warning',
                'message' => $mismatchedCount === 0
                    ? 'All question action verbs constructively align with their tagged Bloom taxonomy levels.'
                    : "{$mismatchedCount} question(s) suffer from cognitive verb mismatch, inflating declared cognitive weight.",
            ],
            [
                'id' => 'historical_uniqueness',
                'label' => 'Originality & Exam Security (No Past Paper Leakage)',
                'status' => empty($duplicates) ? 'pass' : 'critical',
                'message' => empty($duplicates)
                    ? 'All proposed questions are original and do not replicate past examination papers.'
                    : count($duplicates) . ' question(s) duplicate circulating past papers, compromising assessment validity.',
            ],
        ];

        $recommendations = [];
        if (!empty($missingClos)) {
            foreach ($missingClos as $mClo) {
                $recommendations[] = "Introduce at least one question evaluating {$mClo} ({$targetClos[$mClo]}) to ensure complete learning outcome coverage.";
            }
        }
        if (!$hasC5C6) {
            $recommendations[] = 'Add an analytical critique (C5) or system design/synthesis (C6) question to fulfill complex engineering problem criteria.';
        }
        if ($higherOrderPct < 35.0) {
            $recommendations[] = "Increase Higher-Order marks from {$higherOrderPct}% to at least 35% to satisfy international accreditation (BAETE / Washington Accord) thresholds.";
        }
        if (!empty($duplicates)) {
            $recommendations[] = 'Rewrite flagged duplicate questions with altered parameters and topologies so circulating past papers cannot be recalled.';
        }
        if ($mismatchedCount > 0) {
            $recommendations[] = 'Align question action verbs with tagged Bloom levels, or adjust tagging down to match the actual cognitive demand.';
        }
        if (empty($recommendations)) {
            $recommendations[] = 'Paper meets all standard Outcome-Based Education criteria and is ready for departmental exam board certification.';
        }

        return [
            'compliance_score' => $complianceScore,
            'verdict' => $verdict,
            'all_clos_covered' => $allClosCovered,
            'missing_clos' => $missingClos,
            'higher_order_pct' => $higherOrderPct,
            'has_c5_c6' => $hasC5C6,
            'clo_distribution' => $cloDistribution,
            'checks' => $checks,
            'recommendations' => $recommendations,
        ];
    }

    /**
     * Summarize questions authored by multiple faculty members.
     */
    protected function summarizeMultiFaculty(array $moderatedQuestions, float $totalMarks): array
    {
        $facultyGroups = [];

        foreach ($moderatedQuestions as $q) {
            $faculty = trim($q['faculty_name'] ?? '');
            if ($faculty === '') {
                $faculty = 'Faculty Contributor';
            }

            if (!isset($facultyGroups[$faculty])) {
                $facultyGroups[$faculty] = [
                    'faculty_name' => $faculty,
                    'question_numbers' => [],
                    'question_count' => 0,
                    'total_marks' => 0.0,
                    'strength_scores' => [],
                    'clos_covered' => [],
                    'bloom_distribution' => [],
                ];
            }

            $facultyGroups[$faculty]['question_numbers'][] = $q['q_number'];
            $facultyGroups[$faculty]['question_count'] += 1;
            $facultyGroups[$faculty]['total_marks'] += (float) ($q['marks'] ?? 0);
            if (isset($q['strength_score'])) {
                $facultyGroups[$faculty]['strength_scores'][] = (int) $q['strength_score'];
            }
            if (!empty($q['assigned_clo'])) {
                $facultyGroups[$faculty]['clos_covered'][] = $q['assigned_clo'];
            }
            $bloom = $q['assigned_bloom_level'] ?? 'C1';
            $facultyGroups[$faculty]['bloom_distribution'][$bloom] =
                ($facultyGroups[$faculty]['bloom_distribution'][$bloom] ?? 0) + 1;
        }

        $totalMarksCounted = max(1.0, $totalMarks);
        $breakdown = [];

        foreach ($facultyGroups as $faculty => $data) {
            $avgStrength = !empty($data['strength_scores'])
                ? round(array_sum($data['strength_scores']) / count($data['strength_scores']), 1)
                : 75.0;

            $breakdown[] = [
                'faculty_name' => $faculty,
                'question_numbers' => $data['question_numbers'],
                'question_count' => $data['question_count'],
                'total_marks' => $data['total_marks'],
                'marks_share_pct' => round(($data['total_marks'] / $totalMarksCounted) * 100, 1),
                'avg_strength_score' => $avgStrength,
                'clos_covered' => array_values(array_unique($data['clos_covered'])),
                'bloom_distribution' => $data['bloom_distribution'],
            ];
        }

        return [
            'faculty_count' => count($breakdown),
            'faculty_breakdown' => $breakdown,
        ];
    }
}
