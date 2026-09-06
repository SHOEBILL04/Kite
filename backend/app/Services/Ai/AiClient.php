<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The single entry point for every AI call in the application.
 *
 * The chain, in order, and it never throws to the caller:
 *
 *   1. ai_cache          -- keyed by a hash of the exact prompt
 *   2. fixture short-cut -- AI_MODE=fixture or cache_only, or no key configured
 *   3. Groq primary      -- llama-3.3-70b-versatile
 *   4. Groq fallback     -- llama-3.1-8b-instant, on rate limit or 5xx
 *   5. fixture           -- recorded reports, always present
 *
 * Groq is the only provider. The terminal fixture fallback is why the app stays
 * demoable with no key, no network and no .env, and every tier logs to ai_runs
 * so the path taken is inspectable after the fact.
 */
class AiClient
{
    public function __construct(protected GroqDriver $groqDriver) {}

    public function isConfigured(): bool
    {
        return $this->groqDriver->isConfigured();
    }

    /**
     * One structured JSON response. Returns null rather than throwing, so a
     * failed enrichment can never fail an audit.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>|null
     */
    public function structured(string $system, string $prompt, array $schema, int $maxTokens = 8000): ?array
    {
        try {
            return $this->run('vulnerable-students', $system, $prompt, $schema);
        } catch (Throwable $e) {
            Log::warning('AiClient: structured call failed: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Run one AI task through the resilience chain.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    public function run(string $task, string $system, string $user, array $schema): array
    {
        $startTime = microtime(true);
        $mode = config('services.ai.mode', 'fixture');
        $hasKey = $this->groqDriver->isConfigured();
        $model = config('services.groq.model', 'llama-3.3-70b-versatile');

        $promptHash = hash('sha256', $task.'|'.$system.'|'.$user.'|'.$model);

        // 1. CACHE -----------------------------------------------------------
        $cached = DB::table('ai_cache')->where('prompt_hash', $promptHash)->first();

        if ($cached) {
            $decoded = json_decode($cached->response_json, true);

            if (is_array($decoded)) {
                $this->logRun($task, $cached->driver, null, null, $this->calcLatency($startTime), true, true);

                return $decoded;
            }
        }

        // 2. FIXTURE SHORT-CUT -------------------------------------------------
        if ($mode === 'fixture' || $mode === 'cache_only' || ! $hasKey) {
            $fixture = $this->loadFixture($task);
            $this->storeInCache($promptHash, $task, 'fixture', $fixture);
            $this->logRun($task, 'fixture', null, null, $this->calcLatency($startTime), true, false);

            return $fixture;
        }

        // 3 + 4. GROQ: PRIMARY MODEL, THEN THE LIGHTER FALLBACK ----------------
        $candidates = [$model, config('services.groq.fallback_model', 'llama-3.1-8b-instant')];

        foreach ($candidates as $index => $candidate) {
            $driverStart = microtime(true);

            try {
                $result = $this->groqDriver->json($system, $user, $schema, $candidate);

                $this->storeInCache($promptHash, $task, 'groq', $result);
                $this->logRun(
                    $task,
                    'groq',
                    $this->groqDriver->getLastTokensIn(),
                    $this->groqDriver->getLastTokensOut(),
                    $this->calcLatency($driverStart),
                    true,
                    false,
                    null,
                    $candidate
                );

                return $result;
            } catch (Throwable $e) {
                $rateLimit = $this->groqDriver->getLastRateLimit();

                Log::warning("Groq ({$candidate}) failed for task '{$task}': ".$e->getMessage(), $rateLimit);

                $this->logRun(
                    $task,
                    'groq',
                    null,
                    null,
                    $this->calcLatency($driverStart),
                    false,
                    false,
                    $this->describeFailure($e, $rateLimit),
                    $candidate
                );

                // Only a capacity failure justifies spending a second request;
                // a schema failure would just fail again on a smaller model.
                if ($index === 0 && ! $this->isCapacityFailure($e, $rateLimit)) {
                    break;
                }
            }
        }

        // 5. FIXTURE ------------------------------------------------------------
        Log::info("Falling back to deterministic fixture for task '{$task}'.");
        $fixture = $this->loadFixture($task);
        $this->logRun($task, 'fixture_fallback', null, null, $this->calcLatency($startTime), true, false);

        return $fixture;
    }

    /**
     * Load a frozen report from storage/app/fixtures/{task}.json.
     *
     * @return array<string, mixed>
     */
    public function loadFixture(string $task): array
    {
        $path = storage_path("app/fixtures/{$task}.json");

        if (! file_exists($path)) {
            $altPath = base_path("storage/app/fixtures/{$task}.json");

            if (file_exists($altPath)) {
                $path = $altPath;
            }
        }

        if (file_exists($path)) {
            $decoded = json_decode((string) file_get_contents($path), true);

            if (is_array($decoded)) {
                return $decoded;
            }
        }

        Log::error("Fixture not found for task '{$task}' at '{$path}'.");

        return ['status' => 'ok', 'task' => $task, 'ai_summary' => 'Default system fallback.'];
    }

    // ----------------------------------------------------------------- internals

    /** @param array<string, string> $rateLimit */
    private function isCapacityFailure(Throwable $e, array $rateLimit): bool
    {
        $status = $rateLimit['status'] ?? '';

        return $status === '429'
            || (is_numeric($status) && (int) $status >= 500)
            || str_contains($e->getMessage(), '(429)')
            || (bool) preg_match('/\((5\d\d)\)/', $e->getMessage());
    }

    /** @param array<string, string> $rateLimit */
    private function describeFailure(Throwable $e, array $rateLimit): string
    {
        // Rate-limit headers are the diagnostic that matters on the free tier,
        // so they are recorded alongside the message.
        if (($rateLimit['status'] ?? '') === '429') {
            return 'RATE LIMITED -- '.$e->getMessage().' | '.json_encode($rateLimit);
        }

        return $rateLimit === [] ? $e->getMessage() : $e->getMessage().' | '.json_encode($rateLimit);
    }

    /** @param array<string, mixed> $response */
    protected function storeInCache(string $promptHash, string $task, string $driver, array $response): void
    {
        try {
            DB::table('ai_cache')->updateOrInsert(
                ['prompt_hash' => $promptHash],
                [
                    'task' => $task,
                    'driver' => $driver,
                    'response_json' => json_encode($response),
                    'created_at' => now(),
                ]
            );
        } catch (Throwable $e) {
            Log::error('Failed to store AI cache: '.$e->getMessage());
        }
    }

    protected function logRun(
        string $task,
        string $driver,
        ?int $tokensIn,
        ?int $tokensOut,
        int $latencyMs,
        bool $ok,
        bool $fromCache = false,
        ?string $error = null,
        ?string $model = null,
    ): void {
        // Tell the request-scoped telemetry which path served the work so the
        // response envelope can report Live / Cached / Fixture. Failed attempts
        // are not a serving path and are not recorded there.
        if ($ok) {
            app(AiTelemetry::class)->record($driver, $fromCache);
        }

        try {
            DB::table('ai_runs')->insert([
                'task' => $task,
                'driver' => $model ? "{$driver}:{$model}" : $driver,
                'tokens_in' => $tokensIn,
                'tokens_out' => $tokensOut,
                'latency_ms' => $latencyMs,
                'ok' => $ok,
                'from_cache' => $fromCache,
                'error' => $error ? substr($error, 0, 1000) : null,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::error('Failed to log AI run: '.$e->getMessage());
        }
    }

    protected function calcLatency(float $startTime): int
    {
        return (int) round((microtime(true) - $startTime) * 1000);
    }
}
