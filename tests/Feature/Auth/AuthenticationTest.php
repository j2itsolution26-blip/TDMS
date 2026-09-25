<?php

use App\Models\User;
use Livewire\Volt\Volt;

test('login screen can be rendered', function () {
    $response = $this->get('/login');

    $response
        ->assertOk()
        ->assertSeeVolt('pages.auth.login');
});

test('users can authenticate using the login screen', function () {
    $user = User::factory()->create();

    $component = Volt::test('pages.auth.login')
        ->set('form.email', $user->email)
        ->set('form.password', 'password');

    $component->call('login');

    $component
        ->assertHasNoErrors()
        ->assertRedirect(route('dashboard', absolute: false));

    $this->assertAuthenticated();
});

test('users can not authenticate with invalid password', function () {
    $user = User::factory()->create();

    $component = Volt::test('pages.auth.login')
        ->set('form.email', $user->email)
        ->set('form.password', 'wrong-password');

    $component->call('login');

    $component
        ->assertHasErrors()
        ->assertNoRedirect();

    $this->assertGuest();
});

test('navigation menu can be rendered', function () {
    $user = User::factory()->create();

    $this->actingAs($user);

    $response = $this->get('/dashboard');

    $response
        ->assertOk()
        ->assertSeeVolt('layout.navigation');
});

test('users can logout', function () {
    $user = User::factory()->create();

    $this->actingAs($user);

    $component = Volt::test('layout.navigation');

    $component->call('logout');

    $component
        ->assertHasNoErrors()
        ->assertRedirect('/');

    $this->assertGuest();
});

/*
|--------------------------------------------------------------------------
| "Username or Email" identifier
|--------------------------------------------------------------------------
|
| The login field has always been labelled "Username or Email" but only
| ever resolved an email, so no username could sign in. These cover both
| halves of the label plus the normalisation rules.
|
*/

test('users can authenticate with their username', function () {
    $user = User::factory()->create(['username' => 'director']);

    $component = Volt::test('pages.auth.login')
        ->set('form.email', 'director')
        ->set('form.password', 'password');

    $component->call('login');

    $component
        ->assertHasNoErrors()
        ->assertRedirect(route('dashboard', absolute: false));

    $this->assertAuthenticatedAs($user);
});

test('username and email resolve to the same account', function () {
    $user = User::factory()->create([
        'username' => 'coordinator',
        'email' => 'coordinator@tdms.test',
    ]);

    foreach (['coordinator', 'coordinator@tdms.test'] as $identifier) {
        Volt::test('pages.auth.login')
            ->set('form.email', $identifier)
            ->set('form.password', 'password')
            ->call('login')
            ->assertHasNoErrors();

        $this->assertAuthenticatedAs($user);

        auth()->logout();
    }
});

test('identifiers are trimmed and matched case insensitively', function () {
    $user = User::factory()->create([
        'username' => 'secretary',
        'email' => 'secretary@tdms.test',
    ]);

    foreach (['  Secretary  ', ' SECRETARY@TDMS.TEST '] as $identifier) {
        Volt::test('pages.auth.login')
            ->set('form.email', $identifier)
            ->set('form.password', 'password')
            ->call('login')
            ->assertHasNoErrors();

        $this->assertAuthenticatedAs($user);

        auth()->logout();
    }
});

test('an unknown username is rejected without revealing that it is unknown', function () {
    Volt::test('pages.auth.login')
        ->set('form.email', 'nobody')
        ->set('form.password', 'password')
        ->call('login')
        ->assertHasErrors('form.email')
        ->assertNoRedirect();

    $this->assertGuest();
});

test('a username login still fails on the wrong password', function () {
    User::factory()->create(['username' => 'teacher']);

    Volt::test('pages.auth.login')
        ->set('form.email', 'teacher')
        ->set('form.password', 'wrong-password')
        ->call('login')
        ->assertHasErrors('form.email');

    $this->assertGuest();
});

test('the identifier and the password are both required', function () {
    Volt::test('pages.auth.login')
        ->set('form.email', '')
        ->set('form.password', '')
        ->call('login')
        ->assertHasErrors(['form.email', 'form.password']);

    $this->assertGuest();
});

test('a deactivated account cannot sign in with its username', function () {
    $user = User::factory()->create(['username' => 'suspended']);
    $user->forceFill(['is_active' => false])->save();

    Volt::test('pages.auth.login')
        ->set('form.email', 'suspended')
        ->set('form.password', 'password')
        ->call('login')
        ->assertHasErrors('form.email');

    $this->assertGuest();
});

test('the dashboard is not reachable while logged out', function () {
    $this->get('/dashboard')->assertRedirect(route('login'));
});
