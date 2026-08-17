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

<div class="space-y-6">
    <x-page-header title="Applications" subtitle="Review, approve, or return admission applications.">
        @can('create', Application::class)
            <x-slot name="actions">
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Application
                    </x-primary-button>
                @endunless
            </x-slot>
        @endcan
    </x-page-header>

    @if ($flash)
        <x-alert type="success">{{ $flash }}</x-alert>
    @endif
    @if ($flashError)
        <x-alert type="danger">{{ $flashError }}</x-alert>
    @endif

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">New Application</h3>

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
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
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
        </x-card>
    @endif

    <div class="flex flex-wrap gap-2">
        @foreach (['submitted' => 'Submitted', 'approved' => 'Approved', 'returned' => 'Returned', '' => 'All'] as $value => $label)
            <button wire:click="$set('statusFilter', '{{ $value }}')"
                @class([
                    'px-3 py-1.5 text-xs font-medium rounded-full border transition',
                    'bg-navy-900 text-white border-navy-900' => $statusFilter === $value,
                    'text-slate-600 border-slate-300 hover:bg-slate-50' => $statusFilter !== $value,
                ])>{{ $label }}</button>
        @endforeach
    </div>

    <x-card padding="p-0">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Applicant</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Program</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Submitted</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($applications as $application)
                        <tr wire:key="application-{{ $application->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm font-medium text-navy-900">{{ $application->fullName() }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $application->program->code }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $application->created_at->format('M j, Y') }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$application->status" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                @can('review', $application)
                                    @if ($application->status === 'submitted')
                                        <button wire:click="approve({{ $application->id }})"
                                            wire:confirm="Approve this application and create the student record?"
                                            class="text-green-700 hover:text-green-800 font-medium">Approve</button>
                                        <button wire:click="startReturn({{ $application->id }})" class="text-red-600 hover:text-red-700 font-medium">Return</button>
                                    @endif
                                @endcan
                                @if ($application->student)
                                    <a href="{{ route('enrollment.show', $application->student) }}" wire:navigate class="text-indigo-600 hover:text-indigo-700 font-medium">View student</a>
                                @endif
                            </td>
                        </tr>

                        @if ($returning === $application->id)
                            <tr>
                                <td colspan="5" class="px-6 py-4 bg-slate-50">
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
                            <td colspan="5">
                                <x-empty-state title="No applications found" description="There are currently no applications matching your filters." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($applications->hasPages())
            <div class="px-6 py-4 border-t border-border">
                {{ $applications->links() }}
            </div>
        @endif
    </x-card>
</div>
