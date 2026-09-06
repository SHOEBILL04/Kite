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
        Schema::create('section_grades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->string('section_name');
            $table->foreignId('faculty_id')->constrained('users')->cascadeOnDelete();
            $table->string('student_hash');
            $table->integer('mid_marks');
            $table->integer('quiz_avg');
            $table->integer('attendance_pct');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('section_grades');
    }
};
