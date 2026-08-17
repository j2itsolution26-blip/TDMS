<?php

use Illuminate\Support\Facades\Route;
use Livewire\Volt\Volt;

Route::redirect('/', '/dashboard');

Route::view('dashboard', 'dashboard')
    ->middleware(['auth', 'verified'])
    ->name('dashboard');

Route::view('profile', 'profile')
    ->middleware(['auth'])
    ->name('profile');

Route::middleware(['auth', 'verified'])->group(function () {
    Volt::route('programs', 'programs.index')
        ->can('viewAny', App\Models\Program::class)
        ->name('programs.index');

    Volt::route('programs/{program}', 'programs.show')
        ->can('viewAny', App\Models\Program::class)
        ->name('programs.show');

    Volt::route('curricula/{curriculum}', 'curricula.show')
        ->can('viewAny', App\Models\Curriculum::class)
        ->name('curricula.show');

    Volt::route('subjects', 'subjects.index')
        ->can('viewAny', App\Models\Subject::class)
        ->name('subjects.index');

    Volt::route('students', 'students.index')
        ->can('viewAny', App\Models\Student::class)
        ->name('students.index');

    Volt::route('staff', 'staff.index')
        ->can('viewAny', App\Models\User::class)
        ->name('staff.index');

    Volt::route('applications', 'applications.index')
        ->can('viewAny', App\Models\Application::class)
        ->name('applications.index');

    Volt::route('students/{student}/enrollment', 'enrollment.show')
        ->can('viewAny', App\Models\Student::class)
        ->name('enrollment.show');
});

require __DIR__.'/auth.php';
