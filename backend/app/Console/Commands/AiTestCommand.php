<?php

namespace App\Console\Commands;

use App\Services\Ai\GroqDriver;
use Illuminate\Console\Command;
use Throwable;

/**
 * Fires one minimal Groq request and prints what came back.
 *
 * Exists so a bad key or a renamed model is diagnosed in seconds at the command
 * line, rather than inferred from an audit that quietly served a fixture.
 */
class AiTestCommand extends Command
{
    protected $signature = 'ai:test
                            {--model= : Override the configured model}
                            {--fallback : Test the fallback model instead}';

    protected $description = 'Send one minimal request to Groq and report model, latency, tokens, and the parsed response';

    public function handle(GroqDriver $driver): int
    {
        $model = $this->option('model')
            ?: ($this->option('fallback')
                ? config('services.groq.fallback_model')
                : config('services.groq.model'));

        $this->newLine();
        $this->line('  <options=bold>Groq connectivity test</>');
        $this->newLine();
        $this->line('  provider   : '.config('services.ai.provider'));
        $this->line('  mode       : '.config('services.ai.mode'));
        $this->line('  model      : '.$model);
        $this->line('  timeout    : '.config('services.groq.timeout').'s');
        $this->line('  key        : '.($driver->isConfigured() ? '<fg=green>configured</>' : '<fg=red>NOT SET</>'));
        $this->newLine();

        if (! $driver->isConfigured()) {
            $this->error('GROQ_API_KEY is empty. Set it in backend/.env and re-run.');
            $this->line('  The app still runs without it — audits serve from cache and fixtures.');

            return self::FAILURE;
        }

        $schema = [
            'type' => 'object',
            'required' => ['status', 'course_code', 'topics'],
            'properties' => [
                'status' => ['type' => 'string'],
                'course_code' => ['type' => 'string'],
                'topics' => ['type' => 'array', 'items' => ['type' => 'string']],
            ],
        ];

        $system = 'You are a connectivity probe for an academic audit system. '
            ."Return status \"ok\", echo the course code you are given, and list its two topics.\n\n"
            ."EXAMPLE\n"
            ."Input: Course CSE 1101 covers Loops and Functions.\n"
            .'Output: {"status":"ok","course_code":"CSE 1101","topics":["Loops","Functions"]}';

        $user = 'Course CSE 2101 covers Linked Lists and Hashing.';

        $startedAt = microtime(true);

        try {
            $result = $driver->json($system, $user, $schema, $model);
        } catch (Throwable $e) {
            $this->error('Request failed: '.$e->getMessage());

            $rateLimit = $driver->getLastRateLimit();
            if ($rateLimit !== []) {
                $this->newLine();
                $this->line('  rate-limit headers:');
                foreach ($rateLimit as $key => $value) {
                    $this->line(sprintf('    %-20s %s', $key, $value));
                }
            }

            return self::FAILURE;
        }

        $ms = (int) round((microtime(true) - $startedAt) * 1000);

        $this->line('  <fg=green>✓ response received</>');
        $this->newLine();
        $this->line('  responded by : '.($driver->getLastModel() ?? $model));
        $this->line('  latency      : '.$ms.' ms');
        $this->line('  tokens in    : '.($driver->getLastTokensIn() ?? '—'));
        $this->line('  tokens out   : '.($driver->getLastTokensOut() ?? '—'));

        $rateLimit = $driver->getLastRateLimit();
        if (isset($rateLimit['remaining_requests'])) {
            $this->line('  requests left: '.$rateLimit['remaining_requests'].' / '.($rateLimit['limit_requests'] ?? '?'));
        }

        $this->newLine();
        $this->line('  parsed response:');
        $this->line('  '.json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->newLine();

        return self::SUCCESS;
    }
}
