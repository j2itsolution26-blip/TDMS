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

<div class="space-y-6">
    <div>
        <a href="{{ route('programs.index') }}" wire:navigate class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            Programs
        </a>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-2">
            <h1 class="text-2xl font-semibold text-navy-900">
                {{ $program->name }}
                <span class="text-base font-normal text-slate-500">({{ $program->code }})</span>
            </h1>

            @can('create', \App\Models\Curriculum::class)
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Curriculum Version
                    </x-primary-button>
                @endunless
            @endcan
        </div>
        @if ($program->description)
            <p class="mt-2 text-sm text-slate-500 max-w-2xl">{{ $program->description }}</p>
        @endif
    </div>

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">
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
                    <input type="checkbox" wire:model="is_active" class="rounded border-slate-300 text-indigo-600 shadow-sm focus:ring-indigo-500">
                    <span class="ms-2 text-sm text-slate-600">Active</span>
                </label>

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
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Version</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">School year</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Subjects</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($curricula as $curriculum)
                        <tr wire:key="curriculum-{{ $curriculum->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm font-medium">
                                <a href="{{ route('curricula.show', $curriculum) }}" wire:navigate class="text-indigo-600 hover:text-indigo-700">
                                    {{ $curriculum->version_label }}
                                </a>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $curriculum->effective_school_year }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $curriculum->curriculum_subjects_count }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$curriculum->is_active ? 'active' : 'inactive'" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                @can('update', $curriculum)
                                    <button wire:click="edit({{ $curriculum->id }})" class="text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                                    <button wire:click="toggleActive({{ $curriculum->id }})" class="text-slate-500 hover:text-slate-700 font-medium">
                                        {{ $curriculum->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5">
                                <x-empty-state title="No curriculum versions yet" description="Add a curriculum version to start building this program's subject plan." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </x-card>
</div>
