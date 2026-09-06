<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('grading_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('grading_batch_id')->constrained('grading_batches')->cascadeOnDelete();
            $table->string('section_name');
            $table->foreignId('faculty_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('student_count');
            $table->timestamp('uploaded_at');
            $table->string('file_name');
            $table->timestamps();

            // One submission per section per batch: a re-upload replaces rather
            // than accumulates.
            $table->unique(['grading_batch_id', 'section_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grading_submissions');
    }
};
