<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

#[Fillable([
    'first_name', 'middle_name', 'last_name', 'email', 'phone',
    'date_of_birth', 'program_id', 'status', 'notes',
    'student_id', 'reviewed_by', 'reviewed_at',
])]
class Application extends Model
{
    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'reviewed_at' => 'datetime',
        ];
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->middle_name} {$this->last_name}", ' ');
    }

    /**
     * Approves the application and creates the Student record it becomes,
     * plus a "missing" credential checklist row for every requirement the
     * program has — the pipeline the dossier describes in §09/§10. The
     * student starts in 'applicant' status; Official Enrollment is a
     * separate, later step gated on those credentials being verified.
     */
    public function approve(): Student
    {
        return DB::transaction(function () {
            $curriculum = Curriculum::query()
                ->where('program_id', $this->program_id)
                ->where('is_active', true)
                ->orderByDesc('effective_school_year')
                ->first();

            if (! $curriculum) {
                throw new RuntimeException('This program has no active curriculum to enroll into.');
            }

            $student = Student::create([
                'first_name' => $this->first_name,
                'middle_name' => $this->middle_name,
                'last_name' => $this->last_name,
                'email' => $this->email,
                'phone' => $this->phone,
                'date_of_birth' => $this->date_of_birth,
                'program_id' => $this->program_id,
                'curriculum_id' => $curriculum->id,
                'year_level' => 1,
                'status' => 'applicant',
                'student_number' => Student::nextStudentNumber(),
            ]);

            $requirementIds = CredentialRequirement::query()
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('program_id')->orWhere('program_id', $this->program_id))
                ->pluck('id');

            foreach ($requirementIds as $requirementId) {
                StudentCredential::create([
                    'student_id' => $student->id,
                    'credential_requirement_id' => $requirementId,
                    'status' => 'missing',
                ]);
            }

            $this->update([
                'status' => 'approved',
                'student_id' => $student->id,
                'reviewed_by' => Auth::id(),
                'reviewed_at' => now(),
            ]);

            return $student;
        });
    }

    public function returnToApplicant(string $reason): void
    {
        $this->update([
            'status' => 'returned',
            'notes' => $reason,
            'reviewed_by' => Auth::id(),
            'reviewed_at' => now(),
        ]);
    }
}
