<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

#[Fillable([
    'student_id', 'credential_requirement_id', 'file_path', 'submitted_by',
    'submitted_at', 'status', 'verified_by', 'verified_at', 'remarks',
    'rejection_reason', 'version',
])]
class StudentCredential extends Model
{
    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function requirement(): BelongsTo
    {
        return $this->belongsTo(CredentialRequirement::class, 'credential_requirement_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    /**
     * A verified document is locked from the normal edit path (dossier
     * §10) — a resubmission must go through submitNewVersion() instead,
     * which bumps the version rather than overwriting the record.
     */
    public function isLocked(): bool
    {
        return $this->status === 'verified';
    }

    public function submitNewVersion(string $filePath): void
    {
        $this->update([
            'file_path' => $filePath,
            'submitted_by' => Auth::id(),
            'submitted_at' => now(),
            'status' => 'submitted',
            'version' => $this->version + 1,
            'verified_by' => null,
            'verified_at' => null,
            'rejection_reason' => null,
        ]);
    }

    public function verify(?string $remarks = null): void
    {
        $this->update([
            'status' => 'verified',
            'verified_by' => Auth::id(),
            'verified_at' => now(),
            'remarks' => $remarks,
            'rejection_reason' => null,
        ]);
    }

    public function reject(string $reason): void
    {
        $this->update([
            'status' => 'rejected',
            'verified_by' => Auth::id(),
            'verified_at' => now(),
            'rejection_reason' => $reason,
        ]);
    }
}
