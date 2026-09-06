<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\Exam;
use App\Services\Audit\ExamModerator;
use App\Services\Audit\GradingDriftAnalyzer;
use App\Services\Audit\SyllabusHarmonizer;
use App\Services\Risk\RiskAnalyzer;
use Illuminate\Console\Command;
use Throwable;

/**
 * Asserts that every anomaly planted in the seed data is actually detected.
 *
 * Run this immediately before presenting. It is the difference between
 * believing the demo works and knowing it does: each check names a specific
 * planted defect and fails loudly if the engine has stopped finding it. A
 * non-zero exit means do not present until it is fixed.
 */
class DemoVerifyCommand extends Command
{
    protected $signature = 'demo:verify';

    protected $description = 'Assert every planted demo anomaly is still detected; exit non-zero if any is missed';

    /** @var array<int, array{group:string, name:string, ok:bool, detail:string}> */
    private array $results = [];

    public function handle(
        GradingDriftAnalyzer $grading,
        SyllabusHarmonizer $syllabus,
        ExamModerator $exams,
        RiskAnalyzer $risk,
    ): int {
        $courseA = Course::orderBy('id')->first();
        $courseB = Course::orderBy('id')->skip(1)->first();
        $draftExam = Exam::where('status', 'draft')->first();

        if (! $courseA || ! $courseB || ! $draftExam) {
            $this->error('Seed data is missing. Run `php artisan migrate:fresh --seed` first.');

            return self::FAILURE;
        }

        try {
            $this->verifyGradingDrift($grading->analyze($courseA->id));
            $this->verifySyllabus($syllabus->harmonise($courseA->id, $courseB->id));
            $this->verifyExam($exams->moderate($draftExam->id));
            $this->verifyStudents($risk->analyze($courseA));
        } catch (Throwable $e) {
            $this->error('An engine threw during verification: '.$e->getMessage());

            return self::FAILURE;
        }

        return $this->report();
    }

    // ---------------------------------------------------------------- checks

    /** The Section A / Section B leniency gap. */
    private function verifyGradingDrift(array $r): void
    {
        $g = 'Grading parity';

        $this->assert($g, 'drift is detected', $r['drift_detected'] === true, 'drift_detected='.json_encode($r['drift_detected']));

        $stats = collect($r['section_stats'] ?? []);
        $this->assert($g, 'both sections analysed', $stats->count() >= 2, $stats->count().' section(s)');

        $lenient = $stats->sortByDesc('leniency_index')->first();
        $harsh = $stats->sortBy('leniency_index')->first();

        if ($lenient && $harsh) {
            $gap = $lenient['mean'] - $harsh['mean'];
            $this->assert(
                $g,
                'leniency gap between sections is material',
                $gap >= 3.0,
                sprintf('%s %.2f vs %s %.2f (gap %.2f)', $lenient['section_name'], $lenient['mean'], $harsh['section_name'], $harsh['mean'], $gap)
            );

            $this->assert(
                $g,
                'leniency indices straddle the cohort norm',
                $lenient['leniency_index'] > 1.0 && $harsh['leniency_index'] < 1.0,
                sprintf('%.2f / %.2f', $lenient['leniency_index'], $harsh['leniency_index'])
            );
        }

        $this->assert($g, 'a normalisation shift is proposed', abs((float) ($r['normalization']['suggested_shift'] ?? 0)) > 0, 'shift='.($r['normalization']['suggested_shift'] ?? 'none'));
        $this->assert($g, 'insights are populated', count($r['insights'] ?? []) > 0, count($r['insights'] ?? []).' insight(s)');
    }

    /** The 3 redundant topics and 2 missing prerequisites. */
    private function verifySyllabus(array $r): void
    {
        $g = 'Curriculum harmony';

        $redundant = $r['redundant_topics'] ?? [];
        $missing = $r['missing_prerequisites'] ?? [];

        $this->assert($g, 'exactly 3 redundant topics found', count($redundant) === 3, count($redundant).' found: '.implode(', ', array_column($redundant, 'topic')));

        // The three planted re-teaches, by the concept each one re-covers.
        foreach (['complexity', 'recursion', 'traversal'] as $needle) {
            $hit = collect($redundant)->contains(fn ($t) => str_contains(mb_strtolower($t['topic']), $needle));
            $this->assert($g, "re-taught topic matching '$needle'", $hit, $hit ? 'found' : 'NOT FOUND');
        }

        $this->assert($g, 'exactly 2 missing prerequisites found', count($missing) === 2, count($missing).' found: '.implode(', ', array_column($missing, 'concept')));

        // The two planted gaps.
        foreach (['heap', 'amortized'] as $needle) {
            $hit = collect($missing)->contains(fn ($m) => str_contains(mb_strtolower($m['concept']), $needle));
            $this->assert($g, "missing prerequisite matching '$needle'", $hit, $hit ? 'found' : 'NOT FOUND');
        }

        $this->assert($g, 'alignment score reflects the findings', ($r['alignment_score'] ?? 100) < 80, 'score='.($r['alignment_score'] ?? '?'));
    }

