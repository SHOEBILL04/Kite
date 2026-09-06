<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExamQuestion extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'q_number',
        'text',
        'marks',
        'assigned_bloom_level',
        'assigned_clo',
        'is_past_paper',
    ];

    protected function casts(): array
    {
        return [
            'marks' => 'float',
            'is_past_paper' => 'boolean',
        ];
    }

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }
}
