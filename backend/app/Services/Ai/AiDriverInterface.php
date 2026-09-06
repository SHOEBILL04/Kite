<?php

namespace App\Services\Ai;

interface AiDriverInterface
{
    /**
     * Generate structured JSON output strictly conforming to the given schema.
     *
     * @param string $system System instructions
     * @param string $user User prompt/payload
     * @param array $schema JSON schema definition
     * @return array Decoded response matching schema
     * @throws \Throwable If network fails or rate limited
     */
    public function json(string $system, string $user, array $schema, ?string $model = null): array;

    /**
     * Get prompt tokens consumed in the last call.
     */
    public function getLastTokensIn(): ?int;

    /**
     * Get completion tokens generated in the last call.
     */
    public function getLastTokensOut(): ?int;

    /**
     * Driver name identifier (currently always 'groq').
     */
    public function getDriverName(): string;
}