    /** The 3 exam paper errors. */
    private function verifyExam(array $r): void
    {
        $g = 'Exam moderation';

        // Error 1: the marks do not sum to the declared total.
        $this->assert(
            $g,
            'mark-sum discrepancy detected',
            ($r['mark_sum_valid'] ?? true) === false,
            sprintf('calculated %s vs declared %s', $r['calculated_total'] ?? '?', $r['declared_total'] ?? '?')
        );

        // Error 2: a question repeats a past paper.
        $this->assert(
            $g,
            'duplicate past-paper question detected',
            count($r['duplicates'] ?? []) >= 1,
            count($r['duplicates'] ?? []).' duplicate(s): '.implode(', ', array_map(fn ($d) => 'Q'.$d['draft_q'], $r['duplicates'] ?? []))
        );

        // Error 3: marks allocated out of proportion to the work required.
        $flagTypes = [];
        foreach ($r['questions'] ?? [] as $q) {
            foreach ($q['flags'] ?? [] as $f) {
                $flagTypes[] = $f['type'];
            }
        }

        $this->assert(
            $g,
            'unfeasible mark allocation detected',
            in_array('unfeasible_marks', $flagTypes, true),
            in_array('unfeasible_marks', $flagTypes, true) ? 'found' : 'flags seen: '.implode(',', array_unique($flagTypes))
        );

        $this->assert($g, 'cognitive balance computed', isset($r['cognitive_balance']['verdict']), $r['cognitive_balance']['verdict'] ?? 'missing');
    }

    /** The at-risk students. */
    private function verifyStudents(array $r): void
    {
        $g = 'Student radar';

        $count = $r['at_risk_count'] ?? 0;
        $this->assert($g, 'at least 3 students flagged at risk', $count >= 3, "at_risk_count=$count");

        $students = collect($r['students'] ?? []);
        $this->assert($g, 'full cohort returned', $students->count() > $count, $students->count().' students analysed');

        // STU_042 is the planted late-collapse case and the one the demo script
        // walks through, so its absence would break the narrative on stage.
        $stu042 = $students->firstWhere('student_hash', 'STU_042');
        $this->assert($g, 'STU_042 present in the cohort', $stu042 !== null, $stu042 ? 'found' : 'NOT FOUND');

        if ($stu042) {
            $this->assert(
                $g,
                'STU_042 flagged above safe',
                in_array($stu042['risk_level'], ['medium', 'high'], true),
                'risk_level='.$stu042['risk_level'].', ml_probability='.$stu042['ml_probability']
            );

            $this->assert(
                $g,
                'STU_042 has a quiz collapse trigger',
                count($stu042['triggers'] ?? []) > 0,
                implode(' | ', $stu042['triggers'] ?? [])
            );
        }

        $narrated = $students->filter(fn ($s) => ! empty($s['narrative']) && ! empty($s['recommended_action']))->count();
        $this->assert($g, 'every student carries a narrative and an action', $narrated === $students->count(), "$narrated/{$students->count()}");
    }

    // ------------------------------------------------------------- reporting

    private function assert(string $group, string $name, bool $ok, string $detail = ''): void
    {
        $this->results[] = compact('group', 'name', 'ok', 'detail');
    }

    private function report(): int
    {
        $this->newLine();
        $this->line('  <options=bold>CogniFaculty — planted anomaly verification</>');

        $currentGroup = null;
        $failed = 0;

        foreach ($this->results as $r) {
            if ($r['group'] !== $currentGroup) {
                $currentGroup = $r['group'];
                $this->newLine();
                $this->line("  <fg=cyan>{$currentGroup}</>");
            }

            if (! $r['ok']) {
                $failed++;
            }

            $this->line(sprintf(
                '    %s %-46s %s',
                $r['ok'] ? '<fg=green>✓</>' : '<fg=red>✗</>',
                $r['name'],
                $r['detail'] ? "<fg=gray>{$r['detail']}</>" : ''
            ));
        }

        $total = count($this->results);
        $this->newLine();

        if ($failed > 0) {
            $this->line("  <fg=red;options=bold>FAILED — $failed of $total checks did not pass. Do not present until fixed.</>");
            $this->newLine();

            return self::FAILURE;
        }

        $this->line("  <fg=green;options=bold>All $total checks passed. Every planted anomaly is detected.</>");
        $this->newLine();

        return self::SUCCESS;
    }
}
