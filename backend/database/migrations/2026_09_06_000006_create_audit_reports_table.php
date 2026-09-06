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
        Schema::create('audit_reports', function (Blueprint $table) {
            $table->id();
            $table->morphs('auditable');
            $table->enum('module', ['grading', 'syllabus', 'exam', 'student_risk']);
            $table->json('anomalies_found');
            $table->text('ai_summary');
            $table->enum('severity', ['low', 'medium', 'high']);
            $table->boolean('from_cache')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_reports');
    }
};
