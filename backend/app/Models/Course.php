<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Course extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'title',
        'credits',
        'semester',
        'syllabus_markdown',
    ];

    protected function casts(): array
    {
        return [
            'credits' => 'float',
        ];
    }

    public function exams(): HasMany
    {
        return $this->hasMany(Exam::class);
    }

    public function sectionGrades(): HasMany
    {
        return $this->hasMany(SectionGrade::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    public function auditReports(): MorphMany
    {
        return $this->morphMany(AuditReport::class, 'auditable');
    }
}
