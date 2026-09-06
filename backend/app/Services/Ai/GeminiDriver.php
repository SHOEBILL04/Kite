<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class GeminiDriver implements AiDriverInterface
{
    protected ?int $lastTokensIn = null;
    protected ?int $lastTokensOut = null;

    public function __construct(
        protected ?string $apiKey = null,
        protected ?string $model = null,
        protected float $temperature = 0.2
    ) {
        $this->apiKey = $apiKey ?? config('services.gemini.key');
        $this->model = $model ?? config('services.gemini.model', 'gemini-1.5-flash');
        $this->temperature = (float) config('services.gemini.temperature', 0.2);
    }

    public function getDriverName(): string
    {
        return 'gemini';
    }

    public function getLastTokensIn(): ?int
    {
        return $this->lastTokensIn;
    }

    public function getLastTokensOut(): ?int
    {
        return $this->lastTokensOut;
    }

    /**
     * @inheritDoc
     */
    public function json(string $system, string $user, array $schema): array
    {
        if (empty($this->apiKey)) {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}";

        $body = [
            'system_instruction' => [
                'parts' => [['text' => $system]],
            ],
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [['text' => $user]],
                ],
            ],
            'generationConfig' => [
                'temperature' => $this->temperature,
                'responseMimeType' => 'application/json',
                'responseSchema' => $this->cleanSchemaForGemini($schema),
            ],
        ];

        $delays = [1, 2, 4];
        $lastException = null;

        for ($attempt = 0; $attempt <= count($delays); $attempt++) {
            try {
                $response = Http::timeout(30)->post($url, $body);

                if ($response->successful()) {
                    $json = $response->json();
                    $this->lastTokensIn = $json['usageMetadata']['promptTokenCount'] ?? null;
                    $this->lastTokensOut = $json['usageMetadata']['candidatesTokenCount'] ?? null;

                    $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? null;
                    if (!$text) {
                        throw new RuntimeException('Gemini returned an empty candidate text.');
                    }

                    $decoded = json_decode($text, true);
                    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                        throw new RuntimeException('Gemini returned invalid JSON: ' . json_last_error_msg());
                    }

                    return $decoded;
                }

                $status = $response->status();
                $errorBody = $response->body();

                // 429 rate limit or 5xx server error: exponential backoff
                if (($status === 429 || $status >= 500) && $attempt < count($delays)) {
                    $sleepSec = $delays[$attempt];
                    Log::warning("Gemini returned HTTP {$status}. Retrying in {$sleepSec}s (Attempt {$attempt}). Details: {$errorBody}");
                    sleep($sleepSec);
                    continue;
                }

                throw new RuntimeException("Gemini API error ({$status}): {$errorBody}");
            } catch (Throwable $e) {
                $lastException = $e;
                if ($attempt < count($delays) && ($e instanceof \Illuminate\Http\Client\ConnectionException || str_contains($e->getMessage(), '429'))) {
                    $sleepSec = $delays[$attempt];
                    Log::warning("Gemini network error. Retrying in {$sleepSec}s (Attempt {$attempt}): " . $e->getMessage());
                    sleep($sleepSec);
                    continue;
                }
                break;
            }
        }

        throw $lastException ?? new RuntimeException('Gemini generation failed.');
    }

    /**
     * Ensure schema format matches Gemini expectations.
     */
    protected function cleanSchemaForGemini(array $schema): array
    {
        // Remove JSON Schema metadata keys not recognized by Gemini if present
        unset($schema['$schema'], $schema['$id'], $schema['title'], $schema['default']);
        return $schema;
    }
}
