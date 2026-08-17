<?php

use App\Models\Application;
use App\Models\Program;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;
use Livewire\WithPagination;

new #[Layout('layouts.app')] class extends Component
{
    use WithPagination;

    public string $statusFilter = 'submitted';

    public bool $showForm = false;

    public string $first_name = '';
    public string $middle_name = '';
    public string $last_name = '';
    public string $email = '';
    public string $phone = '';
    public string $date_of_birth = '';
    public ?int $program_id = null;

    public ?int $returning = null;
    public string $returnReason = '';

    public ?string $flash = null;
    public ?string $flashError = null;

    public function mount(): void
    {
        $this->authorize('viewAny', Application::class);
    }

    public function create(): void
    {
        $this->authorize('create', Application::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize('create', Application::class);

        $data = $this->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'date_of_birth' => ['nullable', 'date'],
            'program_id' => ['required', 'exists:programs,id'],
        ]);

        Application::create($data + ['status' => 'submitted']);

        $this->resetForm();
        $this->showForm = false;
        $this->flash = 'Application recorded.';
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    public function approve(Application $application): void
    {
        $this->authorize('review', $application);

        try {
            $student = $application->approve();
            $this->flash = "Approved — student number {$student->student_number} created.";
        } catch (\RuntimeException $e) {
            $this->flashError = $e->getMessage();
        }
    }

    public function startReturn(int $applicationId): void
    {
        $this->returning = $applicationId;
        $this->returnReason = '';
    }

    public function confirmReturn(): void
    {
        $application = Application::findOrFail($this->returning);
        $this->authorize('review', $application);

        $this->validate(['returnReason' => ['required', 'string', 'max:500']]);

        $application->returnToApplicant($this->returnReason);

        $this->returning = null;
        $this->returnReason = '';
        $this->flash = 'Application returned to applicant.';
    }

    private function resetForm(): void
    {
        $this->first_name = '';
        $this->middle_name = '';
        $this->last_name = '';
        $this->email = '';
        $this->phone = '';
        $this->date_of_birth = '';
        $this->program_id = null;
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'applications' => Application::with(['program', 'student'])
                ->when($this->statusFilter, fn ($q) => $q->where('status', $this->statusFilter))
                ->orderByDesc('created_at')
                ->paginate(10),
            'programs' => Program::where('is_active', true)->orderBy('name')->get(),
        ];
    }
}; ?>

