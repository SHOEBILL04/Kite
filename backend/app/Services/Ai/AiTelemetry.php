<?php

namespace App\Services\Ai;

/**
 * Records which path served the AI work during the current request.
 *
 * Registered as a singleton, so it lives exactly as long as one HTTP request.
 * AiClient writes to it; the AttachApiMeta middleware reads it and stamps the
 * answer onto the response envelope. That is what lets the UI show a judge
 * whether they are looking at a live model call, a cache hit, or a fixture.
 */
class AiTelemetry
{
    /** Highest-fidelity path wins when a request makes several AI calls. */
    private const RANK = [
        'fixture' => 0,
        'fixture_fallback' => 0,
        'cache' => 1,
        'groq' => 2,
        'gemini' => 2,
    ];

    private ?string $driver = null;

    private bool $fromCache = false;

    private int $calls = 0;

    /**
     * Clear state at the start of a request. Under php-fpm the singleton dies
     * with the request anyway, but under a long-lived worker (Octane, queue)
     * it would otherwise accumulate across requests.
     */
    public function reset(): void
    {
        $this->driver = null;
        $this->fromCache = false;
        $this->calls = 0;
    }

    public function record(string $driver, bool $fromCache): void
    {
        $this->calls++;

        if ($fromCache) {
            $this->fromCache = true;
        }

        // Report the strongest path that actually ran: a request that hit a
        // live model and a fixture is more honestly "live" than "fixture".
        $incoming = self::RANK[$driver] ?? 0;
        $current = self::RANK[$this->driver] ?? -1;

        if ($this->driver === null || $incoming > $current) {
            $this->driver = $driver;
        }
    }

    /**
     * Envelope metadata. `source` is the three-state the UI badge renders.
     *
     * @return array{driver:string, from_cache:bool, source:string, ai_calls:int}
     */
    public function meta(): array
    {
        $driver = $this->driver ?? 'none';

        $source = match (true) {
            $this->calls === 0 => 'deterministic',
            $this->fromCache => 'cached',
            in_array($driver, ['fixture', 'fixture_fallback'], true) => 'fixture',
            default => 'live',
        };

        return [
            'driver' => $driver,
            'from_cache' => $this->fromCache,
            'source' => $source,
            'ai_calls' => $this->calls,
        ];
    }
}
