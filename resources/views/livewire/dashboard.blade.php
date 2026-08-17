<?php

use App\Models\Application;
use App\Models\AuditLog;
use App\Models\CurriculumSubject;
use App\Models\Program;
use App\Models\Student;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.app')] class extends Component
{
    public function with(): array
    {
        $user = Auth::user();

        $canViewStudents = $user->can('viewAny', Student::class);
        $canViewPrograms = $user->can('viewAny', Program::class);
        $canViewStaff = $user->can('viewAny', User::class);
        $canViewApplications = $user->can('viewAny', Application::class);
        $isSuperAdmin = $user->hasRole('super_admin');

        $student = $user->student;

        return [
            'greeting' => $this->greeting(),
            'student' => $student,
            'mySubjects' => $student
                ? CurriculumSubject::where('curriculum_id', $student->curriculum_id)
                    ->where('year_level', $student->year_level)
                    ->with('subject')
                    ->orderBy('semester')
                    ->get()
                : collect(),
            'canViewStudents' => $canViewStudents,
            'canViewPrograms' => $canViewPrograms,
            'canViewStaff' => $canViewStaff,
            'canViewApplications' => $canViewApplications,
            'isSuperAdmin' => $isSuperAdmin,
            'stats' => [
                'totalStudents' => $canViewStudents ? Student::count() : null,
                'totalStudentsNew' => $canViewStudents ? Student::where('created_at', '>=', now()->subWeek())->count() : null,
                'programs' => $canViewPrograms ? Program::count() : null,
                'programsNew' => $canViewPrograms ? Program::where('created_at', '>=', now()->subWeek())->count() : null,
                'staff' => $canViewStaff ? User::whereHas('roles', fn ($q) => $q->where('name', '!=', 'student'))->count() : null,
                'staffNew' => $canViewStaff ? User::whereHas('roles', fn ($q) => $q->where('name', '!=', 'student'))->where('created_at', '>=', now()->subWeek())->count() : null,
                'activeApplications' => $canViewApplications ? Application::whereIn('status', ['submitted', 'returned'])->count() : null,
                'activeApplicationsLastWeek' => $canViewApplications ? Application::whereIn('status', ['submitted', 'returned'])->where('created_at', '<', now()->subWeek())->count() : null,
                'pendingApplications' => $canViewApplications ? Application::where('status', 'submitted')->count() : null,
                'enrolledStudents' => $canViewStudents ? Student::where('status', 'active')->count() : null,
                'credentialsToReview' => $user->can('viewAny', \App\Models\StudentCredential::class)
                    ? \App\Models\StudentCredential::whereIn('status', ['submitted'])->count()
                    : null,
            ],
            'applicationBreakdown' => $canViewApplications ? [
                'approved' => Application::where('status', 'approved')->count(),
                'submitted' => Application::where('status', 'submitted')->count(),
                'returned' => Application::where('status', 'returned')->count(),
            ] : null,
            'recentActivity' => $canViewStaff ? AuditLog::latest('created_at')->limit(6)->get() : collect(),
            'systemHealth' => $isSuperAdmin ? $this->systemHealth() : null,
        ];
    }

    private function greeting(): string
    {
        return match (true) {
            now()->hour < 12 => __('Good morning'),
            now()->hour < 18 => __('Good afternoon'),
            default => __('Good evening'),
        };
    }

    private function systemHealth(): array
    {
        $databaseHealthy = true;

        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $databaseHealthy = false;
        }

        $total = @disk_total_space(storage_path());
        $free = @disk_free_space(storage_path());
        $usedPercent = ($total && $free) ? (int) round((($total - $free) / $total) * 100) : null;

        return [
            'database' => $databaseHealthy,
            'storageUsedPercent' => $usedPercent,
        ];
    }
}; ?>

