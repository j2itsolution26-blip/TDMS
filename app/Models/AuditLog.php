<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'action',
    'actor',
    'target',
    'ip_address',
    'user_agent',
    'details',
])]
class AuditLog extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'details' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Record an audit event securely without sensitive credentials.
     */
    public static function record(
        string $action,
        string $actor,
        string $target,
        array $details = [],
        ?string $ip = null,
        ?string $userAgent = null
    ): self {
        return static::create([
            'action' => $action,
            'actor' => $actor,
            'target' => $target,
            'ip_address' => $ip ?? request()?->ip(),
            'user_agent' => $userAgent ?? request()?->userAgent(),
            'details' => $details ?: null,
        ]);
    }
}
