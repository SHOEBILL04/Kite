<?php

namespace Tests\Feature;

use App\Services\Ai\AiClient;
use App\Services\Ai\GeminiDriver;
use App\Services\Ai\GroqDriver;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AiInferenceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.ai.mode' => 'fixture']);
    }

    public function test_fixture_mode_serves_task_without_api_keys(): void
    {
        $client = app(AiClient::class);

        $result = $client->run(
            'grading-drift',
            'You are an academic auditor.',
            'Audit CSE 2101.',
            [
                'type' => 'object',
                'required' => ['drift_detected', 'severity', 'section_stats'],
            ]
        );

        $this->assertIsArray($result);
        $this->assertTrue($result['drift_detected']);
        $this->assertEquals('high', $result['severity']);
        $this->assertCount(2, $result['section_stats']);

        // Check ai_runs log entry
        $this->assertDatabaseHas('ai_runs', [
            'task' => 'grading-drift',
            'ok' => 1,
        ]);
    }

    public function test_subsequent_call_hits_persistent_sqlite_cache(): void
    {
        $client = app(AiClient::class);

        $system = 'System auditor prompt';
        $user = 'User audit request';
        $schema = ['type' => 'object', 'required' => ['status']];

        // First call populates cache
        $first = $client->run('grading-drift', $system, $user, $schema);

        // Second call should return from cache
        $second = $client->run('grading-drift', $system, $user, $schema);

        $this->assertEquals($first, $second);

        // Verify that a run with from_cache = 1 was recorded
        $this->assertDatabaseHas('ai_runs', [
            'task' => 'grading-drift',
            'from_cache' => 1,
            'ok' => 1,
        ]);
    }

    public function test_ai_warm_and_dump_artisan_commands_execute(): void
    {
        $this->artisan('ai:warm')
            ->assertSuccessful();

        $this->artisan('ai:fixtures:dump')
            ->assertSuccessful();

        $this->assertDatabaseHas('ai_cache', [
            'task' => 'grading-drift',
        ]);
        $this->assertDatabaseHas('ai_cache', [
            'task' => 'exam-moderation',
        ]);
    }
}
