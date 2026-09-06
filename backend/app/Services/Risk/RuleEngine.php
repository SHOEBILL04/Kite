<?php

namespace App\Services\Risk;

use App\Models\Student;

/**
 * Transparent, auditable rule scorer.
 *
 * Every point this engine awards is itemized in `factors[]` with the evidence
 * that produced it, so the UI can render a complete "why was this flagged"
 * breakdown. Nothing is summarized away: if a rule fired, it is in the list.
 *
 * This is deliberately the dumb, legible half of the engine. Its counterpart,
 * MlScorer, is the statistical half; RiskAnalyzer compares the two.
 */
class RuleEngine
{
    /** A single quiz-to-quiz drop of this magnitude counts as a collapse. */
    private const CONSECUTIVE_DROP_RATIO = 0.40;

    public const TIER_SAFE = 'safe';
    public const TIER_MODERATE = 'moderate';
    public const TIER_CRITICAL = 'critical';

    /**
     * Score one student.
     *
     * @return array{score:int, tier:string, factors:array<int, array{factor:string, points:int, evidence:string}>}
     */
    public function score(Student $student): array
    {
        $factors = [];

        $attendance = (float) $student->attendance_pct;
        $q1 = (float) $student->quiz1;
        $q2 = (float) $student->quiz2;
        $q3 = (float) $student->quiz3;
        $midterm = (float) $student->midterm_pct;
        $delays = (int) $student->assignment_delay_count;
        $quizMean = ($q1 + $q2 + $q3) / 3;

        // --- Attendance ---------------------------------------------------
        // Banded, not additive: a student below 60 does not also collect the
        // 60-70 band's points.
        if ($attendance < 60) {
            $factors[] = $this->factor(
                'Critically low attendance',
                25,
                sprintf('Attendance %.0f%% is below the 60%% threshold.', $attendance)
            );
        } elseif ($attendance <= 70) {
            $factors[] = $this->factor(
                'Borderline attendance',
                12,
                sprintf('Attendance %.0f%% sits in the 60-70%% warning band.', $attendance)
            );
        }

        // --- Quiz trajectory ----------------------------------------------
        $slope = $q3 - $q1;
        if ($slope <= -20) {
            $factors[] = $this->factor(
                'Sustained quiz decline',
                20,
                sprintf('Quiz 1 %.0f%% to quiz 3 %.0f%% is a drop of %.0f points.', $q1, $q3, abs($slope))
            );
        }

        // Relative drop between any two *consecutive* quizzes. This catches a
        // sudden collapse that the endpoint-to-endpoint slope can miss (e.g.
        // 80 -> 40 -> 75 nets out flat but contains a real crash).
        foreach ([[1, $q1, 2, $q2], [2, $q2, 3, $q3]] as [$fromNo, $from, $toNo, $to]) {
            if ($from > 0 && (($from - $to) / $from) > self::CONSECUTIVE_DROP_RATIO) {
                $factors[] = $this->factor(
                    'Sharp consecutive quiz drop',
                    18,
                    sprintf(
                        'Quiz %d %.0f%% to quiz %d %.0f%% is a %.0f%% relative drop.',
                        $fromNo,
                        $from,
                        $toNo,
                        $to,
                        (($from - $to) / $from) * 100
                    )
                );
                break; // One collapse is the signal; don't double-charge for two.
            }
        }

        // --- Midterm --------------------------------------------------------
        if ($midterm < 40) {
            $factors[] = $this->factor(
                'Failing midterm',
                20,
                sprintf('Midterm %.0f%% is below the 40%% pass line.', $midterm)
            );
        }

        // Exam-specific failure: the student can do the coursework but not the
        // exam. A different intervention than general weakness, so it is its
        // own factor even when the midterm also failed outright.
        $gap = $quizMean - $midterm;
        if ($gap >= 25) {
            $factors[] = $this->factor(
                'Exam-specific underperformance',
                15,
                sprintf(
                    'Midterm %.0f%% is %.0f points below the quiz mean of %.0f%%.',
                    $midterm,
                    $gap,
                    $quizMean
                )
            );
        }

        // --- Coursework engagement -------------------------------------------
        if ($delays >= 3) {
            $factors[] = $this->factor(
                'Repeated late submissions',
                10,
                sprintf('%d assignments submitted late.', $delays)
            );
        }

        $score = (int) min(100, array_sum(array_column($factors, 'points')));

        return [
            'score' => $score,
            'tier' => $this->tierFor($score),
            'factors' => $factors,
        ];
    }

    /**
     * Tier boundaries: safe < 40, moderate 40-69, critical 70+.
     */
    public function tierFor(int $score): string
    {
        return match (true) {
            $score >= 70 => self::TIER_CRITICAL,
            $score >= 40 => self::TIER_MODERATE,
            default => self::TIER_SAFE,
        };
    }

    /**
     * @return array{factor:string, points:int, evidence:string}
     */
    private function factor(string $factor, int $points, string $evidence): array
    {
        return ['factor' => $factor, 'points' => $points, 'evidence' => $evidence];
    }
}
