<?php

namespace App\Http\Middleware;

use App\Services\Ai\AiTelemetry;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stamps every JSON API response with a `meta` block describing which path
 * served it and how long it took.
 *
 * The frontend reads this to drive the Live / Cached / Fixture badge in the top
 * bar, so a judge can see at a glance whether a number came from a live model
 * call, the warm cache, or a deterministic fixture.
 */
class AttachApiMeta
{
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);

        $telemetry = app(AiTelemetry::class);
        $telemetry->reset();

        /** @var Response $response */
        $response = $next($request);

        if (! $response instanceof JsonResponse) {
            return $response;
        }

        $payload = $response->getData(true);

        if (! is_array($payload) || ! array_key_exists('data', $payload)) {
            return $response;
        }

        $meta = $telemetry->meta();
        $meta['latency_ms'] = (int) round((microtime(true) - $startedAt) * 1000);

        $payload['meta'] = array_merge($meta, $payload['meta'] ?? []);
        $response->setData($payload);

        return $response;
    }
}
