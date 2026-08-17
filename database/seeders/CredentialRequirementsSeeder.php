<?php

namespace Database\Seeders;

use App\Models\CredentialRequirement;
use Illuminate\Database\Seeder;

/**
 * Baseline document requirements every applicant needs, regardless of
 * program. Program-specific requirements are added later through the
 * credential requirements admin screen, not hardcoded here.
 */
class CredentialRequirementsSeeder extends Seeder
{
    private const array GLOBAL_REQUIREMENTS = [
        'PSA Birth Certificate',
        'Form 137 / Transcript of Records',
        'Good Moral Character Certificate',
        '2x2 ID Photos',
    ];

    public function run(): void
    {
        foreach (self::GLOBAL_REQUIREMENTS as $name) {
            CredentialRequirement::firstOrCreate([
                'program_id' => null,
                'name' => $name,
            ], [
                'is_required' => true,
                'is_active' => true,
            ]);
        }
    }
}
