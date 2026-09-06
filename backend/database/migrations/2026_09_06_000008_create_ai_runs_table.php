<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('ai_runs', function (Blueprint $table) {
            $table->id();
            $table->string('task');
            $table->string('driver');
            $table->integer('tokens_in')->nullable();
            $table->integer('tokens_out')->nullable();
            $table->integer('latency_ms');
            $table->boolean('ok')->default(true);
            $table->boolean('from_cache')->default(false);
            $table->text('error')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_runs');
    }
};
