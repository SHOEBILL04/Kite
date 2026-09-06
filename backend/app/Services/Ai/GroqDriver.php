<?php

namespace App\Services\Ai;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Groq (Llama) — the only chat provider.
 *
 * Two things about Groq shape this class:
 *
 * 1. Its OpenAI-compatible layer has no JSON *schema* parameter. `json_object`
 *    mode guarantees syntactically valid JSON and nothing about its shape, so
 *    the schema is stated in the system message as a contract and the result is
 *    validated here rather than trusted.
 *
 * 2. The free tier caps at 30 requests/minute and 14,400/day at the
 *    ORGANIZATION level, so a second key buys nothing. A 429 is a routine
 *    operating condition, not an exception — it is retried with backoff, then
 *    retried once on the lighter model, and only then given up on.
 */
class GroqDriver implements AiDriverInterface
{
    private const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

    /** Backoff between rate-limited attempts, in seconds. */
    private const BACKOFF_SECONDS = [1, 2, 4];

    private const MAX_ATTEMPTS = 3;

    protected ?int $lastTokensIn = null;

    protected ?int $lastTokensOut = null;

    /** Model that actually produced the last response. */
    protected ?string $lastModel = null;

    /** x-ratelimit-* headers from the last response, for ai_runs. */
    protected array $lastRateLimit = [];

    public function __construct(
        protected ?string $apiKey = null,
        protected ?string $model = null,
        protected ?string $fallbackModel = null,
        protected float $temperature = 0.2,
    ) {
        $this->apiKey = $apiKey ?? config('services.groq.key');
        $this->model = $model ?? config('services.groq.model', 'llama-3.3-70b-versatile');
        $this->fallbackModel = $fallbackModel ?? config('services.groq.fallback_model', 'llama-3.1-8b-instant');
        $this->temperature = (float) config('services.groq.temperature', 0.2);
    }

    public function getDriverName(): string
    {
        return 'groq';
    }

    public function getLastTokensIn(): ?int
    {
        return $this->lastTokensIn;
    }

    public function getLastTokensOut(): ?int
    {
        return $this->lastTokensOut;
    }

    public function getLastModel(): ?string
    {
        return $this->lastModel;
    }

    /**
     * @return array<string, string>
     */
    public function getLastRateLimit(): array
    {
        return $this->lastRateLimit;
    }

    public function isConfigured(): bool
    {
        return ! empty($this->apiKey);
    }

