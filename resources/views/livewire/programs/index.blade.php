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

<div class="space-y-6">
    <x-page-header title="Programs" subtitle="Manage academic programs and their curricula.">
        @can('create', Program::class)
            <x-slot name="actions">
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Program
                    </x-primary-button>
                @endunless
            </x-slot>
        @endcan
    </x-page-header>

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">
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
                        class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"></textarea>
                    <x-input-error :messages="$errors->get('description')" class="mt-2" />
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
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Code</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Curricula</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($programs as $program)
                        <tr wire:key="program-{{ $program->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm font-medium text-navy-900">{{ $program->code }}</td>
                            <td class="px-6 py-4 text-sm">
                                <a href="{{ route('programs.show', $program) }}" wire:navigate class="text-indigo-600 hover:text-indigo-700 font-medium">
                                    {{ $program->name }}
                                </a>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $program->curricula_count }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$program->is_active ? 'active' : 'inactive'" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                @can('update', $program)
                                    <button wire:click="edit({{ $program->id }})" class="text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                                    <button wire:click="toggleActive({{ $program->id }})" class="text-slate-500 hover:text-slate-700 font-medium">
                                        {{ $program->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5">
                                <x-empty-state title="No programs yet" description="Programs you create will appear here." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($programs->hasPages())
            <div class="px-6 py-4 border-t border-border">
                {{ $programs->links() }}
            </div>
        @endif
    </x-card>
</div>
