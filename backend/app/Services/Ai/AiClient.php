<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class AiClient
{
    public function __construct(
        protected GeminiDriver $geminiDriver,
        protected GroqDriver $groqDriver
    ) {}

    public function isConfigured(): bool
    {
        return !empty(config('services.gemini.key')) || !empty(config('services.groq.key'));
    }

    /**
     * One structured JSON response (used by RiskAnalyzer).
     *
     * @param string $system
     * @param string $prompt
     * @param array $schema
     * @param int $maxTokens
     * @return array|null
     */
    public function structured(string $system, string $prompt, array $schema, int $maxTokens = 8000): ?array
    {
        try {
            return $this->run('vulnerable-students', $system, $prompt, $schema);
        } catch (\Throwable $e) {
            Log::warning('AiClient: structured call failed: ' . $e->getMessage());
            return null;
        }
    }


    /**
     * Run an AI inference task through the resilience pipeline:
     * 1. Persistent SQLite Cache (ai_cache)
     * 2. Fixture mode / no-key check
     * 3. Primary Driver (Gemini with backoff)
     * 4. Fallback Driver (Groq LLaMA 3.3)
     * 5. Schema Validation & 1-shot repair
     * 6. Safe Fixture Fallback (never throw to user)
     * 7. Audit run logging (ai_runs)
     */
    public function run(string $task, string $system, string $user, array $schema): array
    {
        $startTime = microtime(true);
        $mode = config('services.ai.mode', 'fixture');
        $hasGeminiKey = !empty(config('services.gemini.key'));
        $hasGroqKey = !empty(config('services.groq.key'));

        $modelName = config('services.gemini.model', 'gemini-1.5-flash');
        $promptHash = hash('sha256', $task . '|' . $system . '|' . $user . '|' . $modelName);

        // 1. CACHE LOOKUP (Persistent SQLite ai_cache)
        $cached = DB::table('ai_cache')->where('prompt_hash', $promptHash)->first();
        if ($cached) {
            $decoded = json_decode($cached->response_json, true);
            if (is_array($decoded)) {
                $this->logRun($task, $cached->driver, null, null, $this->calcLatency($startTime), true, true);
                return $decoded;
            }
        }

        // 2. FIXTURE MODE OR ZERO KEYS CONFIGURED
        if ($mode === 'fixture' || (!$hasGeminiKey && !$hasGroqKey)) {
            $fixture = $this->loadFixture($task);
            $this->storeInCache($promptHash, $task, 'fixture', $fixture);
            $this->logRun($task, 'fixture', null, null, $this->calcLatency($startTime), true, false);
            return $fixture;
        }

        // 3. ATTEMPT PRIMARY DRIVER (GEMINI)
        if ($hasGeminiKey) {
            try {
                $driverStart = microtime(true);
                $result = $this->geminiDriver->json($system, $user, $schema);

                // Schema validation & repair if necessary
                if (!$this->validateSchema($result, $schema)) {
                    $result = $this->repairAttempt($this->geminiDriver, $system, $user, $schema, $result);
                }

                if ($this->validateSchema($result, $schema)) {
                    $this->storeInCache($promptHash, $task, 'gemini', $result);
                    $this->logRun(
                        $task,
                        'gemini',
                        $this->geminiDriver->getLastTokensIn(),
                        $this->geminiDriver->getLastTokensOut(),
                        $this->calcLatency($driverStart),
                        true,
                        false
                    );
                    return $result;
                }
            } catch (Throwable $e) {
                Log::warning("Gemini driver failed for task '{$task}': " . $e->getMessage());
                $this->logRun($task, 'gemini', null, null, $this->calcLatency($startTime), false, false, $e->getMessage());
            }
        }

        // 4. ATTEMPT FALLBACK DRIVER (GROQ)
        if ($hasGroqKey) {
            try {
                $driverStart = microtime(true);
                $result = $this->groqDriver->json($system, $user, $schema);

                // Schema validation & repair if necessary
                if (!$this->validateSchema($result, $schema)) {
                    $result = $this->repairAttempt($this->groqDriver, $system, $user, $schema, $result);
                }

                if ($this->validateSchema($result, $schema)) {
                    $this->storeInCache($promptHash, $task, 'groq', $result);
                    $this->logRun(
                        $task,
                        'groq',
                        $this->groqDriver->getLastTokensIn(),
                        $this->groqDriver->getLastTokensOut(),
                        $this->calcLatency($driverStart),
                        true,
                        false
                    );
                    return $result;
                }
            } catch (Throwable $e) {
                Log::warning("Groq fallback driver failed for task '{$task}': " . $e->getMessage());
                $this->logRun($task, 'groq', null, null, $this->calcLatency($startTime), false, false, $e->getMessage());
            }
        }

        // 5. FIXTURE AS FINAL FALLBACK — NEVER THROW TO THE USER
        Log::info("Falling back to deterministic fixture for task '{$task}'.");
        $fixture = $this->loadFixture($task);
        $this->logRun($task, 'fixture_fallback', null, null, $this->calcLatency($startTime), true, false);

        return $fixture;
    }

    /**
     * Validate decoded JSON against top-level required schema keys.
     */
    protected function validateSchema(array $data, array $schema): bool
    {
        if (empty($schema['properties']) && empty($schema['required'])) {
            return true;
        }

        $requiredKeys = $schema['required'] ?? array_keys($schema['properties'] ?? []);
        foreach ($requiredKeys as $key) {
            if (!array_key_exists($key, $data)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Execute one repair attempt asking the model to fix its schema mismatch.
     */
    protected function repairAttempt(
        AiDriverInterface $driver,
        string $system,
        string $user,
        array $schema,
        array $faultyOutput
    ): array {
        try {
            $repairPrompt = "Your previous output was missing required keys according to the schema. " .
                "Here is your previous faulty output:\n" . json_encode($faultyOutput) . "\n\n" .
                "Re-generate the response strictly conforming to the requested schema. Return ONLY raw valid JSON.";

            return $driver->json($system, $repairPrompt, $schema);
        } catch (Throwable $e) {
            Log::warning("Repair attempt failed on driver {$driver->getDriverName()}: " . $e->getMessage());
            return $faultyOutput;
        }
    }

    /**
     * Load fixture file from storage/app/fixtures/{task}.json
     */
    public function loadFixture(string $task): array
    {
        $path = storage_path("app/fixtures/{$task}.json");

        if (!file_exists($path)) {
            $altPath = base_path("storage/app/fixtures/{$task}.json");
            if (file_exists($altPath)) {
                $path = $altPath;
            }
        }

        if (file_exists($path)) {
            $content = file_get_contents($path);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        Log::error("Fixture not found for task '{$task}' at '{$path}'.");
        return ['status' => 'ok', 'task' => $task, 'ai_summary' => 'Default system fallback.'];
    }

    /**
     * Save response to SQLite cache.
     */
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
            Log::error("Failed to store AI cache: " . $e->getMessage());
        }
    }

    /**
     * Log attempt to ai_runs table.
     */
    protected function logRun(
        string $task,
        string $driver,
        ?int $tokensIn,
        ?int $tokensOut,
        int $latencyMs,
        bool $ok,
        bool $fromCache = false,
        ?string $error = null
    ): void {
        // Tell the request-scoped telemetry which path actually served the
        // work, so the response envelope can report Live / Cached / Fixture.
        // Failed attempts are not a serving path and are not recorded.
        if ($ok) {
            app(AiTelemetry::class)->record($driver, $fromCache);
        }

        try {
            DB::table('ai_runs')->insert([
                'task' => $task,
                'driver' => $driver,
                'tokens_in' => $tokensIn,
                'tokens_out' => $tokensOut,
                'latency_ms' => $latencyMs,
                'ok' => $ok,
                'from_cache' => $fromCache,
                'error' => $error ? substr($error, 0, 1000) : null,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::error("Failed to log AI run: " . $e->getMessage());
        }
    }

    protected function calcLatency(float $startTime): int
    {
        return (int) round((microtime(true) - $startTime) * 1000);
    }
}
