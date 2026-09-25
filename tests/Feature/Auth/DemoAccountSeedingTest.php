<?php

use App\Models\User;
use Database\Seeders\DevSeeder;
use Livewire\Volt\Volt;

/*
|--------------------------------------------------------------------------
| DevSeeder
|--------------------------------------------------------------------------
|
| The old seeder used User::factory()->create(), so a second run hit the
| unique index on users.email and aborted — which meant a demo account
| with a bad password could never be repaired by re-seeding.
|
*/

test('the demo seeder is idempotent', function () {
    $this->seed(DevSeeder::class);
    $first = User::where('email', 'like', '%@tdms.test')->count();

    $this->seed(DevSeeder::class);

    expect(User::where('email', 'like', '%@tdms.test')->count())->toBe($first)
        ->and($first)->toBe(7);
});

test('every seeded demo account is usable', function () {
    $this->seed(DevSeeder::class);

    $accounts = User::where('email', 'like', '%@tdms.test')->get();

    foreach ($accounts as $account) {
        expect($account->username)->not->toBeNull()
            ->and($account->is_active)->toBeTrue()
            ->and($account->email_verified_at)->not->toBeNull()
            ->and($account->getRoleNames())->toHaveCount(1);
    }
});

test('demo accounts sign in by username and by email', function () {
    $this->seed(DevSeeder::class);

    $password = config('auth.demo_password');

    foreach (['superadmin', 'admin', 'director', 'coordinator', 'secretary', 'teacher', 'student'] as $username) {
        foreach ([$username, "{$username}@tdms.test"] as $identifier) {
            Volt::test('pages.auth.login')
                ->set('form.email', $identifier)
                ->set('form.password', $password)
                ->call('login')
                ->assertHasNoErrors();

            expect(auth()->user()->username)->toBe($username);

            auth()->logout();
        }
    }
});

test('re-seeding repairs a demo account whose password was changed', function () {
    $this->seed(DevSeeder::class);

    User::where('username', 'director')->first()
        ->forceFill(['password' => 'something-else-entirely'])->save();

    $this->seed(DevSeeder::class);

    Volt::test('pages.auth.login')
        ->set('form.email', 'director')
        ->set('form.password', config('auth.demo_password'))
        ->call('login')
        ->assertHasNoErrors();

    $this->assertAuthenticated();
});

test('the seeded password is stored as a bcrypt hash, not plain text', function () {
    $this->seed(DevSeeder::class);

    $stored = User::where('username', 'director')->value('password');

    expect($stored)->not->toBe(config('auth.demo_password'))
        ->and(password_get_info($stored)['algoName'])->toBe('bcrypt')
        ->and(Illuminate\Support\Facades\Hash::check(config('auth.demo_password'), $stored))->toBeTrue();
});
