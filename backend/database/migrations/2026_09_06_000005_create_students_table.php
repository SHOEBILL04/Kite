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
        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->string('student_hash')->unique();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->string('section_name');
            $table->integer('attendance_pct');
            $table->decimal('quiz1', 5, 2);
            $table->decimal('quiz2', 5, 2);
            $table->decimal('quiz3', 5, 2);
            $table->decimal('midterm_pct', 5, 2);
            $table->integer('assignment_delay_count')->default(0);
            $table->enum('risk_level', ['safe', 'moderate', 'critical'])->nullable();
            $table->integer('risk_score')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
