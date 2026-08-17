<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database. Production-safe only: roles and
     * permissions are system configuration, not demo data. Run
     * DevSeeder separately (never in production) for fake accounts.
     */
    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);
        $this->call(CredentialRequirementsSeeder::class);
    }
}
