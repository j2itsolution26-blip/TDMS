<?php

use App\Models\User;
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

    public function mount(): void
    {
        $this->authorize('viewAny', User::class);
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
            'role' => ['required', Rule::in(self::STAFF_ROLES)],
        ]);

        if ($this->editing) {
            $this->editing->update(['name' => $data['name'], 'email' => $data['email']]);
            $this->editing->syncRoles([$data['role']]);
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

            $this->generatedPassword = $password;
            $this->generatedFor = $data['email'];
            $this->resetForm();
        }
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
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">Staff Accounts</h2>

            @can('create', User::class)
                @unless ($showForm)
                    <x-primary-button wire:click="create">New Staff Account</x-primary-button>
                @endunless
            @endcan
        </div>

        @if ($generatedPassword)
            <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-6">
                <p class="font-medium text-amber-900 dark:text-amber-200">Account created for {{ $generatedFor }}</p>
                <p class="mt-2 text-sm text-amber-800 dark:text-amber-300">
                    One-time password (shown only here &mdash; save it now):
                </p>
                <code class="block mt-1 px-3 py-2 bg-white dark:bg-gray-900 rounded font-mono text-sm">{{ $generatedPassword }}</code>
                <div class="mt-4">
                    <x-secondary-button wire:click="dismissGeneratedPassword">Done</x-secondary-button>
                </div>
            </div>
        @endif

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">
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
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="admin">Admin</option>
                                <option value="director">Director</option>
                                <option value="coordinator">Coordinator</option>
                                <option value="secretary">Secretary</option>
                                <option value="teacher">Teacher</option>
                            </select>
                            <x-input-error :messages="$errors->get('role')" class="mt-2" />
                        </div>
                    </div>

                    @unless ($editing)
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            A secure password is generated automatically and shown once after saving.
                        </p>
                    @endunless

                    <div class="flex items-center gap-3">
                        <x-primary-button type="submit">Save</x-primary-button>
                        <x-secondary-button type="button" wire:click="cancel">Cancel</x-secondary-button>
                    </div>
                </form>
            </div>
        @endif

        <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($staff as $user)
                        <tr wire:key="staff-{{ $user->id }}">
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{{ $user->name }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $user->email }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 capitalize">{{ $user->getRoleNames()->join(', ') }}</td>
                            <td class="px-6 py-4 text-sm text-right">
                                @can('update', $user)
                                    <button wire:click="edit({{ $user->id }})" class="text-indigo-600 hover:underline">Edit</button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No staff accounts yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>

            <div class="px-6 py-4">
                {{ $staff->links() }}
            </div>
        </div>
    </div>
</div>
