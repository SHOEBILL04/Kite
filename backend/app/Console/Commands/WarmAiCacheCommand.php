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
 * Warms the AI cache by running every audit exactly as the API runs it.
 *
 * The cache is keyed on a hash of the prompt the engine actually sends, so
 * warming has to go through the engines themselves. Warming with hand-written
 * prompts populates entries the live endpoints can never hit, and the demo
 * still pays full model latency on stage.
 */
class WarmAiCacheCommand extends Command
{
    protected $signature = 'ai:warm
                            {--force : Clear existing cache entries before warming}';

    protected $description = 'Run every audit against seeded data so the AI cache is populated with the exact prompts the API uses';

    public function handle(
        GradingDriftAnalyzer $grading,
        SyllabusHarmonizer $syllabus,
        ExamModerator $exams,
        RiskAnalyzer $risk,
    ): int {
        if ($this->option('force')) {
            DB::table('ai_cache')->delete();
            $this->warn('Cleared ai_cache.');
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

        $this->info('Warming AI cache against seeded data…');
        $this->newLine();

        $failed = 0;

        foreach ($jobs as $task => $job) {
            $startedAt = microtime(true);

            try {
                $job();
                $ms = (int) round((microtime(true) - $startedAt) * 1000);
                $this->line(sprintf('  <fg=green>✓</> %-22s warmed in %4d ms', $task, $ms));
            } catch (Throwable $e) {
                $failed++;
                $this->line(sprintf('  <fg=red>✗</> %-22s %s', $task, $e->getMessage()));
            }
        }

        $this->newLine();
        $this->line('  ai_cache entries: '.DB::table('ai_cache')->count());

        if ($failed > 0) {
            $this->error("$failed task(s) failed to warm.");

            return self::FAILURE;
        }

        $this->info('Cache warm. Run `php artisan ai:fixtures:dump` to freeze these as offline fixtures.');

        return self::SUCCESS;
    }
}
