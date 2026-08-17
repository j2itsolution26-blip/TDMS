<?php

use App\Models\AuditLog;
use App\Models\User;
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

function superAdminUser(): User
{
    $user = User::factory()->create();
    $user->assignRole('super_admin');

    return $user;
}

function adminUser(): User
{
    $user = User::factory()->create();
    $user->assignRole('admin');

    return $user;
}

test('admin can create teacher, secretary, coordinator, and director accounts', function () {
    $this->actingAs(adminUser());

    foreach (['teacher', 'secretary', 'coordinator', 'director'] as $role) {
        Volt::test('staff.index')
            ->call('create')
            ->set('name', "New {$role}")
            ->set('email', "{$role}@tdms.test")
            ->set('role', $role)
            ->call('save')
            ->assertHasNoErrors();

        expect(User::where('email', "{$role}@tdms.test")->first()?->hasRole($role))->toBeTrue();
    }
});

test('admin cannot create a super_admin or another admin account', function () {
    $this->actingAs(adminUser());

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'Sneaky')
        ->set('email', 'sneaky@tdms.test')
        ->set('role', 'super_admin')
        ->call('save')
        ->assertHasErrors('role');

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'Peer Admin')
        ->set('email', 'peeradmin@tdms.test')
        ->set('role', 'admin')
        ->call('save')
        ->assertHasErrors('role');

    expect(User::where('email', 'sneaky@tdms.test')->exists())->toBeFalse()
        ->and(User::where('email', 'peeradmin@tdms.test')->exists())->toBeFalse();
});

test('admin cannot update an existing admin account, even via a direct component call bypassing the UI list', function () {
    $actor = adminUser();
    $otherAdmin = adminUser();

    $this->actingAs($actor);

    Volt::test('staff.index')
        ->call('edit', $otherAdmin->id)
        ->assertForbidden();
});

test('admin cannot update the super_admin account via a direct component call', function () {
    $superAdmin = superAdminUser();

    $this->actingAs(adminUser());

    Volt::test('staff.index')
        ->call('edit', $superAdmin->id)
        ->assertForbidden();
});

test('super_admin can create and update admin accounts', function () {
    $this->actingAs(superAdminUser());

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'New Admin')
        ->set('email', 'newadmin@tdms.test')
        ->set('role', 'admin')
        ->call('save')
        ->assertHasNoErrors();

    $newAdmin = User::where('email', 'newadmin@tdms.test')->first();
    expect($newAdmin->hasRole('admin'))->toBeTrue();

    Volt::test('staff.index')
        ->call('edit', $newAdmin->id)
        ->set('name', 'Renamed Admin')
        ->set('role', 'admin')
        ->call('save')
        ->assertHasNoErrors();

    expect($newAdmin->fresh()->name)->toBe('Renamed Admin');
});

test('super_admin still cannot create another super_admin from the staff screen — that stays exclusive to the one-time bootstrap', function () {
    $this->actingAs(superAdminUser());

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'Second Super Admin')
        ->set('email', 'second-super@tdms.test')
        ->set('role', 'super_admin')
        ->call('save')
        ->assertHasErrors('role');

    expect(User::where('email', 'second-super@tdms.test')->exists())->toBeFalse();
});

test('no one can deactivate their own account, even super_admin', function () {
    $superAdmin = superAdminUser();
    $this->actingAs($superAdmin);

    Volt::test('staff.index')
        ->call('toggleActive', $superAdmin->id)
        ->assertForbidden();

    expect($superAdmin->fresh()->is_active)->toBeTrue();
});

test('deactivating an account prevents future login', function () {
    $target = User::factory()->create(['email' => 'deactivate-me@tdms.test', 'password' => 'Password123!']);
    $target->assignRole('teacher');

    $this->actingAs(adminUser());

    Volt::test('staff.index')->call('toggleActive', $target->id);

    expect($target->fresh()->is_active)->toBeFalse();

    $login = Volt::test('pages.auth.login')
        ->set('form.email', 'deactivate-me@tdms.test')
        ->set('form.password', 'Password123!')
        ->call('login');

    $login->assertHasErrors('form.email');
    $this->assertGuest();
});

test('deactivating an account ends an already-open session on the next request', function () {
    $target = User::factory()->create();
    $target->assignRole('teacher');

    $this->actingAs($target);
    $this->get('/dashboard')->assertOk();

    $target->is_active = false;
    $target->save();

    $this->get('/dashboard')->assertRedirect(route('login'));
    $this->assertGuest();
});

test('admin now has viewAny access to programs, students, and applications', function () {
    $this->actingAs(adminUser());

    $this->get('/programs')->assertOk();
    $this->get('/students')->assertOk();
    $this->get('/applications')->assertOk();
});

test('staff create, update, deactivate, and password reset are all audit logged', function () {
    $actor = adminUser();
    $this->actingAs($actor);

    Volt::test('staff.index')
        ->call('create')
        ->set('name', 'Audited Teacher')
        ->set('email', 'audited@tdms.test')
        ->set('role', 'teacher')
        ->call('save');

    $target = User::where('email', 'audited@tdms.test')->first();

    expect(AuditLog::where('action', 'STAFF_ACCOUNT_CREATED')->where('target', "like", "%{$target->email}%")->exists())->toBeTrue();

    Volt::test('staff.index')
        ->call('edit', $target->id)
        ->set('name', 'Renamed Teacher')
        ->call('save');

    expect(AuditLog::where('action', 'STAFF_ACCOUNT_UPDATED')->exists())->toBeTrue();

    Volt::test('staff.index')->call('resetPassword', $target->id);
    expect(AuditLog::where('action', 'STAFF_PASSWORD_RESET')->exists())->toBeTrue();

    Volt::test('staff.index')->call('toggleActive', $target->id);
    expect(AuditLog::where('action', 'STAFF_ACCOUNT_DEACTIVATED')->exists())->toBeTrue();
});

test('resetting a password invalidates the old one', function () {
    $target = User::factory()->create(['email' => 'reset-me@tdms.test', 'password' => 'OldPassword123!']);
    $target->assignRole('teacher');

    $this->actingAs(adminUser());
    Volt::test('staff.index')->call('resetPassword', $target->id);

    $login = Volt::test('pages.auth.login')
        ->set('form.email', 'reset-me@tdms.test')
        ->set('form.password', 'OldPassword123!')
        ->call('login');

    $login->assertHasErrors('form.email');
});
