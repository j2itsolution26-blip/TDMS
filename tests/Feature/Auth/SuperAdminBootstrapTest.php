<?php

use App\Models\AuditLog;
use App\Models\User;
use App\Services\SuperAdminBootstrapService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Livewire\Volt\Volt;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    Role::findOrCreate('super_admin', 'web');
    Role::findOrCreate('admin', 'web');
    Role::findOrCreate('director', 'web');
    Role::findOrCreate('coordinator', 'web');
    Role::findOrCreate('secretary', 'web');
    Role::findOrCreate('teacher', 'web');
    Role::findOrCreate('student', 'web');
});

test('test 1: fresh installation with 0 super admins displays create super admin link on login page', function () {
    // Ensure no super admins exist
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    $response = $this->get('/login');

    $response->assertOk()
        ->assertSee('Create Super Admin')
        ->assertSee('Don\'t have a system administrator yet?', escape: false);
});

test('test 2: super admin account can be created during initial bootstrap', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    $component = Volt::test('pages.auth.create-super-admin')
        ->set('name', 'Primary Super Admin')
        ->set('email', 'superadmin@tdms.test')
        ->set('password', 'AdminPassword123!')
        ->set('password_confirmation', 'AdminPassword123!');

    $component->call('createSuperAdmin');

    $component
        ->assertHasNoErrors()
        ->assertRedirect(route('login', absolute: false));

    $user = User::where('email', 'superadmin@tdms.test')->first();

    expect($user)->not->toBeNull()
        ->and($user->hasRole('super_admin'))->toBeTrue()
        ->and($user->email_verified_at)->not->toBeNull();

    // Verify audit log
    $log = AuditLog::where('action', 'INITIAL_SUPER_ADMIN_CREATED')->latest('id')->first();
    expect($log)->not->toBeNull()
        ->and($log->actor)->toBe('SYSTEM_BOOTSTRAP')
        ->and($log->target)->toContain('superadmin@tdms.test');
});

test('test 3: login page hides create super admin link once a super admin exists', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole('super_admin');

    $response = $this->get('/login');

    $response->assertOk()
        ->assertDontSee('Create Super Admin')
        ->assertDontSee('Don\'t have a system administrator yet?');
});

test('test 4: direct GET /create-super-admin redirects to login if super admin already exists', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole('super_admin');

    $response = $this->get('/create-super-admin');

    $response->assertRedirect(route('login'))
        ->assertSessionHas('status', 'Super Admin setup has already been completed. Please log in using the existing administrator account.');
});

test('test 5: direct API/component submission is rejected if super admin already exists', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole('super_admin');

    $bootstrapService = app(SuperAdminBootstrapService::class);
    expect($bootstrapService->isBootstrapAllowed())->toBeFalse();

    expect(fn () => $bootstrapService->createSuperAdmin([
        'name' => 'Intruder Admin',
        'email' => 'intruder@tdms.test',
        'password' => 'SecurePass123!',
    ]))->toThrow(RuntimeException::class, 'Super Admin setup has already been completed. Please log in using the existing administrator account.');
});

test('test 6: validation fails if passwords do not match or email is missing', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    Volt::test('pages.auth.create-super-admin')
        ->set('name', '')
        ->set('email', 'not-an-email')
        ->set('password', 'password123')
        ->set('password_confirmation', 'mismatch123')
        ->call('createSuperAdmin')
        ->assertHasErrors(['name', 'email', 'password']);
});

test('test 12: the server rejects a password missing uppercase, a number, or a symbol even if the frontend checklist were bypassed', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    // 11 characters, but no uppercase and no symbol — the frontend
    // checklist would show 2 of 4 requirements unmet; the server must
    // reject it independently of whatever the client reported.
    Volt::test('pages.auth.create-super-admin')
        ->set('name', 'Attempted Admin')
        ->set('email', 'weakpass@tdms.test')
        ->set('password', 'lowercase123')
        ->set('password_confirmation', 'lowercase123')
        ->call('createSuperAdmin')
        ->assertHasErrors(['password']);

    expect(User::where('email', 'weakpass@tdms.test')->exists())->toBeFalse();
});

test('test 7: super admin role is server-enforced and cannot be spoofed to other roles', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    $bootstrapService = app(SuperAdminBootstrapService::class);
    $user = $bootstrapService->createSuperAdmin([
        'name' => 'Guaranteed Super Admin',
        'email' => 'guaranteed@tdms.test',
        'password' => 'Password123!',
        'role' => 'teacher', // Attempt spoofing
    ]);

    expect($user->hasRole('super_admin'))->toBeTrue()
        ->and($user->hasRole('teacher'))->toBeFalse();
});

test('test 8: super admin can log in and view staff accounts', function () {
    $superAdmin = User::factory()->create([
        'email' => 'super@tdms.test',
        'password' => 'SecretPassword123!',
    ]);
    $superAdmin->assignRole('super_admin');

    $loginComponent = Volt::test('pages.auth.login')
        ->set('form.email', 'super@tdms.test')
        ->set('form.password', 'SecretPassword123!')
        ->call('login');

    $loginComponent
        ->assertHasNoErrors()
        ->assertRedirect(route('dashboard', absolute: false));

    $this->actingAs($superAdmin);
    $this->get('/staff')->assertOk();
});

test('test 9: loading the create-super-admin page issues the bootstrap-allowed check only once (memoized across middleware + mount)', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    $existsQueries = 0;
    DB::listen(function ($query) use (&$existsQueries) {
        if (str_contains($query->sql, 'model_has_roles') && str_contains($query->sql, 'exists')) {
            $existsQueries++;
        }
    });

    $this->get('/create-super-admin')->assertOk();

    expect($existsQueries)->toBe(1);
});

test('test 10: creating the super admin does not issue a separate update for email_verified_at', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    $userUpdateQueries = 0;
    DB::listen(function ($query) use (&$userUpdateQueries) {
        if (str_starts_with(strtolower($query->sql), 'update') && str_contains($query->sql, '"users"')) {
            $userUpdateQueries++;
        }
    });

    $bootstrapService = app(SuperAdminBootstrapService::class);
    $bootstrapService->createSuperAdmin([
        'name' => 'Fast Admin',
        'email' => 'fastadmin@tdms.test',
        'password' => 'FastPassword123!',
    ]);

    expect($userUpdateQueries)->toBe(0);

    $user = User::where('email', 'fastadmin@tdms.test')->first();
    expect($user->email_verified_at)->not->toBeNull();
});

test('test 11: a second, simultaneous creation attempt is rejected atomically instead of creating a duplicate super admin', function () {
    User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->delete();

    // Simulate another request that's already mid-flight, holding the lock.
    $inFlight = Cache::lock('super-admin-bootstrap', 10);
    $inFlight->get();

    $bootstrapService = app(SuperAdminBootstrapService::class);

    expect(fn () => $bootstrapService->createSuperAdmin([
        'name' => 'Racer',
        'email' => 'racer@tdms.test',
        'password' => 'RacerPassword123!',
    ]))->toThrow(RuntimeException::class, 'already being completed by another request');

    $inFlight->release();

    expect(User::where('email', 'racer@tdms.test')->exists())->toBeFalse()
        ->and(User::whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))->count())->toBe(0);
});
