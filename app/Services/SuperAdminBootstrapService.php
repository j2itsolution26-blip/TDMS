<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Spatie\Permission\Models\Role;

class SuperAdminBootstrapService
{
    public const string SUPER_ADMIN_ROLE = 'super_admin';

    /**
     * Memoized per request (this service is bound as a singleton — see
     * AppServiceProvider) so that back-to-back callers within the same
     * request — e.g. the route middleware immediately followed by the
     * Volt component's mount() on a single GET — share one query instead
     * of issuing the same existence check twice. Pass fresh: true for any
     * check that gates a write and therefore must not use a value that
     * could have gone stale while earlier work (validation, hashing) ran.
     */
    private ?bool $bootstrapAllowedMemo = null;

    /**
     * Check if initial system bootstrap is allowed (0 Super Admins exist).
     */
    public function isBootstrapAllowed(bool $fresh = false): bool
    {
        if (! $fresh && $this->bootstrapAllowedMemo !== null) {
            return $this->bootstrapAllowedMemo;
        }

        return $this->bootstrapAllowedMemo = ! User::whereHas('roles', function ($query) {
            $query->where('name', self::SUPER_ADMIN_ROLE);
        })->exists();
    }

    /**
     * Create the first Super Admin account in a concurrency-safe transaction.
     *
     * @param  array{name: string, email: string, password: string}  $data
     *
     * @throws RuntimeException
     */
    public function createSuperAdmin(array $data, ?string $ip = null, ?string $userAgent = null): User
    {
        // Atomic mutex (via the existing database cache store's cache_locks
        // table) so two simultaneous submissions can't both pass the
        // exists-check before either has committed — the transaction alone
        // doesn't prevent that, since neither has written anything yet at
        // the moment they check. Fails fast rather than queueing: this is
        // a one-time setup action, not something worth making a second
        // requester wait on.
        $lock = Cache::lock('super-admin-bootstrap', 10);

        if (! $lock->get()) {
            throw new RuntimeException('Super Admin setup is already being completed by another request. Please wait a moment and refresh.');
        }

        try {
            return DB::transaction(function () use ($data, $ip, $userAgent) {
                // Fresh re-check now that we hold the lock — forced fresh
                // because real work (validation, password hashing) has
                // happened since any earlier, memoized check.
                if (! $this->isBootstrapAllowed(fresh: true)) {
                    throw new RuntimeException('Super Admin setup has already been completed. Please log in using the existing administrator account.');
                }

                return $this->insertSuperAdmin($data, $ip, $userAgent);
            });
        } finally {
            $lock->release();
        }
    }

    private function insertSuperAdmin(array $data, ?string $ip, ?string $userAgent): User
    {
        // Ensure role exists in the database, and reuse this same Role
        // instance for assignRole() below — passing an already-loaded
        // Role skips a second, redundant lookup-by-name query.
        $role = Role::findOrCreate(self::SUPER_ADMIN_ROLE, 'web');

        // Strictly create account with server-assigned SUPER_ADMIN role.
        // email_verified_at is set before save() (not a second update
        // afterward) so this is a single insert.
        $user = new User([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);
        $user->email_verified_at = now();
        $user->save();

        $user->assignRole($role);

        // Record bootstrap audit trail without sensitive password data
        AuditLog::record(
            action: 'INITIAL_SUPER_ADMIN_CREATED',
            actor: 'SYSTEM_BOOTSTRAP',
            target: "Super Admin Account ({$user->email})",
            details: [
                'user_id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => self::SUPER_ADMIN_ROLE,
            ],
            ip: $ip,
            userAgent: $userAgent,
        );

        return $user;
    }
}
