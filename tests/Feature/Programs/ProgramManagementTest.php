<?php

use App\Models\Program;
use App\Models\User;
use Livewire\Volt\Volt;

function makeUserWithRole(string $role): User
{
    $user = User::factory()->create();
    $user->assignRole($role);

    return $user;
}

test('director can create a program', function () {
    $this->actingAs(makeUserWithRole('director'));

    Volt::test('programs.index')
        ->call('create')
        ->set('code', 'BSIT-D')
        ->set('name', 'Diploma in Information Technology')
        ->call('save')
        ->assertHasNoErrors();

    $this->assertDatabaseHas('programs', ['code' => 'BSIT-D']);
});

test('secretary cannot create a program', function () {
    $this->actingAs(makeUserWithRole('secretary'));

    Volt::test('programs.index')
        ->set('code', 'BSIT-D')
        ->set('name', 'Diploma in Information Technology')
        ->call('save')
        ->assertForbidden();

    $this->assertDatabaseMissing('programs', ['code' => 'BSIT-D']);
});

test('secretary can still view the programs list', function () {
    $this->actingAs(makeUserWithRole('secretary'));

    $this->get('/programs')->assertOk();
});

test('student cannot view the programs page', function () {
    $this->actingAs(makeUserWithRole('student'));

    $this->get('/programs')->assertForbidden();
});

test('program code must be unique', function () {
    Program::create(['code' => 'BSIT-D', 'name' => 'Existing Program']);

    $this->actingAs(makeUserWithRole('director'));

    Volt::test('programs.index')
        ->call('create')
        ->set('code', 'BSIT-D')
        ->set('name', 'Duplicate Program')
        ->call('save')
        ->assertHasErrors(['code']);
});
