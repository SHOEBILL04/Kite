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
        //
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
