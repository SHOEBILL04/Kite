<?php

namespace App\Services\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\RateLimitException;
use Illuminate\Support\Facades\Log;

/**
 * Thin wrapper over the Anthropic Messages API.
 *
 * Callers hand over a system prompt, a user prompt, and a JSON schema; they get
 * back a decoded array or null. Every failure mode is swallowed and logged --
 * the AI layer enriches an audit, it never blocks one. A risk report with real
 * scores and no narratives is still a useful report.
 */
class AiClient
{
    private ?Client $client = null;

    public function __construct(
        private ?string $apiKey = null,
        private ?string $model = null,
    ) {
        $this->apiKey ??= config('services.anthropic.key');
        $this->model ??= config('services.anthropic.model', 'claude-opus-5');
    }

    public function isConfigured(): bool
    {
        return ! empty($this->apiKey);
    }

    /**
     * One request, one structured JSON response.
     *
     * @param  array<string, mixed>  $schema  JSON Schema the reply must satisfy.
     * @return array<string, mixed>|null  Decoded payload, or null on any failure.
     */
    public function structured(string $system, string $prompt, array $schema, int $maxTokens = 8000): ?array
    {
        if (! $this->isConfigured()) {
            Log::warning('AiClient: ANTHROPIC_API_KEY is not set; skipping AI enrichment.');

            return null;
        }

        try {
            $message = $this->client()->messages->create(
                model: $this->model,
                maxTokens: $maxTokens,
                system: [
                    // The constraints are stable across every request in a run,
                    // so they sit first and are worth caching.
                    ['type' => 'text', 'text' => $system, 'cacheControl' => ['type' => 'ephemeral']],
                ],
                messages: [
                    ['role' => 'user', 'content' => $prompt],
                ],
                outputConfig: [
                    'format' => [
                        'type' => 'json_schema',
                        'schema' => $schema,
                    ],
                ],
            );

            // Safety classifiers can decline a request with HTTP 200. Check the
            // stop reason before reading content.
            if ($message->stopReason === 'refusal') {
                Log::warning('AiClient: request refused.', [
                    'category' => $message->stopDetails?->category,
                ]);

                return null;
            }

            foreach ($message->content as $block) {
                if ($block->type === 'text') {
                    $decoded = json_decode($block->text, true);

                    return is_array($decoded) ? $decoded : null;
                }
            }

            return null;
        } catch (AuthenticationException $e) {
            Log::error('AiClient: authentication failed -- check ANTHROPIC_API_KEY.', ['message' => $e->getMessage()]);
        } catch (RateLimitException $e) {
            Log::warning('AiClient: rate limited.', ['message' => $e->getMessage()]);
        } catch (APIStatusException $e) {
            Log::error('AiClient: API returned an error.', ['message' => $e->getMessage()]);
        } catch (APIConnectionException $e) {
            Log::error('AiClient: could not reach the API.', ['message' => $e->getMessage()]);
        }

        return null;
    }

    private function client(): Client
    {
        return $this->client ??= new Client(apiKey: $this->apiKey);
    }
}
