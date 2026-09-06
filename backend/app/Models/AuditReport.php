<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AuditReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'auditable_type',
        'auditable_id',
        'module',
        'anomalies_found',
        'ai_summary',
        'severity',
        'from_cache',
    ];

    protected function casts(): array
    {
        return [
            'anomalies_found' => 'array',
            'from_cache' => 'boolean',
        ];
    }

    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }
}
