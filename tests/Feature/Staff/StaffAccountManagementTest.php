<?php

use App\Models\User;
use Livewire\Volt\Volt;

test('director can create a staff account', function () {
    $director = User::factory()->create();
    $director->assignRole('director');
    $this->actingAs($director);

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'Maria Santos')
        ->set('email', 'maria.santos@tdms.test')
        ->set('role', 'coordinator')
        ->call('save')
        ->assertHasNoErrors()
        ->assertSet('generatedFor', 'maria.santos@tdms.test');

    $user = User::where('email', 'maria.santos@tdms.test')->first();

    expect($user)->not->toBeNull()
        ->and($user->hasRole('coordinator'))->toBeTrue()
        ->and($user->email_verified_at)->not->toBeNull();
});

test('coordinator cannot access staff accounts page', function () {
    $coordinator = User::factory()->create();
    $coordinator->assignRole('coordinator');
    $this->actingAs($coordinator);

    $this->get('/staff')->assertForbidden();
});
