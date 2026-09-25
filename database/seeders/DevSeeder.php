<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Development-only fixtures. Never invoked by DatabaseSeeder and never
 * run against production per the dossier's "real data only" rule (§18).
 * Run explicitly with: artisan db:seed --class=DevSeeder
 *
 * Idempotent: keyed on email, so re-running repairs the existing demo
 * rows (password, username, role, active flag) instead of colliding
 * with the unique index the way User::factory()->create() used to.
 */
class DevSeeder extends Seeder
{
    /**
     * One account per role defined by RolesAndPermissionsSeeder, so every
     * dashboard variant can be signed into. Usernames are the short form
     * of the email local part; both resolve to the same account.
     *
     * @var list<array{name: string, username: string, email: string, role: string}>
     */
    private const array ACCOUNTS = [
        ['name' => 'Super Admin Demo', 'username' => 'superadmin', 'email' => 'superadmin@tdms.test', 'role' => 'super_admin'],
        ['name' => 'Admin Demo', 'username' => 'admin', 'email' => 'admin@tdms.test', 'role' => 'admin'],
        ['name' => 'Dev Director', 'username' => 'director', 'email' => 'director@tdms.test', 'role' => 'director'],
        ['name' => 'Dev Coordinator', 'username' => 'coordinator', 'email' => 'coordinator@tdms.test', 'role' => 'coordinator'],
        ['name' => 'Dev Secretary', 'username' => 'secretary', 'email' => 'secretary@tdms.test', 'role' => 'secretary'],
        ['name' => 'Dev Teacher', 'username' => 'teacher', 'email' => 'teacher@tdms.test', 'role' => 'teacher'],
        ['name' => 'Dev Student', 'username' => 'student', 'email' => 'student@tdms.test', 'role' => 'student'],
    ];

    public function run(): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('DevSeeder creates well-known demo credentials and must never run in production.');
        }

        $this->call(RolesAndPermissionsSeeder::class);

        // Plain text on purpose: the User model casts `password` to
        // `hashed`, so Eloquent bcrypts it exactly once on save. Hashing
        // here as well would store a hash of a hash.
        $password = config('auth.demo_password');

        foreach (self::ACCOUNTS as $account) {
            $user = User::updateOrCreate(
                ['email' => $account['email']],
                [
                    'name' => $account['name'],
                    'username' => $account['username'],
                    'password' => $password,
                ],
            );

            // Not mass assignable, and the dashboard sits behind the
            // `verified` middleware, so set them directly.
            $user->forceFill([
                'email_verified_at' => $user->email_verified_at ?? now(),
                'is_active' => true,
            ])->save();

            // sync, not assign: re-running must not stack duplicate roles.
            $user->syncRoles([$account['role']]);
        }

        $this->command?->info('Seeded '.count(self::ACCOUNTS).' demo accounts (sign in with the username or the email).');
    }
}
