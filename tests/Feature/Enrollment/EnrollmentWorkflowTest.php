<?php

use App\Models\Application;
use App\Models\CredentialRequirement;
use App\Models\Curriculum;
use App\Models\Enrollment;
use App\Models\Program;
use App\Models\Student;
use App\Models\User;
use Livewire\Volt\Volt;

// TestCase seeds DatabaseSeeder for every test, which includes
// CredentialRequirementsSeeder's 4 global requirements — these helpers
// work with that seeded set rather than creating conflicting duplicates.

function enrollmentProgramWithCurriculum(): Curriculum
{
    $program = Program::create(['code' => 'BSIT-D', 'name' => 'Diploma in Information Technology']);

    return Curriculum::create([
        'program_id' => $program->id,
        'version_label' => '2026',
        'effective_school_year' => '2026-2027',
        'is_active' => true,
    ]);
}

function secretaryUser(): User
{
    $secretary = User::factory()->create();
    $secretary->assignRole('secretary');

    return $secretary;
}

function studentApplicant(Curriculum $curriculum): Student
{
    return Student::create([
        'first_name' => 'Ana', 'last_name' => 'Cruz',
        'program_id' => $curriculum->program_id, 'curriculum_id' => $curriculum->id,
        'year_level' => 1, 'status' => 'applicant', 'student_number' => Student::nextStudentNumber(),
    ]);
}

test('secretary can submit and approve an application, which creates a student with a missing credential checklist', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $globalRequirementCount = CredentialRequirement::where('is_active', true)->count();

    $this->actingAs(secretaryUser());

    Volt::test('applications.index')
        ->call('create')
        ->set('first_name', 'Maria')
        ->set('last_name', 'Santos')
        ->set('program_id', $curriculum->program_id)
        ->call('save')
        ->assertHasNoErrors();

    $application = Application::first();
    expect($application->status)->toBe('submitted');

    Volt::test('applications.index')
        ->call('approve', $application->id);

    $application->refresh();
    $student = $application->student;

    expect($application->status)->toBe('approved')
        ->and($student)->not->toBeNull()
        ->and($student->status)->toBe('applicant')
        ->and($student->credentials()->count())->toBe($globalRequirementCount)
        ->and($student->credentials()->where('status', 'missing')->count())->toBe($globalRequirementCount);
});

test('secretary can return an application with a reason', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $application = Application::create([
        'first_name' => 'Juan', 'last_name' => 'Reyes',
        'program_id' => $curriculum->program_id, 'status' => 'submitted',
    ]);

    $this->actingAs(secretaryUser());

    Volt::test('applications.index')
        ->call('startReturn', $application->id)
        ->set('returnReason', 'Missing birth certificate scan')
        ->call('confirmReturn')
        ->assertHasNoErrors();

    $application->refresh();
    expect($application->status)->toBe('returned')
        ->and($application->notes)->toBe('Missing birth certificate scan');
});

test('enrollment cannot be confirmed while required credentials are unverified', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $student = studentApplicant($curriculum);

    // No StudentCredential rows created at all — every seeded
    // requirement counts as unverified.
    $enrollment = Enrollment::create([
        'student_id' => $student->id, 'curriculum_id' => $curriculum->id,
        'school_year' => '2026-2027', 'semester' => 1, 'year_level' => 1, 'status' => 'pending',
    ]);

    $this->actingAs(secretaryUser());

    expect(fn () => $enrollment->transitionTo('enrolled'))->toThrow(RuntimeException::class);

    $enrollment->refresh();
    expect($enrollment->status)->toBe('pending');
});

test('secretary verifying all required credentials allows enrollment confirmation, which activates the student', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $student = studentApplicant($curriculum);

    $credentials = CredentialRequirement::where('is_active', true)->get()->map(
        fn ($requirement) => $student->credentials()->create([
            'credential_requirement_id' => $requirement->id, 'status' => 'submitted', 'submitted_at' => now(),
        ])
    );

    $enrollment = Enrollment::create([
        'student_id' => $student->id, 'curriculum_id' => $curriculum->id,
        'school_year' => '2026-2027', 'semester' => 1, 'year_level' => 1, 'status' => 'pending',
    ]);

    $secretary = secretaryUser();
    $this->actingAs($secretary);

    foreach ($credentials as $credential) {
        Volt::test('enrollment.show', ['student' => $student])
            ->call('verify', $credential->id);
    }

    expect($student->hasAllRequiredCredentialsVerified())->toBeTrue();

    Volt::test('enrollment.show', ['student' => $student])
        ->call('confirmEnrollment', $enrollment->id);

    $enrollment->refresh();
    $student->refresh();

    expect($enrollment->status)->toBe('enrolled')
        ->and($enrollment->statusHistory()->count())->toBe(1)
        ->and($enrollment->statusHistory()->first()->from_status)->toBe('pending')
        ->and($student->status)->toBe('active');
});

test('rejecting a credential requires a reason and records it', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $student = studentApplicant($curriculum);
    $requirement = CredentialRequirement::first();
    $credential = $student->credentials()->create([
        'credential_requirement_id' => $requirement->id, 'status' => 'submitted', 'submitted_at' => now(),
    ]);

    $this->actingAs(secretaryUser());

    Volt::test('enrollment.show', ['student' => $student])
        ->call('startReject', $credential->id)
        ->call('confirmReject')
        ->assertHasErrors('rejectionReason');

    Volt::test('enrollment.show', ['student' => $student])
        ->call('startReject', $credential->id)
        ->set('rejectionReason', 'Photo is blurry')
        ->call('confirmReject')
        ->assertHasNoErrors();

    $credential->refresh();
    expect($credential->status)->toBe('rejected')
        ->and($credential->rejection_reason)->toBe('Photo is blurry');
});

test('teacher cannot view applications', function () {
    $teacher = User::factory()->create();
    $teacher->assignRole('teacher');
    $this->actingAs($teacher);

    $this->get('/applications')->assertForbidden();
});

test('teacher cannot view or verify a student credential', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $student = studentApplicant($curriculum);

    $teacher = User::factory()->create();
    $teacher->assignRole('teacher');
    $this->actingAs($teacher);

    // The StudentPolicy blocks a teacher from even loading this page,
    // let alone verifying a credential on it.
    Volt::test('enrollment.show', ['student' => $student])
        ->assertForbidden();
});

test('a student cannot be enrolled twice for the same school year and semester', function () {
    $curriculum = enrollmentProgramWithCurriculum();
    $student = Student::create([
        'first_name' => 'Ana', 'last_name' => 'Cruz',
        'program_id' => $curriculum->program_id, 'curriculum_id' => $curriculum->id,
        'year_level' => 1, 'status' => 'active', 'student_number' => Student::nextStudentNumber(),
    ]);

    Enrollment::create([
        'student_id' => $student->id, 'curriculum_id' => $curriculum->id,
        'school_year' => '2026-2027', 'semester' => 1, 'year_level' => 1, 'status' => 'enrolled',
    ]);

    expect(fn () => Enrollment::create([
        'student_id' => $student->id, 'curriculum_id' => $curriculum->id,
        'school_year' => '2026-2027', 'semester' => 1, 'year_level' => 1, 'status' => 'pending',
    ]))->toThrow(Illuminate\Database\QueryException::class);
});
