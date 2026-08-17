<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Development-only fixtures. Never invoked by DatabaseSeeder and never
 * run against production per the dossier's "real data only" rule (§18).
 * Run explicitly with: artisan db:seed --class=DevSeeder
 */
class DevSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);

        collect([
            ['name' => 'Dev Director', 'email' => 'director@tdms.test', 'role' => 'director'],
            ['name' => 'Dev Coordinator', 'email' => 'coordinator@tdms.test', 'role' => 'coordinator'],
            ['name' => 'Dev Secretary', 'email' => 'secretary@tdms.test', 'role' => 'secretary'],
            ['name' => 'Dev Teacher', 'email' => 'teacher@tdms.test', 'role' => 'teacher'],
            ['name' => 'Dev Student', 'email' => 'student@tdms.test', 'role' => 'student'],
        ])->each(function (array $account): void {
            $user = User::factory()->create([
                'name' => $account['name'],
                'email' => $account['email'],
            ]);

            $user->assignRole($account['role']);
        });
    }
}
