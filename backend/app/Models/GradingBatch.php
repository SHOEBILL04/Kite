<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A shared unit that two or more teachers upload marks into.
 *
 * A parity audit runs on a batch, not a course: comparing sections only makes
 * sense when they sat the same assessment out of the same total.
 */
class GradingBatch extends Model
{
    use HasFactory;

    public const STATUS_COLLECTING = 'collecting';
    public const STATUS_READY = 'ready';
    public const STATUS_AUDITED = 'audited';

    /** A batch needs at least this many sections before parity means anything. */
    public const MIN_SECTIONS_FOR_AUDIT = 2;

    protected $fillable = [
        'course_id',
        'semester',
        'assessment_name',
        'max_marks',
        'created_by',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'max_marks' => 'integer',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(GradingSubmission::class);
    }

    public function sectionGrades(): HasMany
    {
        return $this->hasMany(SectionGrade::class);
    }

    /**
     * Recompute status from the submissions actually present.
     *
     * An audited batch keeps that status while it still has enough sections --
     * re-uploading into it should not silently discard the fact that it was
     * audited. But if it drops below the threshold the previous audit no longer
     * describes the data, so the batch goes back to collecting rather than
     * advertising an audit that can no longer be reproduced.
     */
    public function refreshStatus(): void
    {
        $count = $this->submissions()->count();
        $auditable = $count >= self::MIN_SECTIONS_FOR_AUDIT;

        if ($this->status === self::STATUS_AUDITED && $auditable) {
            return;
        }

        $next = $auditable ? self::STATUS_READY : self::STATUS_COLLECTING;

        if ($next !== $this->status) {
            $this->update(['status' => $next]);
        }
    }
}
