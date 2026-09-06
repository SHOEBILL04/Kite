<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SectionGrade extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'grading_batch_id',
        'grading_submission_id',
        'section_name',
        'faculty_id',
        'student_hash',
        'mid_marks',
        'quiz_avg',
        'attendance_pct',
    ];

    protected function casts(): array
    {
        return [
            'mid_marks' => 'integer',
            'quiz_avg' => 'integer',
            'attendance_pct' => 'integer',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function faculty(): BelongsTo
    {
        return $this->belongsTo(User::class, 'faculty_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(GradingBatch::class, 'grading_batch_id');
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(GradingSubmission::class, 'grading_submission_id');
    }
}
