<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Student extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_hash',
        'course_id',
        'section_name',
        'attendance_pct',
        'quiz1',
        'quiz2',
        'quiz3',
        'midterm_pct',
        'assignment_delay_count',
        'risk_level',
        'risk_score',
        'ml_probability',
    ];

    protected function casts(): array
    {
        return [
            'attendance_pct' => 'integer',
            'quiz1' => 'float',
            'quiz2' => 'float',
            'quiz3' => 'float',
            'midterm_pct' => 'float',
            'assignment_delay_count' => 'integer',
            'risk_score' => 'integer',
            'ml_probability' => 'float',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function auditReports(): MorphMany
    {
        return $this->morphMany(AuditReport::class, 'auditable');
    }
}
