<?php

use App\Models\Enrollment;
use App\Models\Student;
use App\Models\StudentCredential;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.app')] class extends Component
{
    public Student $student;

    public ?int $rejecting = null;
    public string $rejectionReason = '';

    public bool $showEnrollForm = false;
    public string $school_year = '';
    public int $semester = 1;
    public int $year_level = 1;

    public ?int $dropping = null;
    public string $dropReason = '';

    public ?string $flash = null;
    public ?string $flashError = null;

    public function mount(Student $student): void
    {
        $this->authorize('view', $student);
        $this->student = $student;
        $this->school_year = now()->month >= 6
            ? now()->format('Y').'-'.(now()->addYear()->format('Y'))
            : (now()->subYear()->format('Y')).'-'.now()->format('Y');
        $this->year_level = $student->year_level ?? 1;
    }

    public function verify(StudentCredential $credential): void
    {
        $this->authorize('verify', $credential);
        $credential->verify();
        $this->flash = 'Credential verified.';
    }

    public function startReject(int $credentialId): void
    {
        $this->rejecting = $credentialId;
        $this->rejectionReason = '';
    }

    public function confirmReject(): void
    {
        $credential = StudentCredential::findOrFail($this->rejecting);
        $this->authorize('verify', $credential);

        $this->validate(['rejectionReason' => ['required', 'string', 'max:500']]);

        $credential->reject($this->rejectionReason);

        $this->rejecting = null;
        $this->rejectionReason = '';
        $this->flash = 'Credential rejected.';
    }

    public function startEnroll(): void
    {
        $this->authorize('create', Enrollment::class);
        $this->showEnrollForm = true;
    }

    public function saveEnrollment(): void
    {
        $this->authorize('create', Enrollment::class);

        $this->validate([
            'school_year' => ['required', 'regex:/^\d{4}-\d{4}$/'],
            'semester' => ['required', 'in:1,2'],
            'year_level' => ['required', 'integer', 'min:1', 'max:4'],
        ]);

        Enrollment::create([
            'student_id' => $this->student->id,
            'curriculum_id' => $this->student->curriculum_id,
            'school_year' => $this->school_year,
            'semester' => $this->semester,
            'year_level' => $this->year_level,
            'status' => 'pending',
        ]);

        $this->showEnrollForm = false;
        $this->flash = 'Enrollment term created as pending.';
    }

    public function confirmEnrollment(Enrollment $enrollment): void
    {
        $this->authorize('transition', $enrollment);

        try {
            $enrollment->transitionTo('enrolled');
            $this->student->refresh();
            $this->flash = 'Student officially enrolled.';
        } catch (\RuntimeException $e) {
            $this->flashError = $e->getMessage();
        }
    }

    public function startDrop(int $enrollmentId): void
    {
        $this->dropping = $enrollmentId;
        $this->dropReason = '';
    }

    public function confirmDrop(): void
    {
        $enrollment = Enrollment::findOrFail($this->dropping);
        $this->authorize('transition', $enrollment);

        $this->validate(['dropReason' => ['required', 'string', 'max:500']]);

        $enrollment->transitionTo('dropped', $this->dropReason);

        $this->dropping = null;
        $this->dropReason = '';
        $this->flash = 'Enrollment dropped.';
    }

    public function with(): array
    {
        return [
            'credentials' => $this->student->credentials()->with('requirement')->get()
                ->sortBy(fn ($c) => $c->requirement->name),
            'enrollments' => $this->student->enrollments()->with('approver')->orderByDesc('created_at')->get(),
            'allVerified' => $this->student->hasAllRequiredCredentialsVerified(),
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-5xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div>
            <a href="{{ route('students.index') }}" wire:navigate class="text-sm text-indigo-600 hover:underline">&larr; Back to students</a>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mt-1">
                {{ $student->fullName() }}
                <span class="text-sm font-normal text-gray-500 dark:text-gray-400">({{ $student->student_number }})</span>
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ $student->program->name }} &middot; {{ $student->curriculum->version_label }} &middot;
                <span class="capitalize">{{ $student->status }}</span>
            </p>
        </div>

        @if ($flash)
            <div class="rounded-md bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm px-4 py-3">{{ $flash }}</div>
        @endif
        @if ($flashError)
            <div class="rounded-md bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3">{{ $flashError }}</div>
        @endif

        <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 class="font-medium text-gray-900 dark:text-gray-100">Credential checklist</h3>
                @unless ($allVerified)
                    <span class="text-xs text-yellow-700 dark:text-yellow-400">Not all required credentials are verified yet</span>
                @endunless
            </div>
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Requirement</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @foreach ($credentials as $credential)
                        <tr wire:key="credential-{{ $credential->id }}">
                            <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                {{ $credential->requirement->name }}
                                @unless ($credential->requirement->is_required)
                                    <span class="text-xs text-gray-400">(optional)</span>
                                @endunless
                            </td>
                            <td class="px-6 py-4 text-sm">
                                <span @class([
                                    'px-2 py-1 text-xs rounded-full capitalize',
                                    'bg-gray-100 text-gray-600' => $credential->status === 'missing',
                                    'bg-yellow-100 text-yellow-800' => in_array($credential->status, ['submitted', 'under_review']),
                                    'bg-green-100 text-green-800' => $credential->status === 'verified',
                                    'bg-red-100 text-red-800' => in_array($credential->status, ['rejected', 'expired']),
                                ])>{{ $credential->status }}</span>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                {{ $credential->rejection_reason ?? $credential->remarks }}
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('verify', $credential)
                                    @if (in_array($credential->status, ['submitted', 'under_review']))
                                        <button wire:click="verify({{ $credential->id }})" class="text-green-700 hover:underline">Verify</button>
                                        <button wire:click="startReject({{ $credential->id }})" class="text-red-600 hover:underline">Reject</button>
                                    @endif
                                @endcan
                            </td>
                        </tr>
                        @if ($rejecting === $credential->id)
                            <tr>
                                <td colspan="4" class="px-6 py-4 bg-gray-50 dark:bg-gray-900">
                                    <form wire:submit="confirmReject" class="flex items-start gap-3">
                                        <div class="flex-1">
                                            <x-input-label value="Rejection reason" />
                                            <x-text-input wire:model="rejectionReason" class="block mt-1 w-full" />
                                            <x-input-error :messages="$errors->get('rejectionReason')" class="mt-2" />
                                        </div>
                                        <x-primary-button type="submit" class="mt-6">Confirm</x-primary-button>
                                        <x-secondary-button type="button" wire:click="$set('rejecting', null)" class="mt-6">Cancel</x-secondary-button>
                                    </form>
                                </td>
                            </tr>
                        @endif
                    @endforeach
                </tbody>
            </table>
        </div>

        <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 class="font-medium text-gray-900 dark:text-gray-100">Enrollment</h3>
                @can('create', Enrollment::class)
                    @unless ($showEnrollForm)
                        <x-secondary-button wire:click="startEnroll">New term</x-secondary-button>
                    @endunless
                @endcan
            </div>

            @if ($showEnrollForm)
                <form wire:submit="saveEnrollment" class="p-6 grid grid-cols-1 sm:grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <x-input-label for="school_year" value="School year" />
                        <x-text-input wire:model="school_year" id="school_year" class="block mt-1 w-full" placeholder="2026-2027" />
                        <x-input-error :messages="$errors->get('school_year')" class="mt-2" />
                    </div>
                    <div>
                        <x-input-label for="semester" value="Semester" />
                        <select wire:model="semester" id="semester" class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                            <option value="1">1st</option>
                            <option value="2">2nd</option>
                        </select>
                    </div>
                    <div>
                        <x-input-label for="year_level" value="Year level" />
                        <select wire:model="year_level" id="year_level" class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                            <option value="1">1st year</option>
                            <option value="2">2nd year</option>
                            <option value="3">3rd year</option>
                        </select>
                    </div>
                    <div class="flex items-end gap-3">
                        <x-primary-button type="submit">Create</x-primary-button>
                        <x-secondary-button type="button" wire:click="$set('showEnrollForm', false)">Cancel</x-secondary-button>
                    </div>
                </form>
            @endif

            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Term</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($enrollments as $enrollment)
                        <tr wire:key="enrollment-{{ $enrollment->id }}">
                            <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                {{ $enrollment->school_year }} &middot; {{ $enrollment->semester === 1 ? '1st' : '2nd' }} sem &middot; Yr {{ $enrollment->year_level }}
                            </td>
                            <td class="px-6 py-4 text-sm">
                                <span @class([
                                    'px-2 py-1 text-xs rounded-full capitalize',
                                    'bg-yellow-100 text-yellow-800' => $enrollment->status === 'pending',
                                    'bg-green-100 text-green-800' => $enrollment->status === 'enrolled',
                                    'bg-gray-100 text-gray-600' => $enrollment->status === 'dropped',
                                ])>{{ $enrollment->status }}</span>
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('transition', $enrollment)
                                    @if ($enrollment->status === 'pending')
                                        <button wire:click="confirmEnrollment({{ $enrollment->id }})" class="text-green-700 hover:underline">Confirm enrollment</button>
                                        <button wire:click="startDrop({{ $enrollment->id }})" class="text-red-600 hover:underline">Drop</button>
                                    @elseif ($enrollment->status === 'enrolled')
                                        <button wire:click="startDrop({{ $enrollment->id }})" class="text-red-600 hover:underline">Drop</button>
                                    @endif
                                @endcan
                            </td>
                        </tr>
                        @if ($dropping === $enrollment->id)
                            <tr>
                                <td colspan="3" class="px-6 py-4 bg-gray-50 dark:bg-gray-900">
                                    <form wire:submit="confirmDrop" class="flex items-start gap-3">
                                        <div class="flex-1">
                                            <x-input-label value="Reason for dropping" />
                                            <x-text-input wire:model="dropReason" class="block mt-1 w-full" />
                                            <x-input-error :messages="$errors->get('dropReason')" class="mt-2" />
                                        </div>
                                        <x-primary-button type="submit" class="mt-6">Confirm</x-primary-button>
                                        <x-secondary-button type="button" wire:click="$set('dropping', null)" class="mt-6">Cancel</x-secondary-button>
                                    </form>
                                </td>
                            </tr>
                        @endif
                    @empty
                        <tr>
                            <td colspan="3" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No enrollment terms yet.</td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>
