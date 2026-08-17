<?php

use App\Models\Curriculum;
use App\Models\Program;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.app')] class extends Component
{
    public Program $program;

    public bool $showForm = false;
    public ?Curriculum $editing = null;

    public string $version_label = '';
    public string $effective_school_year = '';
    public bool $is_active = true;

    public function mount(Program $program): void
    {
        $this->authorize('view', $program);
        $this->program = $program;
    }

    public function create(): void
    {
        $this->authorize('create', Curriculum::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function edit(Curriculum $curriculum): void
    {
        $this->authorize('update', $curriculum);
        $this->editing = $curriculum;
        $this->version_label = $curriculum->version_label;
        $this->effective_school_year = $curriculum->effective_school_year;
        $this->is_active = $curriculum->is_active;
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize($this->editing ? 'update' : 'create', $this->editing ?? Curriculum::class);

        $data = $this->validate([
            'version_label' => [
                'required', 'string', 'max:50',
                Rule::unique('curricula', 'version_label')
                    ->where('program_id', $this->program->id)
                    ->ignore($this->editing),
            ],
            'effective_school_year' => ['required', 'string', 'max:20'],
            'is_active' => ['boolean'],
        ]);

        if ($this->editing) {
            $this->editing->update($data);
        } else {
            $this->program->curricula()->create($data);
        }

        $this->resetForm();
        $this->showForm = false;
    }

    public function toggleActive(Curriculum $curriculum): void
    {
        $this->authorize('update', $curriculum);
        $curriculum->update(['is_active' => ! $curriculum->is_active]);
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    private function resetForm(): void
    {
        $this->editing = null;
        $this->version_label = '';
        $this->effective_school_year = '';
        $this->is_active = true;
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'curricula' => $this->program->curricula()->withCount('curriculumSubjects')->orderByDesc('effective_school_year')->get(),
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div>
            <a href="{{ route('programs.index') }}" wire:navigate class="text-sm text-indigo-600 hover:underline">&larr; Programs</a>
            <div class="flex items-center justify-between mt-1">
                <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
                    {{ $program->name }}
                    <span class="text-sm font-normal text-gray-500">({{ $program->code }})</span>
                </h2>

                @can('create', \App\Models\Curriculum::class)
                    @unless ($showForm)
                        <x-primary-button wire:click="create">New Curriculum Version</x-primary-button>
                    @endunless
                @endcan
            </div>
            @if ($program->description)
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">{{ $program->description }}</p>
            @endif
        </div>

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">
                    {{ $editing ? 'Edit Curriculum Version' : 'New Curriculum Version' }}
                </h3>

                <form wire:submit="save" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <x-input-label for="version_label" value="Version label" />
                            <x-text-input wire:model="version_label" id="version_label" class="block mt-1 w-full" placeholder="e.g. 2026" />
                            <x-input-error :messages="$errors->get('version_label')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="effective_school_year" value="Effective school year" />
                            <x-text-input wire:model="effective_school_year" id="effective_school_year" class="block mt-1 w-full" placeholder="e.g. 2026-2027" />
                            <x-input-error :messages="$errors->get('effective_school_year')" class="mt-2" />
                        </div>
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
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">School year</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subjects</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($curricula as $curriculum)
                        <tr wire:key="curriculum-{{ $curriculum->id }}">
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <a href="{{ route('curricula.show', $curriculum) }}" wire:navigate class="text-indigo-600 hover:underline">
                                    {{ $curriculum->version_label }}
                                </a>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $curriculum->effective_school_year }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $curriculum->curriculum_subjects_count }}</td>
                            <td class="px-6 py-4 text-sm">
                                <span class="px-2 py-1 text-xs rounded-full {{ $curriculum->is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600' }}">
                                    {{ $curriculum->is_active ? 'Active' : 'Inactive' }}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('update', $curriculum)
                                    <button wire:click="edit({{ $curriculum->id }})" class="text-indigo-600 hover:underline">Edit</button>
                                    <button wire:click="toggleActive({{ $curriculum->id }})" class="text-gray-500 hover:underline">
                                        {{ $curriculum->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No curriculum versions yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>