<div class="space-y-8">
    {{-- Welcome --}}
    <div>
        <h1 class="text-2xl sm:text-[28px] font-semibold text-navy-900 leading-tight">
            {{ $greeting }}, {{ explode(' ', auth()->user()->name)[0] }} 👋
        </h1>
        <p class="mt-1 text-sm text-slate-500">
            {{ __("Here's what's happening in your TDMS account today — ") }}{{ now()->format('l, F j, Y') }}.
        </p>
    </div>

    @if ($student)
        {{-- Student summary --}}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <x-card>
                <p class="text-sm text-slate-500">{{ __('Program') }}</p>
                <p class="mt-1 font-semibold text-navy-900">{{ $student->program?->name ?? __('Not assigned') }}</p>
            </x-card>
            <x-card>
                <p class="text-sm text-slate-500">{{ __('Year Level') }}</p>
                <p class="mt-1 font-semibold text-navy-900">{{ __(':n Year', ['n' => $student->year_level]) }}</p>
            </x-card>
            <x-card>
                <p class="text-sm text-slate-500">{{ __('Status') }}</p>
                <p class="mt-1"><x-badge :status="$student->status" /></p>
            </x-card>
        </div>

        <x-card padding="p-0">
            <div class="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 class="text-base font-semibold text-navy-900">{{ __('My Subjects') }}</h2>
                <a href="{{ route('enrollment.show', $student) }}" wire:navigate class="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    {{ __('View Enrollment') }}
                </a>
            </div>

            @if ($mySubjects->isEmpty())
                <x-empty-state :title="__('No subjects yet')" :description="__('Curriculum subjects for your year level will appear here once assigned.')" />
            @else
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-border">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{{ __('Subject') }}</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{{ __('Semester') }}</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{{ __('Units') }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            @foreach ($mySubjects as $cs)
                                <tr wire:key="my-subject-{{ $cs->id }}">
                                    <td class="px-6 py-3.5 text-sm font-medium text-navy-900">{{ $cs->subject->name ?? __('—') }}</td>
                                    <td class="px-6 py-3.5 text-sm text-slate-500">{{ $cs->semester }}</td>
                                    <td class="px-6 py-3.5 text-sm text-slate-500">{{ $cs->units }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </x-card>
    @endif

    @if ($canViewStudents || $canViewPrograms || $canViewStaff || $canViewApplications)
        {{-- KPI row 1 --}}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            @if ($canViewStudents)
                <x-stat-card :label="__('Total Students')" :value="$stats['totalStudents']" :change="$stats['totalStudentsNew'] ? __('+:n this week', ['n' => $stats['totalStudentsNew']]) : __('No change this week')" :trend="$stats['totalStudentsNew'] ? 'up' : null">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif

            @if ($canViewPrograms)
                <x-stat-card :label="__('Programs')" :value="$stats['programs']" :change="$stats['programsNew'] ? __('+:n this week', ['n' => $stats['programsNew']]) : __('No change this week')" :trend="$stats['programsNew'] ? 'up' : null" icon-bg="bg-blue-50" icon-color="text-blue-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347M8.288 14.212A5.25 5.25 0 1117.712 9.788a5.25 5.25 0 01-9.424 4.424z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif

            @if ($canViewStaff)
                <x-stat-card :label="__('Staff Members')" :value="$stats['staff']" :change="$stats['staffNew'] ? __('+:n this week', ['n' => $stats['staffNew']]) : __('No change this week')" :trend="$stats['staffNew'] ? 'up' : null" icon-bg="bg-amber-50" icon-color="text-amber-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif

            @if ($canViewApplications)
                <x-stat-card :label="__('Active Applications')" :value="$stats['activeApplications']" :change="__('Awaiting decision')" icon-bg="bg-indigo-50" icon-color="text-indigo-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif
        </div>

        {{-- KPI row 2 --}}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            @if ($canViewApplications)
                <x-stat-card :label="__('Pending Applications')" :value="$stats['pendingApplications']" icon-bg="bg-amber-50" icon-color="text-amber-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif

            @if ($canViewStudents)
                <x-stat-card :label="__('Enrolled Students')" :value="$stats['enrolledStudents']" icon-bg="bg-green-50" icon-color="text-green-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif

            @if ($stats['credentialsToReview'] !== null)
                <x-stat-card :label="__('Credentials to Review')" :value="$stats['credentialsToReview']" icon-bg="bg-red-50" icon-color="text-red-600">
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                    </x-slot>
                </x-stat-card>
            @endif
        </div>
    @endif

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
            @if ($canViewStaff)
                <x-card padding="p-0">
                    <div class="px-6 py-4 border-b border-border">
                        <h2 class="text-base font-semibold text-navy-900">{{ __('Recent Activity') }}</h2>
                    </div>

                    @if ($recentActivity->isEmpty())
                        <x-empty-state :title="__('No recent activity')" :description="__('System activity will appear here as it happens.')" />
                    @else
                        <ul class="divide-y divide-border">
                            @foreach ($recentActivity as $log)
                                <li class="px-6 py-4 flex gap-3">
                                    <span class="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                                    <div class="min-w-0">
                                        <p class="text-sm font-medium text-navy-900">{{ ucfirst(strtolower(str_replace('_', ' ', $log->action))) }}</p>
                                        <p class="text-sm text-slate-500 truncate">{{ $log->target }}</p>
                                        <p class="mt-0.5 text-xs text-slate-400">{{ $log->created_at->diffForHumans() }}</p>
                                    </div>
                                </li>
                            @endforeach
                        </ul>
                    @endif
                </x-card>
            @endif

            @if ($applicationBreakdown)
                @php
                    $total = array_sum($applicationBreakdown);
                    $pct = fn ($n) => $total > 0 ? round(($n / $total) * 100, 2) : 0;
                @endphp
                <x-card>
                    <h2 class="text-base font-semibold text-navy-900 mb-5">{{ __('Application Overview') }}</h2>

                    @if ($total === 0)
                        <x-empty-state :title="__('No applications yet')" />
                    @else
                        <div class="flex flex-col sm:flex-row items-center gap-8">
                            <div class="relative w-36 h-36 shrink-0 rounded-full" style="background: conic-gradient(#16A34A 0 {{ $pct($applicationBreakdown['approved']) }}%, #D97706 {{ $pct($applicationBreakdown['approved']) }}% {{ $pct($applicationBreakdown['approved']) + $pct($applicationBreakdown['submitted']) }}%, #DC2626 {{ $pct($applicationBreakdown['approved']) + $pct($applicationBreakdown['submitted']) }}% 100%);">
                                <div class="absolute inset-3 rounded-full bg-card flex flex-col items-center justify-center">
                                    <span class="text-2xl font-semibold text-navy-900">{{ $total }}</span>
                                    <span class="text-xs text-slate-500">{{ __('Total') }}</span>
                                </div>
                            </div>

                            <div class="flex-1 w-full space-y-3">
                                <div class="flex items-center justify-between text-sm">
                                    <span class="flex items-center gap-2 text-slate-600"><span class="w-2.5 h-2.5 rounded-full bg-green-600"></span>{{ __('Approved') }}</span>
                                    <span class="font-medium text-navy-900">{{ $applicationBreakdown['approved'] }}</span>
                                </div>
                                <div class="flex items-center justify-between text-sm">
                                    <span class="flex items-center gap-2 text-slate-600"><span class="w-2.5 h-2.5 rounded-full bg-amber-600"></span>{{ __('Pending') }}</span>
                                    <span class="font-medium text-navy-900">{{ $applicationBreakdown['submitted'] }}</span>
                                </div>
                                <div class="flex items-center justify-between text-sm">
                                    <span class="flex items-center gap-2 text-slate-600"><span class="w-2.5 h-2.5 rounded-full bg-red-600"></span>{{ __('Returned') }}</span>
                                    <span class="font-medium text-navy-900">{{ $applicationBreakdown['returned'] }}</span>
                                </div>
                            </div>
                        </div>
                    @endif
                </x-card>
            @endif
        </div>

        <div class="space-y-6">
            @if ($canViewStudents || $canViewApplications || $canViewStaff)
                <x-card>
                    <h2 class="text-base font-semibold text-navy-900 mb-4">{{ __('Quick Actions') }}</h2>
                    <div class="space-y-2">
                        @can('create', Student::class)
                            <a href="{{ route('students.index') }}" wire:navigate class="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                                <svg class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                {{ __('Add New Student') }}
                            </a>
                        @endcan
                        @can('create', User::class)
                            <a href="{{ route('staff.index') }}" wire:navigate class="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                                <svg class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                {{ __('Create Staff Account') }}
                            </a>
                        @endcan
                        @can('viewAny', Application::class)
                            <a href="{{ route('applications.index') }}" wire:navigate class="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                                <svg class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
                                {{ __('Manage Applications') }}
                            </a>
                        @endcan
                    </div>
                </x-card>
            @endif

            @if ($systemHealth)
                <x-card>
                    <h2 class="text-base font-semibold text-navy-900 mb-4">{{ __('System Health') }}</h2>
                    <div class="space-y-3 text-sm">
                        <div class="flex items-center justify-between">
                            <span class="text-slate-600">{{ __('Database') }}</span>
                            <x-badge :status="$systemHealth['database'] ? 'active' : 'failed'" :label="$systemHealth['database'] ? __('Healthy') : __('Down')" />
                        </div>
                        @if ($systemHealth['storageUsedPercent'] !== null)
                            <div class="flex items-center justify-between">
                                <span class="text-slate-600">{{ __('Storage') }}</span>
                                <span class="font-medium text-navy-900">{{ __(':pct% Used', ['pct' => $systemHealth['storageUsedPercent']]) }}</span>
                            </div>
                        @endif
                    </div>
                </x-card>
            @endif
        </div>
    </div>
</div>
