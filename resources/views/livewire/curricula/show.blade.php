<?php

use App\Models\Curriculum;
use App\Models\CurriculumSubject;
use App\Models\Subject;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.app')] class extends Component
{
    public Curriculum $curriculum;

    public bool $showForm = false;

    public ?int $subject_id = null;
    public ?int $prerequisite_subject_id = null;
    public int $year_level = 1;
    public int $semester = 1;
    public ?string $units = null;

    public function mount(Curriculum $curriculum): void
    {
        $this->authorize('view', $curriculum);
        $this->curriculum = $curriculum->load('program');
    }

    public function addSubject(): void
    {
        $this->authorize('create', CurriculumSubject::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function updatedSubjectId(): void
    {
        if ($this->subject_id) {
            $this->units = (string) Subject::find($this->subject_id)?->default_units;
        }
    }

    public function save(): void
    {
        $this->authorize('create', CurriculumSubject::class);

        $data = $this->validate([
            'subject_id' => [
                'required',
                'exists:subjects,id',
                function ($attribute, $value, $fail) {
                    if ($this->curriculum->curriculumSubjects()->where('subject_id', $value)->exists()) {
                        $fail('This subject is already part of the curriculum.');
                    }
                },
            ],
            'prerequisite_subject_id' => ['nullable', 'exists:subjects,id', 'different:subject_id'],
            'year_level' => ['required', 'integer', 'min:1', 'max:4'],
            'semester' => ['required', 'integer', 'min:1', 'max:2'],
            'units' => ['required', 'numeric', 'min:0', 'max:99'],
        ]);

        $this->curriculum->curriculumSubjects()->create($data);

        $this->resetForm();
        $this->showForm = false;
    }

    public function remove(CurriculumSubject $curriculumSubject): void
    {
        $this->authorize('delete', $curriculumSubject);
        abort_unless($curriculumSubject->curriculum_id === $this->curriculum->id, 403);
        $curriculumSubject->delete();
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    private function resetForm(): void
    {
        $this->subject_id = null;
        $this->prerequisite_subject_id = null;
        $this->year_level = 1;
        $this->semester = 1;
        $this->units = null;
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'entries' => $this->curriculum->curriculumSubjects()
                ->with(['subject', 'prerequisite'])
                ->orderBy('year_level')->orderBy('semester')
                ->get(),
            'availableSubjects' => Subject::where('is_active', true)->orderBy('title')->get(),
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div>
            <a href="{{ route('programs.show', $curriculum->program) }}" wire:navigate class="text-sm text-indigo-600 hover:underline">
                &larr; {{ $curriculum->program->name }}
            </a>
            <div class="flex items-center justify-between mt-1">
                <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
                    Curriculum {{ $curriculum->version_label }}
                    <span class="text-sm font-normal text-gray-500">({{ $curriculum->effective_school_year }})</span>
                </h2>

                @can('create', \App\Models\CurriculumSubject::class)
                    @unless ($showForm)
                        <x-primary-button wire:click="addSubject">Add Subject</x-primary-button>
                    @endunless
                @endcan
            </div>
        </div>

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">Add Subject to Curriculum</h3>

                <form wire:submit="save" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <x-input-label for="subject_id" value="Subject" />
                            <select wire:model.live="subject_id" id="subject_id"
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="">Select a subject&hellip;</option>
                                @foreach ($availableSubjects as $subject)
                                    <option value="{{ $subject->id }}">{{ $subject->code }} &mdash; {{ $subject->title }}</option>
                                @endforeach
                            </select>
                            <x-input-error :messages="$errors->get('subject_id')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="prerequisite_subject_id" value="Prerequisite (optional)" />
                            <select wire:model="prerequisite_subject_id" id="prerequisite_subject_id"
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="">None</option>
                                @foreach ($availableSubjects as $subject)
                                    <option value="{{ $subject->id }}">{{ $subject->code }} &mdash; {{ $subject->title }}</option>
                                @endforeach
                            </select>
                            <x-input-error :messages="$errors->get('prerequisite_subject_id')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="year_level" value="Year level" />
                            <select wire:model="year_level" id="year_level"
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="1">1st year</option>
                                <option value="2">2nd year</option>
                                <option value="3">3rd year</option>
                            </select>
                            <x-input-error :messages="$errors->get('year_level')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="semester" value="Semester" />
                            <select wire:model="semester" id="semester"
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="1">1st semester</option>
                                <option value="2">2nd semester</option>
                            </select>
                            <x-input-error :messages="$errors->get('semester')" class="mt-2" />
                        </div>

                        <div>
                            <x-input-label for="units" value="Units" />
                            <x-text-input wire:model="units" id="units" class="block mt-1 w-full" placeholder="e.g. 3.0" />
                            <x-input-error :messages="$errors->get('units')" class="mt-2" />
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <x-primary-button type="submit">Add</x-primary-button>
                        <x-secondary-button type="button" wire:click="cancel">Cancel</x-secondary-button>
                    </div>
                </form>
            </div>
        @endif

        <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Yr / Sem</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subject</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prerequisite</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Units</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($entries as $entry)
                        <tr wire:key="entry-{{ $entry->id }}">
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Y{{ $entry->year_level }} / S{{ $entry->semester }}</td>
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ $entry->subject->code }} &mdash; {{ $entry->subject->title }}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $entry->prerequisite?->code ?? '—' }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $entry->units }}</td>
                            <td class="px-6 py-4 text-sm text-right">
                                @can('delete', $entry)
                                    <button wire:click="remove({{ $entry->id }})" wire:confirm="Remove this subject from the curriculum?" class="text-red-600 hover:underline">
                                        Remove
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No subjects added to this curriculum yet.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>
