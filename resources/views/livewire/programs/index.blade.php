<?php

use App\Models\Program;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;
use Livewire\WithPagination;

new #[Layout('layouts.app')] class extends Component
{
    use WithPagination;

    public bool $showForm = false;
    public ?Program $editing = null;

    public string $code = '';
    public string $name = '';
    public string $description = '';
    public bool $is_active = true;

    public function mount(): void
    {
        $this->authorize('viewAny', Program::class);
    }

    public function create(): void
    {
        $this->authorize('create', Program::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function edit(Program $program): void
    {
        $this->authorize('update', $program);
        $this->editing = $program;
        $this->code = $program->code;
        $this->name = $program->name;
        $this->description = (string) $program->description;
        $this->is_active = $program->is_active;
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize($this->editing ? 'update' : 'create', $this->editing ?? Program::class);

        $data = $this->validate([
            'code' => ['required', 'string', 'max:20', Rule::unique('programs', 'code')->ignore($this->editing)],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        if ($this->editing) {
            $this->editing->update($data);
        } else {
            Program::create($data);
        }

        $this->resetForm();
        $this->showForm = false;
    }

    public function toggleActive(Program $program): void
    {
        $this->authorize('update', $program);
        $program->update(['is_active' => ! $program->is_active]);
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    private function resetForm(): void
    {
        $this->editing = null;
        $this->code = '';
        $this->name = '';
        $this->description = '';
        $this->is_active = true;
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'programs' => Program::withCount('curricula')->orderBy('name')->paginate(10),
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">Programs</h2>

            @can('create', Program::class)
                @unless ($showForm)
                    <x-primary-button wire:click="create">New Program</x-primary-button>
                @endunless
            @endcan
        </div>

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">
                    {{ $editing ? 'Edit Program' : 'New Program' }}
                </h3>

                <form wire:submit="save" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <x-input-label for="code" value="Code" />
                            <x-text-input wire:model="code" id="code" class="block mt-1 w-full" placeholder="e.g. BSIT-D" />
                            <x-input-error :messages="$errors->get('code')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="name" value="Name" />
                            <x-text-input wire:model="name" id="name" class="block mt-1 w-full" placeholder="e.g. Diploma in Information Technology" />
                            <x-input-error :messages="$errors->get('name')" class="mt-2" />
                        </div>
                    </div>

                    <div>
                        <x-input-label for="description" value="Description" />
                        <textarea wire:model="description" id="description" rows="3"
                            class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm"></textarea>
                        <x-input-error :messages="$errors->get('description')" class="mt-2" />
                    </div>

                    <label class="inline-flex items-center">
                        <input type="checkbox" wire:model="is_active" class="rounded border-gray-300 text-indigo-600 shadow-sm">
                        <span class="ms-2 text-sm text-gray-600 dark:text-gray-400">Active</span>
                    </label>

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
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Code</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Curricula</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($programs as $program)
                        <tr wire:key="program-{{ $program->id }}">
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{{ $program->code }}</td>
                            <td class="px-6 py-4 text-sm">
                                <a href="{{ route('programs.show', $program) }}" wire:navigate class="text-indigo-600 hover:underline">
                                    {{ $program->name }}
                                </a>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $program->curricula_count }}</td>
                            <td class="px-6 py-4 text-sm">
                                <span class="px-2 py-1 text-xs rounded-full {{ $program->is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600' }}">
                                    {{ $program->is_active ? 'Active' : 'Inactive' }}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('update', $program)
                                    <button wire:click="edit({{ $program->id }})" class="text-indigo-600 hover:underline">Edit</button>
                                    <button wire:click="toggleActive({{ $program->id }})" class="text-gray-500 hover:underline">
                                        {{ $program->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No programs yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>

            <div class="px-6 py-4">
                {{ $programs->links() }}
            </div>
        </div>
    </div>
</div>
