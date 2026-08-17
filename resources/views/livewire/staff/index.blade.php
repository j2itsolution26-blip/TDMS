<?php

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;
use Livewire\WithPagination;

new #[Layout('layouts.app')] class extends Component
{
    use WithPagination;

    private const array STAFF_ROLES = ['admin', 'director', 'coordinator', 'secretary', 'teacher'];

    public bool $showForm = false;
    public ?User $editing = null;

    public string $name = '';
    public string $email = '';
    public string $role = 'secretary';

    public ?string $generatedPassword = null;
    public ?string $generatedFor = null;

    public ?int $deactivating = null;
    public string $deactivateReason = '';

    public function mount(): void
    {
        $this->authorize('viewAny', User::class);
    }

    /**
     * Which roles the CURRENT actor may grant. Only a super_admin can
     * grant the admin role itself — an admin can staff every operational
     * role below it, but not create peers or escalate anyone to admin.
     */
    private function assignableRoles(): array
    {
        return Auth::user()->hasRole('super_admin')
            ? self::STAFF_ROLES
            : ['director', 'coordinator', 'secretary', 'teacher'];
    }

    public function create(): void
    {
        $this->authorize('create', User::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function edit(User $user): void
    {
        $this->authorize('update', $user);
        $this->editing = $user;
        $this->name = $user->name;
        $this->email = $user->email;
        $this->role = $user->getRoleNames()->first() ?? 'secretary';
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize($this->editing ? 'update' : 'create', $this->editing ?? User::class);

        $data = $this->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->editing)],
            'role' => ['required', Rule::in($this->assignableRoles())],
        ]);

        $actor = Auth::user();

        if ($this->editing) {
            $oldRole = $this->editing->getRoleNames()->first();
            $oldEmail = $this->editing->email;

            $this->editing->update(['name' => $data['name'], 'email' => $data['email']]);
            $this->editing->syncRoles([$data['role']]);

            AuditLog::record(
                action: 'STAFF_ACCOUNT_UPDATED',
                actor: "{$actor->name} <{$actor->email}>",
                target: "{$this->editing->name} <{$data['email']}>",
                details: [
                    'old_role' => $oldRole,
                    'new_role' => $data['role'],
                    'old_email' => $oldEmail,
                    'new_email' => $data['email'],
                ],
                ip: request()->ip(),
                userAgent: request()->userAgent(),
            );

            $this->resetForm();
            $this->showForm = false;
        } else {
            $password = Str::password(20);

            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($password),
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();
            $user->assignRole($data['role']);

            AuditLog::record(
                action: 'STAFF_ACCOUNT_CREATED',
                actor: "{$actor->name} <{$actor->email}>",
                target: "{$user->name} <{$user->email}>",
                details: ['role' => $data['role']],
                ip: request()->ip(),
                userAgent: request()->userAgent(),
            );

            $this->generatedPassword = $password;
            $this->generatedFor = $data['email'];
            $this->resetForm();
        }
    }

    public function toggleActive(User $user): void
    {
        $this->authorize('toggleActive', $user);

        // Gate::before grants super_admin every ability unconditionally
        // (see AppServiceProvider), which bypasses the policy's own
        // self-targeting check — so this rule has to be hard-coded here
        // too, or a super_admin could deactivate their own account.
        abort_if($user->is(Auth::user()), 403, 'You cannot deactivate your own account.');

        $actor = Auth::user();
        $newState = ! $user->is_active;

        $user->is_active = $newState;
        $user->save();

        AuditLog::record(
            action: $newState ? 'STAFF_ACCOUNT_ACTIVATED' : 'STAFF_ACCOUNT_DEACTIVATED',
            actor: "{$actor->name} <{$actor->email}>",
            target: "{$user->name} <{$user->email}>",
            details: ['role' => $user->getRoleNames()->first()],
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function resetPassword(User $user): void
    {
        $this->authorize('resetPassword', $user);

        $actor = Auth::user();
        $password = Str::password(20);

        $user->forceFill(['password' => Hash::make($password)])->save();

        AuditLog::record(
            action: 'STAFF_PASSWORD_RESET',
            actor: "{$actor->name} <{$actor->email}>",
            target: "{$user->name} <{$user->email}>",
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );

        $this->generatedPassword = $password;
        $this->generatedFor = $user->email;
    }

    public function dismissGeneratedPassword(): void
    {
        $this->generatedPassword = null;
        $this->generatedFor = null;
        $this->showForm = false;
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    private function resetForm(): void
    {
        $this->editing = null;
        $this->name = '';
        $this->email = '';
        $this->role = 'secretary';
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'staff' => User::whereHas('roles', fn ($q) => $q->whereIn('name', self::STAFF_ROLES))
                ->with('roles')
                ->orderBy('name')
                ->paginate(10),
            'roleOptions' => $this->assignableRoles(),
        ];
    }
}; ?>

<div class="space-y-6">
    <x-page-header title="Staff Accounts" subtitle="Manage staff, teacher, and administrator accounts.">
        @can('create', User::class)
            <x-slot name="actions">
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Staff Account
                    </x-primary-button>
                @endunless
            </x-slot>
        @endcan
    </x-page-header>

    @if ($generatedPassword)
        <x-alert type="warning" :title="__('Password for :email', ['email' => $generatedFor])">
            <p>One-time password (shown only here &mdash; save it now):</p>
            <code class="block mt-2 px-3 py-2 bg-white rounded-lg font-mono text-sm text-navy-900 border border-amber-200">{{ $generatedPassword }}</code>
            <div class="mt-3">
                <x-secondary-button wire:click="dismissGeneratedPassword">Done</x-secondary-button>
            </div>
        </x-alert>
    @endif

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">
                {{ $editing ? 'Edit Staff Account' : 'New Staff Account' }}
            </h3>

            <form wire:submit="save" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <x-input-label for="name" value="Name" />
                        <x-text-input wire:model="name" id="name" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('name')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="email" value="Email" />
                        <x-text-input wire:model="email" id="email" type="email" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('email')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="role" value="Role" />
                        <select wire:model="role" id="role"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            @foreach ($roleOptions as $option)
                                <option value="{{ $option }}" class="capitalize">{{ ucfirst($option) }}</option>
                            @endforeach
                        </select>
                        <x-input-error :messages="$errors->get('role')" class="mt-2" />
                    </div>
                </div>

                @unless ($editing)
                    <p class="text-xs text-slate-500">
                        A secure password is generated automatically and shown once after saving.
                    </p>
                @endunless

                <div class="flex items-center gap-3">
                    <x-primary-button type="submit">Save</x-primary-button>
                    <x-secondary-button type="button" wire:click="cancel">Cancel</x-secondary-button>
                </div>
            </form>
        </x-card>
    @endif

    <x-card padding="p-0">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($staff as $user)
                        <tr wire:key="staff-{{ $user->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm">
                                <div class="flex items-center gap-3">
                                    <x-avatar :name="$user->name" size="sm" />
                                    <span class="font-medium text-navy-900">{{ $user->name }}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $user->email }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500 capitalize">{{ str_replace('_', ' ', $user->getRoleNames()->join(', ')) }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$user->is_active ? 'active' : 'deactivated'" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                @can('update', $user)
                                    <button wire:click="edit({{ $user->id }})" class="text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                                @endcan
                                @can('resetPassword', $user)
                                    <button wire:click="resetPassword({{ $user->id }})"
                                        wire:confirm="Issue a new password for {{ $user->email }}? The current password stops working immediately."
                                        class="text-indigo-600 hover:text-indigo-700 font-medium">Reset Password</button>
                                @endcan
                                @can('toggleActive', $user)
                                    <button wire:click="toggleActive({{ $user->id }})"
                                        wire:confirm="{{ $user->is_active ? "Deactivate {$user->email}? They'll be signed out and unable to log in." : "Reactivate {$user->email}?" }}"
                                        class="{{ $user->is_active ? 'text-red-600 hover:text-red-700' : 'text-green-700 hover:text-green-800' }} font-medium">
                                        {{ $user->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5">
                                <x-empty-state title="No staff accounts yet" description="Staff and teacher accounts you create will appear here." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($staff->hasPages())
            <div class="px-6 py-4 border-t border-border">
                {{ $staff->links() }}
            </div>
        @endif
    </x-card>
</div>
