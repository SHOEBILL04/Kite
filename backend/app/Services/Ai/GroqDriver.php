<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GroqDriver implements AiDriverInterface
{
    protected ?int $lastTokensIn = null;
    protected ?int $lastTokensOut = null;

    public function __construct(
        protected ?string $apiKey = null,
        protected ?string $model = null,
        protected float $temperature = 0.2
    ) {
        $this->apiKey = $apiKey ?? config('services.groq.key');
        $this->model = $model ?? config('services.groq.model', 'llama-3.3-70b-versatile');
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

    /**
     * @inheritDoc
     */
    public function json(string $system, string $user, array $schema): array
    {
        if (empty($this->apiKey)) {
            throw new RuntimeException('Groq API key is not configured.');
        }

        $url = 'https://api.groq.com/openai/v1/chat/completions';

        // Restate schema strictly in system prompt for LLaMA 3.3
        $schemaText = json_encode($schema, JSON_PRETTY_PRINT);
        $fullSystem = $system . "\n\nCRITICAL: You must output ONLY valid, raw JSON adhering strictly to this JSON Schema:\n" . $schemaText;

        $body = [
            'model' => $this->model,
            'temperature' => $this->temperature,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $fullSystem],
                ['role' => 'user', 'content' => $user],
            ],
        ];

        $response = Http::withToken($this->apiKey)
            ->timeout(30)
            ->post($url, $body);

        if (!$response->successful()) {
            throw new RuntimeException("Groq API error ({$response->status()}): {$response->body()}");
        }

        $data = $response->json();
        $this->lastTokensIn = $data['usage']['prompt_tokens'] ?? null;
        $this->lastTokensOut = $data['usage']['completion_tokens'] ?? null;

        $content = $data['choices'][0]['message']['content'] ?? null;
        if (!$content) {
            throw new RuntimeException('Groq returned an empty response content.');
        }

        $decoded = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            throw new RuntimeException('Groq output was not valid JSON: ' . json_last_error_msg());
        }

        return $decoded;
    }
}
