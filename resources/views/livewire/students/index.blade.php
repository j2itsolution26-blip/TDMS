<?php

use App\Models\Program;
use App\Models\Student;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;
use Livewire\WithPagination;

new #[Layout('layouts.app')] class extends Component
{
    use WithPagination;

    public string $search = '';

    public bool $showForm = false;
    public ?Student $editing = null;

    public string $first_name = '';
    public string $middle_name = '';
    public string $last_name = '';
    public string $email = '';
    public string $phone = '';
    public string $date_of_birth = '';
    public ?int $program_id = null;
    public ?int $curriculum_id = null;
    public int $year_level = 1;
    public string $status = 'active';

    public function mount(): void
    {
        $this->authorize('viewAny', Student::class);
    }

    public function updatingSearch(): void
    {
        $this->resetPage();
    }

    public function create(): void
    {
        $this->authorize('create', Student::class);
        $this->resetForm();
        $this->showForm = true;
    }

    public function edit(Student $student): void
    {
        $this->authorize('update', $student);
        $this->editing = $student;
        $this->first_name = $student->first_name;
        $this->middle_name = (string) $student->middle_name;
        $this->last_name = $student->last_name;
        $this->email = (string) $student->email;
        $this->phone = (string) $student->phone;
        $this->date_of_birth = $student->date_of_birth?->format('Y-m-d') ?? '';
        $this->program_id = $student->program_id;
        $this->curriculum_id = $student->curriculum_id;
        $this->year_level = $student->year_level;
        $this->status = $student->status;
        $this->showForm = true;
    }

    public function save(): void
    {
        $this->authorize($this->editing ? 'update' : 'create', $this->editing ?? Student::class);

        $data = $this->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'date_of_birth' => ['nullable', 'date'],
            'program_id' => ['required', 'exists:programs,id'],
            'curriculum_id' => [
                'required',
                Rule::exists('curricula', 'id')->where('program_id', $this->program_id),
            ],
            'year_level' => ['required', 'integer', 'min:1', 'max:4'],
            'status' => ['required', 'in:applicant,active,transferred,archived,graduated'],
        ]);

        if ($this->editing) {
            $this->editing->update($data);
        } else {
            $data['student_number'] = Student::nextStudentNumber();
            $data['enrollment_date'] = now()->toDateString();
            Student::create($data);
        }

        $this->resetForm();
        $this->showForm = false;
    }

    public function cancel(): void
    {
        $this->resetForm();
        $this->showForm = false;
    }

    private function resetForm(): void
    {
        $this->editing = null;
        $this->first_name = '';
        $this->middle_name = '';
        $this->last_name = '';
        $this->email = '';
        $this->phone = '';
        $this->date_of_birth = '';
        $this->program_id = null;
        $this->curriculum_id = null;
        $this->year_level = 1;
        $this->status = 'active';
        $this->resetErrorBag();
    }

    public function with(): array
    {
        return [
            'students' => Student::with(['program', 'curriculum'])
                ->when($this->search, fn ($q) => $q->where(fn ($q) => $q
                    ->where('student_number', 'like', "%{$this->search}%")
                    ->orWhere('first_name', 'like', "%{$this->search}%")
                    ->orWhere('last_name', 'like', "%{$this->search}%")
                ))
                ->orderByDesc('created_at')
                ->paginate(10),
            'programs' => Program::where('is_active', true)->orderBy('name')->get(),
            'curricula' => $this->program_id
                ? \App\Models\Curriculum::where('program_id', $this->program_id)->where('is_active', true)->orderByDesc('effective_school_year')->get()
                : collect(),
        ];
    }
}; ?>

