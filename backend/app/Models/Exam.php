<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Exam extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'semester',
        'exam_type',
        'status',
        'total_marks',
    ];

    protected function casts(): array
    {
        return [
            'total_marks' => 'integer',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(ExamQuestion::class);
    }

    public function auditReports(): MorphMany
    {
        return $this->morphMany(AuditReport::class, 'auditable');
    }
}
