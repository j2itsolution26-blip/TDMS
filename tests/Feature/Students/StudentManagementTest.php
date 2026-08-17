<?php

use App\Models\Curriculum;
use App\Models\Program;
use App\Models\Student;
use App\Models\User;
use Livewire\Volt\Volt;

function programWithCurriculum(): Curriculum
{
    $program = Program::create(['code' => 'BSIT-D', 'name' => 'Diploma in Information Technology']);

    return Curriculum::create([
        'program_id' => $program->id,
        'version_label' => '2026',
        'effective_school_year' => '2026-2027',
    ]);
}

test('secretary can create a student', function () {
    $curriculum = programWithCurriculum();

    $secretary = User::factory()->create();
    $secretary->assignRole('secretary');
    $this->actingAs($secretary);

    Volt::test('students.index')
        ->call('create')
        ->set('first_name', 'Juan')
        ->set('last_name', 'Dela Cruz')
        ->set('program_id', $curriculum->program_id)
        ->set('curriculum_id', $curriculum->id)
        ->call('save')
        ->assertHasNoErrors();

    $student = Student::first();

    expect($student->first_name)->toBe('Juan')
        ->and($student->student_number)->not->toBeNull()
        ->and($student->status)->toBe('active');
});

test('teacher cannot view the students page', function () {
    $teacher = User::factory()->create();
    $teacher->assignRole('teacher');
    $this->actingAs($teacher);

    $this->get('/students')->assertForbidden();
});

test('director cannot view the students page', function () {
    // Per the role/permission matrix (dossier §08), student record
    // management is scoped to the Secretary; Director oversight happens
    // through reporting, not this CRUD screen.
    $director = User::factory()->create();
    $director->assignRole('director');
    $this->actingAs($director);

    $this->get('/students')->assertForbidden();
});
