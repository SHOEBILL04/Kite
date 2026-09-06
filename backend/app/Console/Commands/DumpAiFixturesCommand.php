<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\Exam;
use App\Services\Audit\ExamModerator;
use App\Services\Audit\GradingDriftAnalyzer;
use App\Services\Audit\SyllabusHarmonizer;
use App\Services\Risk\RiskAnalyzer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Freezes each audit's full report to storage/app/fixtures/{task}.json.
 *
 * These are complete, contract-shaped reports rather than the AI sub-payloads
 * the model returns, because two different callers read them:
 *
 *   - the engines, which pull `insights` / `ai_summary` out when no model is
 *     reachable, and
 *   - AuditController, which serves a whole fixture as the response body if an
 *     engine throws.
 *
 * A full report satisfies both. Dumping only the model's slice would leave the
 * controller's last-resort path emitting a body the frontend cannot render.
 */
class DumpAiFixturesCommand extends Command
{
    protected $signature = 'ai:fixtures:dump';

    protected $description = 'Freeze every audit report to storage/app/fixtures/*.json for offline serving';

    public function handle(
        GradingDriftAnalyzer $grading,
        SyllabusHarmonizer $syllabus,
        ExamModerator $exams,
        RiskAnalyzer $risk,
    ): int {
        $dir = storage_path('app/fixtures');

        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            $this->error("Could not create $dir");

            return self::FAILURE;
        }

        $courseA = Course::orderBy('id')->first();
        $courseB = Course::orderBy('id')->skip(1)->first();
        $draftExam = Exam::where('status', 'draft')->first() ?? Exam::orderBy('id')->first();

        if (! $courseA || ! $draftExam) {
            $this->error('No seeded data found. Run `php artisan migrate:fresh --seed` first.');

            return self::FAILURE;
        }

        $jobs = [
            'grading-drift' => fn () => $grading->analyze($courseA->id),
            'syllabus' => fn () => $syllabus->harmonise($courseA->id, ($courseB ?? $courseA)->id),
            'exam-moderation' => fn () => $exams->moderate($draftExam->id),
            'vulnerable-students' => fn () => $risk->analyze($courseA),
        ];

        $this->info('Freezing audit reports to storage/app/fixtures/…');
        $this->newLine();

        $failed = 0;

        // Running an engine also writes an audit_reports row. Dumping fixtures
        // is a build step, not an audit, so the writes are rolled back --
        // otherwise every dump inflates the dashboard's report history.
        DB::beginTransaction();

        foreach ($jobs as $task => $job) {
            try {
                $report = $job();
                $path = $dir.DIRECTORY_SEPARATOR.$task.'.json';

                file_put_contents(
                    $path,
                    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n"
                );

                $this->line(sprintf(
                    '  <fg=green>✓</> %-22s %6s KB  (%d top-level keys)',
                    $task,
                    number_format(filesize($path) / 1024, 1),
                    count($report)
                ));
            } catch (Throwable $e) {
                $failed++;
                $this->line(sprintf('  <fg=red>✗</> %-22s %s', $task, $e->getMessage()));
            }
        }

        DB::rollBack();

        $this->newLine();

        if ($failed > 0) {
            $this->error("$failed fixture(s) failed to dump.");

            return self::FAILURE;
        }

        $this->info('Fixtures frozen. The demo now survives with no .env, no network, and no API key.');

        return self::SUCCESS;
    }
}