    /**
     * One structured JSON completion.
     *
     * @param  array<string, mixed>  $schema
     * @param  string|null  $model  overrides the configured primary model
     * @return array<string, mixed>
     */
    public function json(string $system, string $user, array $schema, ?string $model = null): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Groq API key is not configured.');
        }

        $model ??= $this->model;
        $prompt = $this->buildSystemPrompt($system, $schema);

        $response = $this->send($prompt, $user, $model);
        $decoded = $this->decode($response);

        if ($this->matchesSchema($decoded, $schema)) {
            return $decoded;
        }

        // One repair attempt: echo the invalid output back with the contract.
        // Beyond this the caller falls through to cache or fixture, which is
        // cheaper and more predictable than arguing with the model.
        $repair = $this->send(
            $prompt,
            "Your previous response did not match the required schema.\n\n"
                ."Previous response:\n".json_encode($decoded, JSON_UNESCAPED_SLASHES)."\n\n"
                ."Original request:\n".$user."\n\n"
                .'Return the corrected JSON object only.',
            $model
        );

        $repaired = $this->decode($repair);

        if (! $this->matchesSchema($repaired, $schema)) {
            throw new RuntimeException('Groq output did not match the requested schema after one repair attempt.');
        }

        return $repaired;
    }

    /**
     * Try the primary model, then the lighter fallback model once.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, mixed>
     */
    public function jsonWithFallbackModel(string $system, string $user, array $schema): array
    {
        try {
            return $this->json($system, $user, $schema, $this->model);
        } catch (RuntimeException $e) {
            // Only a capacity problem justifies burning a second request; a
            // schema failure would just fail again on a smaller model.
            if (! $this->isCapacityFailure($e)) {
                throw $e;
            }

            return $this->json($system, $user, $schema, $this->fallbackModel);
        }
    }

    // ------------------------------------------------------------------ HTTP

    private function send(string $system, string $user, string $model): Response
    {
        $timeout = (int) config('services.groq.timeout', 45);
        $lastError = null;

        for ($attempt = 0; $attempt < self::MAX_ATTEMPTS; $attempt++) {
            $response = Http::withToken($this->apiKey)
                ->timeout($timeout)
                ->acceptJson()
                ->post(self::ENDPOINT, [
                    'model' => $model,
                    'temperature' => $this->temperature,
                    'response_format' => ['type' => 'json_object'],
                    'messages' => [
                        ['role' => 'system', 'content' => $system],
                        ['role' => 'user', 'content' => $user],
                    ],
                ]);

            $this->captureRateLimit($response);
            $this->lastModel = $model;

            if ($response->successful()) {
                return $response;
            }

            $status = $response->status();
            $retryable = $status === 429 || $status >= 500;

            if (! $retryable) {
                throw new RuntimeException("Groq API error ($status): ".$response->body());
            }

            $lastError = "Groq API error ($status): ".$response->body();

            if ($attempt === self::MAX_ATTEMPTS - 1) {
                break;
            }

            // Honour the server's own retry-after when it gives one; otherwise
            // back off exponentially.
            $retryAfter = (int) ($response->header('retry-after') ?: 0);
            $wait = $retryAfter > 0 ? $retryAfter : self::BACKOFF_SECONDS[$attempt];
            sleep(min($wait, 8));
        }

        throw new RuntimeException($lastError ?? 'Groq request failed.');
    }

    private function captureRateLimit(Response $response): void
    {
        $this->lastRateLimit = array_filter([
            'retry_after' => $response->header('retry-after'),
            'limit_requests' => $response->header('x-ratelimit-limit-requests'),
            'remaining_requests' => $response->header('x-ratelimit-remaining-requests'),
            'reset_requests' => $response->header('x-ratelimit-reset-requests'),
            'limit_tokens' => $response->header('x-ratelimit-limit-tokens'),
            'remaining_tokens' => $response->header('x-ratelimit-remaining-tokens'),
            'status' => (string) $response->status(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(Response $response): array
    {
        $data = $response->json();

        $this->lastTokensIn = $data['usage']['prompt_tokens'] ?? null;
        $this->lastTokensOut = $data['usage']['completion_tokens'] ?? null;

        $content = $data['choices'][0]['message']['content'] ?? null;

        if (! $content) {
            throw new RuntimeException('Groq returned empty response content.');
        }

        $decoded = json_decode($this->stripFences($content), true);

        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
            throw new RuntimeException('Groq output was not valid JSON: '.json_last_error_msg());
        }

        return $decoded;
    }

    /**
     * Llama still emits ```json fences now and then despite json_object mode,
     * so they are stripped defensively rather than trusted not to appear.
     */
    private function stripFences(string $content): string
    {
        $trimmed = trim($content);

        if (str_starts_with($trimmed, '```')) {
            $trimmed = preg_replace('/^```[a-zA-Z]*\s*/', '', $trimmed);
            $trimmed = preg_replace('/\s*```$/', '', $trimmed);
        }

        return trim($trimmed);
    }

    // ------------------------------------------------------------- contract

    /**
     * Restate the schema as a contract at the END of the system message.
     *
     * Llama weights recency heavily, so the schema and the output instruction
     * are the last things it reads before generating.
     *
     * @param  array<string, mixed>  $schema
     */
    private function buildSystemPrompt(string $system, array $schema): string
    {
        return $system."\n\n"
            ."OUTPUT CONTRACT\n"
            ."Your response must be a single JSON object matching this schema:\n"
            .json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n\n"
            ."Rules:\n"
            ."- Do not wrap the JSON in markdown fences.\n"
            ."- Do not add explanatory text, preamble, or commentary.\n"
            ."- Do not emit trailing commas.\n"
            ."- Do not invent fields that are not in the schema.\n"
            ."- Include every required field, even when a value is null or an empty array.\n\n"
            .'Respond with a single valid JSON object matching this schema exactly. '
            .'No markdown fences, no commentary, no preamble.';
    }

    /**
     * Shape check: every top-level required key present, and any field the
     * schema declares as an array actually is one.
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $schema
     */
    private function matchesSchema(array $data, array $schema): bool
    {
        $properties = $schema['properties'] ?? [];
        $required = $schema['required'] ?? array_keys($properties);

        foreach ($required as $key) {
            if (! array_key_exists($key, $data)) {
                return false;
            }
        }

        foreach ($properties as $key => $definition) {
            if (! array_key_exists($key, $data)) {
                continue;
            }

            $type = $definition['type'] ?? null;

            if ($type === 'array' && ! is_array($data[$key])) {
                return false;
            }

            if ($type === 'object' && ! is_array($data[$key])) {
                return false;
            }
        }

        return true;
    }

    private function isCapacityFailure(RuntimeException $e): bool
    {
        $message = $e->getMessage();

        return str_contains($message, '(429)')
            || (bool) preg_match('/\((5\d\d)\)/', $message)
            || str_contains($message, 'request failed');
    }
}