<div class="py-12">
    <div class="max-w-6xl mx-auto sm:px-6 lg:px-8 space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">Applications</h2>

            @can('create', Application::class)
                @unless ($showForm)
                    <x-primary-button wire:click="create">New Application</x-primary-button>
                @endunless
            @endcan
        </div>

        @if ($flash)
            <div class="rounded-md bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm px-4 py-3">{{ $flash }}</div>
        @endif
        @if ($flashError)
            <div class="rounded-md bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3">{{ $flashError }}</div>
        @endif

        @if ($showForm)
            <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg p-6">
                <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-4">New Application</h3>

                <form wire:submit="save" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <x-input-label for="first_name" value="First name" />
                            <x-text-input wire:model="first_name" id="first_name" class="block mt-1 w-full" />
                            <x-input-error :messages="$errors->get('first_name')" class="mt-2" />
                        </div>
                        <div>
                            <x-input-label for="middle_name" value="Middle name" />
                            <x-text-input wire:model="middle_name" id="middle_name" class="block mt-1 w-full" />
                        </div>
                        <div>
                            <x-input-label for="last_name" value="Last name" />
                            <x-text-input wire:model="last_name" id="last_name" class="block mt-1 w-full" />
                            <x-input-error :messages="$errors->get('last_name')" class="mt-2" />
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                            <x-input-label for="email" value="Email" />
                            <x-text-input wire:model="email" id="email" type="email" class="block mt-1 w-full" />
                        </div>
                        <div>
                            <x-input-label for="phone" value="Phone" />
                            <x-text-input wire:model="phone" id="phone" class="block mt-1 w-full" />
                        </div>
                        <div>
                            <x-input-label for="date_of_birth" value="Date of birth" />
                            <x-text-input wire:model="date_of_birth" id="date_of_birth" type="date" class="block mt-1 w-full" />
                        </div>
                        <div>
                            <x-input-label for="program_id" value="Program applied for" />
                            <select wire:model="program_id" id="program_id"
                                class="block mt-1 w-full border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 rounded-md shadow-sm">
                                <option value="">Select&hellip;</option>
                                @foreach ($programs as $p)
                                    <option value="{{ $p->id }}">{{ $p->name }}</option>
                                @endforeach
                            </select>
                            <x-input-error :messages="$errors->get('program_id')" class="mt-2" />
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <x-primary-button type="submit">Save</x-primary-button>
                        <x-secondary-button type="button" wire:click="cancel">Cancel</x-secondary-button>
                    </div>
                </form>
            </div>
        @endif

        <div class="flex gap-2">
            @foreach (['submitted' => 'Submitted', 'approved' => 'Approved', 'returned' => 'Returned', '' => 'All'] as $value => $label)
                <button wire:click="$set('statusFilter', '{{ $value }}')"
                    @class([
                        'px-3 py-1.5 text-xs rounded-full border',
                        'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900' => $statusFilter === $value,
                        'text-gray-600 border-gray-300 dark:text-gray-300 dark:border-gray-700' => $statusFilter !== $value,
                    ])>{{ $label }}</button>
            @endforeach
        </div>

        <div class="bg-white dark:bg-gray-800 shadow-sm sm:rounded-lg overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Applicant</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Program</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Submitted</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    @forelse ($applications as $application)
                        <tr wire:key="application-{{ $application->id }}">
                            <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{{ $application->fullName() }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $application->program->code }}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{{ $application->created_at->format('M j, Y') }}</td>
                            <td class="px-6 py-4 text-sm">
                                <span @class([
                                    'px-2 py-1 text-xs rounded-full capitalize',
                                    'bg-yellow-100 text-yellow-800' => $application->status === 'submitted',
                                    'bg-green-100 text-green-800' => $application->status === 'approved',
                                    'bg-gray-100 text-gray-600' => $application->status === 'returned',
                                ])>{{ $application->status }}</span>
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3">
                                @can('review', $application)
                                    @if ($application->status === 'submitted')
                                        <button wire:click="approve({{ $application->id }})"
                                            wire:confirm="Approve this application and create the student record?"
                                            class="text-green-700 hover:underline">Approve</button>
                                        <button wire:click="startReturn({{ $application->id }})" class="text-red-600 hover:underline">Return</button>
                                    @endif
                                @endcan
                                @if ($application->student)
                                    <a href="{{ route('enrollment.show', $application->student) }}" wire:navigate class="text-indigo-600 hover:underline">View student</a>
                                @endif
                            </td>
                        </tr>

                        @if ($returning === $application->id)
                            <tr>
                                <td colspan="5" class="px-6 py-4 bg-gray-50 dark:bg-gray-900">
                                    <form wire:submit="confirmReturn" class="flex items-start gap-3">
                                        <div class="flex-1">
                                            <x-input-label value="Reason for returning to applicant" />
                                            <x-text-input wire:model="returnReason" class="block mt-1 w-full" placeholder="e.g. missing supporting information" />
                                            <x-input-error :messages="$errors->get('returnReason')" class="mt-2" />
                                        </div>
                                        <x-primary-button type="submit" class="mt-6">Confirm</x-primary-button>
                                        <x-secondary-button type="button" wire:click="$set('returning', null)" class="mt-6">Cancel</x-secondary-button>
                                    </form>
                                </td>
                            </tr>
                        @endif
                    @empty
                        <tr>
                            <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No applications found.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>

            <div class="px-6 py-4">
                {{ $applications->links() }}
            </div>
        </div>
    </div>
</div>