<div class="space-y-6">
    <x-page-header title="Students" subtitle="Manage student records, programs, and status.">
        @can('create', Student::class)
            <x-slot name="actions">
                @unless ($showForm)
                    <x-primary-button wire:click="create">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        New Student
                    </x-primary-button>
                @endunless
            </x-slot>
        @endcan
    </x-page-header>

    @if ($showForm)
        <x-card>
            <h3 class="font-semibold text-navy-900 mb-4">
                {{ $editing ? 'Edit Student' : 'New Student' }}
            </h3>

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
                        <x-input-error :messages="$errors->get('middle_name')" class="mt-2" />
                    </div>
                    <div>
                        <x-input-label for="last_name" value="Last name" />
                        <x-text-input wire:model="last_name" id="last_name" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('last_name')" class="mt-2" />
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <x-input-label for="email" value="Email" />
                        <x-text-input wire:model="email" id="email" type="email" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('email')" class="mt-2" />
                    </div>
                    <div>
                        <x-input-label for="phone" value="Phone" />
                        <x-text-input wire:model="phone" id="phone" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('phone')" class="mt-2" />
                    </div>
                    <div>
                        <x-input-label for="date_of_birth" value="Date of birth" />
                        <x-text-input wire:model="date_of_birth" id="date_of_birth" type="date" class="block mt-1 w-full" />
                        <x-input-error :messages="$errors->get('date_of_birth')" class="mt-2" />
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                        <x-input-label for="program_id" value="Program" />
                        <select wire:model.live="program_id" id="program_id"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">Select&hellip;</option>
                            @foreach ($programs as $p)
                                <option value="{{ $p->id }}">{{ $p->name }}</option>
                            @endforeach
                        </select>
                        <x-input-error :messages="$errors->get('program_id')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="curriculum_id" value="Curriculum version" />
                        <select wire:model="curriculum_id" id="curriculum_id"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="">Select&hellip;</option>
                            @foreach ($curricula as $c)
                                <option value="{{ $c->id }}">{{ $c->version_label }} ({{ $c->effective_school_year }})</option>
                            @endforeach
                        </select>
                        <x-input-error :messages="$errors->get('curriculum_id')" class="mt-2" />
                    </div>

                    <div>
                        <x-input-label for="year_level" value="Year level" />
                        <select wire:model="year_level" id="year_level"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="1">1st year</option>
                            <option value="2">2nd year</option>
                            <option value="3">3rd year</option>
                        </select>
                    </div>

                    <div>
                        <x-input-label for="status" value="Status" />
                        <select wire:model="status" id="status"
                            class="block mt-1 w-full border-slate-300 rounded-lg shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="active">Active</option>
                            <option value="transferred">Transferred</option>
                            <option value="archived">Archived</option>
                            <option value="graduated">Graduated</option>
                        </select>
                    </div>
                </div>

                @unless ($editing)
                    <p class="text-xs text-slate-500">
                        A student number is assigned automatically on save.
                    </p>
                @endunless

                <div class="flex items-center gap-3">
                    <x-primary-button type="submit">Save</x-primary-button>
                    <x-secondary-button type="button" wire:click="cancel">Cancel</x-secondary-button>
                </div>
            </form>
        </x-card>
    @endif

    <div class="relative w-full sm:w-80">
        <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
        <x-text-input wire:model.live.debounce.300ms="search" placeholder="Search by name or student number&hellip;" class="w-full pl-9" />
    </div>

    <x-card padding="p-0">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-border">
                <thead class="bg-slate-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student No.</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Program</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Yr</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th class="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    @forelse ($students as $student)
                        <tr wire:key="student-{{ $student->id }}" class="hover:bg-slate-50">
                            <td class="px-6 py-4 text-sm font-medium text-navy-900">{{ $student->student_number }}</td>
                            <td class="px-6 py-4 text-sm text-slate-700">{{ $student->fullName() }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $student->program->code }}</td>
                            <td class="px-6 py-4 text-sm text-slate-500">{{ $student->year_level }}</td>
                            <td class="px-6 py-4 text-sm">
                                <x-badge :status="$student->status" />
                            </td>
                            <td class="px-6 py-4 text-sm text-right space-x-3 whitespace-nowrap">
                                <a href="{{ route('enrollment.show', $student) }}" wire:navigate class="text-indigo-600 hover:text-indigo-700 font-medium">Enrollment</a>
                                @can('update', $student)
                                    <button wire:click="edit({{ $student->id }})" class="text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                                @endcan
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="6">
                                <x-empty-state title="No students found" description="There are currently no students matching your search." />
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($students->hasPages())
            <div class="px-6 py-4 border-t border-border">
                {{ $students->links() }}
            </div>
        @endif
    </x-card>
</div>
