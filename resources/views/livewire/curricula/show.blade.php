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

<div class="space-y-6">
    <div>
        <a href="{{ route('programs.show', $curriculum->program) }}" wire:navigate class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            {{ $curriculum->program->name }}
        </a>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-2">
            <h1 class="text-2xl font-semibold text-navy-900">
                Curriculum {{ $curriculum->version_label }}
                <span class="text-base font-normal text-slate-500">({{ $curriculum->effective_school_year }})</span>
            </h1>

            @can('create', \App\Models\CurriculumSubject::class)
                @unless ($showForm)
                    <x-primary-button wire:click="addSubject">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        Add Subject
                    </x-primary-button>
                @endunless
            @endcan
        </div>
    </div>

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">Add Subject to Curriculum</h3>

            <form wire:submit="save" class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <x-input-label for="subject_id" value="Subject" />
                        <select wire:model.live="subject_id" id="subject_id"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
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
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
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
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="1">1st year</option>
                            <option value="2">2nd year</option>
                            <option value="3">3rd year</option>
                        </select>
                        <x-input-error :messages="$errors->get('year_level')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="semester" value="Semester" />
                        <select wire:model="semester" id="semester"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
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
        </x-card>
    @endif

    <x-card padding="p-0">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Yr / Sem</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Subject</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Prerequisite</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Units</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($entries as $entry)
                        <tr wire:key="entry-{{ $entry->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm text-slate-500">Y{{ $entry->year_level }} / S{{ $entry->semester }}</td>
                            <td class="px-6 py-4 text-sm font-medium text-navy-900">
                                {{ $entry->subject->code }} &mdash; {{ $entry->subject->title }}
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $entry->prerequisite?->code ?? '—' }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $entry->units }}</td>
                            <td class="px-6 py-4 text-sm text-right">
                                @can('delete', $entry)
                                    <button wire:click="remove({{ $entry->id }})" wire:confirm="Remove this subject from the curriculum?" class="text-red-600 hover:text-red-700 font-medium">
                                        Remove
                                    </button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5">
                                <x-empty-state title="No subjects added yet" description="Add subjects to build out this curriculum's year-by-year plan." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </x-card>
</div>
