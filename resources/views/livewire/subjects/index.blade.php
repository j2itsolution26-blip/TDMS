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

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">Subject Catalog</h2>

            @can('create', Subject::class)
                @unless ($showForm)
                    <x-primary-button wire:click="create">New Subject</x-primary-button>
                @endunless
            @endcan
        </div>

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">
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
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
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
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Units</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($subjects as $subject)
                        <tr wire:key="subject-{{ $subject->id }}">
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{{ $subject->code }}</td>
                            <td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{{ $subject->title }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 capitalize">{{ $subject->subject_type }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $subject->default_units }}</td>
                            <td class="px-6 py-4 text-sm">
                                <span class="px-2 py-1 text-xs rounded-full {{ $subject->is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600' }}">
                                    {{ $subject->is_active ? 'Active' : 'Inactive' }}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('update', $subject)
                                    <button wire:click="edit({{ $subject->id }})" class="text-indigo-600 hover:underline">Edit</button>
                                    <button wire:click="toggleActive({{ $subject->id }})" class="text-gray-500 hover:underline">
                                        {{ $subject->is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No subjects yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>

            <div class="px-6 py-4">
                {{ $subjects->links() }}
            </div>
        </div>
    </div>
</div>
