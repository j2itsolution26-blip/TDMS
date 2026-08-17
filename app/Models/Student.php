<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;

#[Fillable([
    'user_id', 'student_number', 'first_name', 'middle_name', 'last_name',
    'email', 'phone', 'date_of_birth', 'program_id', 'curriculum_id',
    'year_level', 'status', 'enrollment_date',
])]
class Student extends Model
{
    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'enrollment_date' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function curriculum(): BelongsTo
    {
        return $this->belongsTo(Curriculum::class);
    }

    public function application(): HasOne
    {
        return $this->hasOne(Application::class);
    }

    public function credentials(): HasMany
    {
        return $this->hasMany(StudentCredential::class);
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class);
    }

    /**
     * Whether every active, required credential for this student's
     * program has been verified — the guard Enrollment::transitionTo()
     * enforces before allowing a move to 'enrolled' (dossier §09).
     */
    public function hasAllRequiredCredentialsVerified(): bool
    {
        $requiredIds = CredentialRequirement::query()
            ->where('is_active', true)
            ->where('is_required', true)
            ->where(fn ($q) => $q->whereNull('program_id')->orWhere('program_id', $this->program_id))
            ->pluck('id');

        if ($requiredIds->isEmpty()) {
            return true;
        }

        $verifiedCount = $this->credentials()
            ->whereIn('credential_requirement_id', $requiredIds)
            ->where('status', 'verified')
            ->count();

        return $verifiedCount === $requiredIds->count();
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->middle_name} {$this->last_name}", ' ');
    }

    /**
     * Mints the next student number as {year}-{4-digit sequence}, scoped to
     * students created within the current calendar year. Locks the row scan
     * so two concurrent enrollments can't collide on the same number.
     */
    public static function nextStudentNumber(): string
    {
        return DB::transaction(function () {
            $year = now()->format('Y');

            $count = static::where('student_number', 'like', "{$year}-%")
                ->lockForUpdate()
                ->count();

            return sprintf('%s-%04d', $year, $count + 1);
        });
    }
}
