<?php

use App\Models\Subject;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;
use Livewire\WithPagination;

new #[Layout('layouts.app')] class extends Component
{
    use WithPagination;

    public bool $showForm = false;
    public ?Subject $editing = null;

    public string $code = '';
    public string $title = '';
    public string $description = '';
    public string $subject_type = 'lecture';
    public ?string $default_units = null;
    public bool $is_active = true;

    public function mount(): void
    {
        $this->authorize('viewAny', Subject::class);
    }

    public function create(): void
    {
        $this->authorize('create', Subject::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function edit(Subject $subject): void
    {
        $this->authorize('update', $subject);
        $this->editing = $subject;
        $this->code = $subject->code;
        $this->title = $subject->title;
        $this->description = (string) $subject->description;
        $this->subject_type = $subject->subject_type;
        $this->default_units = (string) $subject->default_units;
        $this->is_active = $subject->is_active;
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize($this->editing ? 'update' : 'create', $this->editing ?? Subject::class);

        $data = $this->validate([
            'code' => ['required', 'string', 'max:20', Rule::unique('subjects', 'code')->ignore($this->editing)],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'subject_type' => ['required', 'in:lecture,laboratory,practical,capstone,ojt'],
            'default_units' => ['required', 'numeric', 'min:0', 'max:99'],
            'is_active' => ['boolean'],
        ]);

        if ($this->editing) {
            $this->editing->update($data);
        } else {
            Subject::create($data);
        }

        $this->resetForm();
        $this->showForm = false;
    }

    public function toggleActive(Subject $subject): void
    {
        $this->authorize('update', $subject);
        $subject->update(['is_active' => ! $subject->is_active]);
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
        $this->title = '';
        $this->description = '';
        $this->subject_type = 'lecture';
        $this->default_units = null;
        $this->is_active = true;
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'subjects' => Subject::orderBy('code')->paginate(10),
        ];
    }
}; ?>

<div class="space-y-6">
    <x-page-header title="Subject Catalog" subtitle="Manage the master list of subjects offered across programs.">
        @can('create', Subject::class)
            <x-slot name="actions">
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Subject
                    </x-primary-button>
                @endunless
            </x-slot>
        @endcan
    </x-page-header>

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">
                {{ $editing ? 'Edit Subject' : 'New Subject' }}
            </h3>

            <form wire:submit="save" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <x-input-label for="code" value="Code" />
                        <x-text-input wire:model="code" id="code" class="block mt-1 w-full" placeholder="e.g. IT101" />
                        <x-input-error :messages="$errors->get('code')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="title" value="Title" />
                        <x-text-input wire:model="title" id="title" class="block mt-1 w-full" placeholder="e.g. Introduction to Programming" />
                        <x-input-error :messages="$errors->get('title')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="subject_type" value="Type" />
                        <select wire:model="subject_type" id="subject_type"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="lecture">Lecture</option>
                            <option value="laboratory">Laboratory</option>
                            <option value="practical">Practical</option>
                            <option value="capstone">Capstone</option>
                            <option value="ojt">OJT / Practicum</option>
                        </select>
                        <x-input-error :messages="$errors->get('subject_type')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="default_units" value="Default units" />
                        <x-text-input wire:model="default_units" id="default_units" class="block mt-1 w-full" placeholder="e.g. 3.0" />
                        <x-input-error :messages="$errors->get('default_units')" class="mt-2" />
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
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Title</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Units</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($subjects as $subject)
                        <tr wire:key="subject-{{ $subject->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm font-medium text-navy-900">{{ $subject->code }}</td>
                            <td class="px-6 py-4 text-sm text-slate-700">{{ $subject->title }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500 capitalize">{{ $subject->subject_type }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $subject->default_units }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$subject->is_active ? 'active' : 'inactive'" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                @can('update', $subject)
                                    <button wire:click="edit({{ $subject->id }})" class="text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                                    <button wire:click="toggleActive({{ $subject->id }})" class="text-slate-500 hover:text-slate-700 font-medium">
                                        {{ $subject->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="6">
                                <x-empty-state title="No subjects yet" description="Subjects you add will appear in this catalog." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($subjects->hasPages())
            <div class="px-6 py-4 border-t border-border">
                {{ $subjects->links() }}
            </div>
        @endif
    </x-card>
</div>
