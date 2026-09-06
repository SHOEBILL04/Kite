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
        Schema::create('exam_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->cascadeOnDelete();
            $table->string('q_number');
            $table->text('text');
            $table->decimal('marks', 5, 1);
            $table->enum('assigned_bloom_level', ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
            $table->string('assigned_clo');
            $table->boolean('is_past_paper')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exam_questions');
    }
};
