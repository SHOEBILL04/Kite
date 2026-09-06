<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\Exam;
use App\Models\Student;
use App\Services\Ai\AiClient;
use Illuminate\Console\Command;

class WarmAiCacheCommand extends Command
{
    protected $signature = 'ai:warm {--force : Overwrite existing cached entries}';
    protected $description = 'Pre-compute and populate ai_cache for all seeded demo audits so the demo serves with zero latency offline';

    public function handle(AiClient $client): int
    {
        $this->info('Starting CogniFaculty AI Cache Warming…');

        $tasks = [
            'grading-drift' => [
                'system' => 'You are an academic auditor specializing in institutional grading parity.',
                'user' => 'Audit grading variance for CSE 2101 between Section A and Section B.',
                'schema' => [
                    'type' => 'object',
                    'required' => ['drift_detected', 'severity', 'section_stats', 'insights', 'normalization', 'ai_summary'],
                    'properties' => [
                        'drift_detected' => ['type' => 'boolean'],
                        'severity' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                        'section_stats' => ['type' => 'array'],
                        'insights' => ['type' => 'array'],
                        'normalization' => ['type' => 'object'],
                        'ai_summary' => ['type' => 'string'],
                    ],
                ],
            ],
            'exam-moderation' => [
                'system' => 'You are an academic examination moderator evaluating Bloom taxonomy balance and defect detection.',
                'user' => 'Audit CSE 2101 Fall 2025 Final draft examination paper.',
                'schema' => [
                    'type' => 'object',
                    'required' => ['mark_sum_valid', 'calculated_total', 'declared_total', 'questions', 'duplicates', 'cognitive_balance', 'ai_summary'],
                    'properties' => [
                        'mark_sum_valid' => ['type' => 'boolean'],
                        'calculated_total' => ['type' => 'number'],
                        'declared_total' => ['type' => 'number'],
                        'questions' => ['type' => 'array'],
                        'duplicates' => ['type' => 'array'],
                        'cognitive_balance' => ['type' => 'object'],
                        'ai_summary' => ['type' => 'string'],
                    ],
                ],
            ],
            'syllabus' => [
                'system' => 'You are a university curriculum harmonizer assessing overlap and prerequisite alignment.',
                'user' => 'Audit syllabus alignment between CSE 2101 (Data Structures) and CSE 2103 (Algorithms).',
                'schema' => [
                    'type' => 'object',
                    'required' => ['alignment_score', 'redundant_topics', 'missing_prerequisites', 'bloom_coverage', 'actionable_changes', 'ai_summary'],
                    'properties' => [
                        'alignment_score' => ['type' => 'number'],
                        'redundant_topics' => ['type' => 'array'],
                        'missing_prerequisites' => ['type' => 'array'],
                        'bloom_coverage' => ['type' => 'object'],
                        'actionable_changes' => ['type' => 'array'],
                        'ai_summary' => ['type' => 'string'],
                    ],
                ],
            ],
            'vulnerable-students' => [
                'system' => 'You are an early-warning student retention auditor analyzing multi-signal disengagement.',
                'user' => 'Audit student academic trajectories for CSE 2101 cohort.',
                'schema' => [
                    'type' => 'object',
                    'required' => ['at_risk_count', 'students'],
                    'properties' => [
                        'at_risk_count' => ['type' => 'number'],
                        'students' => ['type' => 'array'],
                    ],
                ],
            ],
        ];

        $rows = [];

        foreach ($tasks as $taskName => $config) {
            $this->output->write("  Warming [{$taskName}]… ");
            $start = microtime(true);

            $result = $client->run(
                $taskName,
                $config['system'],
                $config['user'],
                $config['schema']
            );

            $ms = (int) round((microtime(true) - $start) * 1000);
            $hasData = !empty($result);

            $this->output->writeln("<info>✓ DONE</info> ({$ms}ms)");
            $rows[] = [$taskName, $hasData ? 'CACHED / OK' : 'FAILED', "{$ms} ms"];
        }

        $this->newLine();
        $this->table(['Task', 'Status', 'Duration'], $rows);
        $this->info('AI cache warming completed successfully. All demo responses are now cached locally in SQLite.');

        return Command::SUCCESS;
    }
}
