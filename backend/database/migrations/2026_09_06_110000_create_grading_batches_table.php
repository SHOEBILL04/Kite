<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('grading_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->string('semester');
            $table->string('assessment_name');            // e.g. "Mid Term"
            $table->unsignedInteger('max_marks');
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();

            // collecting -> ready (>=2 sections in) -> audited
            $table->enum('status', ['collecting', 'ready', 'audited'])->default('collecting');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grading_batches');
    }
};
