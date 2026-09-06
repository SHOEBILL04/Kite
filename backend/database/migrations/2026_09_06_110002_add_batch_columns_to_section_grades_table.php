<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('section_grades', function (Blueprint $table) {
            // Nullable so pre-existing rows stay valid; the seeder backfills
            // them into one batch.
            $table->foreignId('grading_batch_id')->nullable()->after('course_id')
                ->constrained('grading_batches')->nullOnDelete();

            $table->foreignId('grading_submission_id')->nullable()->after('grading_batch_id')
                ->constrained('grading_submissions')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('section_grades', function (Blueprint $table) {
            $table->dropConstrainedForeignId('grading_submission_id');
            $table->dropConstrainedForeignId('grading_batch_id');
        });
    }
};
