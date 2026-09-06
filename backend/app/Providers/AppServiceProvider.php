<?php

namespace App\Providers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // One telemetry recorder per request: AiClient writes which path served
        // the work, AttachApiMeta stamps it onto the response envelope.
        $this->app->singleton(\App\Services\Ai\AiTelemetry::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (config('database.default') === 'sqlite') {
            $dbPath = config('database.connections.sqlite.database');
            if ($dbPath === ':memory:' || ($dbPath && file_exists($dbPath))) {
                try {
                    DB::statement('PRAGMA journal_mode=WAL;');
                } catch (\Throwable $e) {
                    // Ignore during early bootstrap if connection not ready
                }
            }
        }
    }
}
