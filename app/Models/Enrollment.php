<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

#[Fillable(['student_id', 'curriculum_id', 'school_year', 'semester', 'year_level', 'status'])]
class Enrollment extends Model
{
    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function curriculum(): BelongsTo
    {
        return $this->belongsTo(Curriculum::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(EnrollmentStatusHistory::class)->latest('created_at');
    }

    /**
     * Every transition is a new history row (dossier §09/§21) — the
     * enrollment's status is never overwritten silently. The credential
     * guard lives here, not just in the UI, so there is no path to
     * 'enrolled' that skips it (dossier §09 guard rule + §16 "never rely
     * solely on frontend permission checks").
     */
    public function transitionTo(string $status, ?string $reason = null): void
    {
        if ($status === 'enrolled' && ! $this->hasAllRequiredCredentialsVerified()) {
            throw new RuntimeException('This student still has unverified or missing required credentials.');
        }

        DB::transaction(function () use ($status, $reason) {
            $from = $this->status;

            $this->update([
                'status' => $status,
                'approved_by' => $status === 'enrolled' ? Auth::id() : $this->approved_by,
                'approved_at' => $status === 'enrolled' ? now() : $this->approved_at,
            ]);

            $this->statusHistory()->create([
                'from_status' => $from,
                'to_status' => $status,
                'changed_by' => Auth::id(),
                'reason' => $reason,
            ]);

            if ($status === 'enrolled') {
                $this->student->update(['status' => 'active']);
            }
        });
    }

    /**
     * Enrollment is only allowed once every required credential for the
     * student's program has been verified (dossier §09 guard rule).
     */
    public function hasAllRequiredCredentialsVerified(): bool
    {
        return $this->student->hasAllRequiredCredentialsVerified();
    }
}
