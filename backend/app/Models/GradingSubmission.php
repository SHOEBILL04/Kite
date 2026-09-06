<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One faculty member's upload of one section's marks into a batch.
 */
class GradingSubmission extends Model
{
    use HasFactory;

    protected $fillable = [
        'grading_batch_id',
        'section_name',
        'faculty_id',
        'student_count',
        'uploaded_at',
        'file_name',
    ];

    protected function casts(): array
    {
        return [
            'student_count' => 'integer',
            'uploaded_at' => 'datetime',
        ];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(GradingBatch::class, 'grading_batch_id');
    }

    public function faculty(): BelongsTo
    {
        return $this->belongsTo(User::class, 'faculty_id');
    }

    public function sectionGrades(): HasMany
    {
        return $this->hasMany(SectionGrade::class);
    }
}
