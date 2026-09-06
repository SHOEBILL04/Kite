<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DumpAiFixturesCommand extends Command
{
    protected $signature = 'ai:fixtures:dump';
    protected $description = 'Dump cached AI audit responses out to storage/app/fixtures/*.json';

    public function handle(): int
    {
        $this->info('Dumping cached AI responses to storage/app/fixtures/*.json…');

        $dir = storage_path('app/fixtures');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $cachedItems = DB::table('ai_cache')->get();

        if ($cachedItems->isEmpty()) {
            $this->warn('No entries found in ai_cache. Run `php artisan ai:warm` first to populate cache.');
            return Command::SUCCESS;
        }

        $count = 0;
        foreach ($cachedItems as $item) {
            $filePath = "{$dir}/{$item->task}.json";
            $decoded = json_decode($item->response_json, true);
            $prettyJson = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

            file_put_contents($filePath, $prettyJson);
            $this->line("  Saved: <comment>{$filePath}</comment>");
            $count++;
        }

        $this->info("Successfully dumped {$count} fixture file(s).");
        return Command::SUCCESS;
    }
}
