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
}
