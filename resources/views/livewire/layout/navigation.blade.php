<?php

use App\Livewire\Actions\Logout;
use Livewire\Volt\Component;

new class extends Component
{
    /**
     * Log the current user out of the application.
     */
    public function logout(Logout $logout): void
    {
        $logout();

        $this->redirect('/', navigate: true);
    }
}; ?>

<div x-data="{ sidebarOpen: false }" @keydown.escape.window="sidebarOpen = false">
    {{-- Desktop sidebar --}}
    <aside class="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:flex-col bg-navy-900">
        <div class="flex items-center h-16 px-6 border-b border-white/10 shrink-0">
            <a href="{{ route('dashboard') }}" wire:navigate class="flex items-center gap-2">
                <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm">T</span>
                <x-application-logo class="text-lg text-white" />
            </a>
        </div>

        <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            <x-nav.sidebar-group>
                <x-nav.sidebar-link :href="route('dashboard')" :active="request()->routeIs('dashboard')" wire:navigate>
                    <x-slot name="icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
                    </x-slot>
                    {{ __('Dashboard') }}
                </x-nav.sidebar-link>

                @can('viewAny', App\Models\Program::class)
                    <x-nav.sidebar-link :href="route('programs.index')" :active="request()->routeIs('programs.*') || request()->routeIs('curricula.*')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443" /></svg>
                        </x-slot>
                        {{ __('Programs') }}
                    </x-nav.sidebar-link>
                @endcan

                @can('viewAny', App\Models\Subject::class)
                    <x-nav.sidebar-link :href="route('subjects.index')" :active="request()->routeIs('subjects.*')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                        </x-slot>
                        {{ __('Subjects') }}
                    </x-nav.sidebar-link>
                @endcan

                @can('viewAny', App\Models\Student::class)
                    <x-nav.sidebar-link :href="route('students.index')" :active="request()->routeIs('students.*') || request()->routeIs('enrollment.*')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        </x-slot>
                        {{ __('Students') }}
                    </x-nav.sidebar-link>
                @endcan

                @can('viewAny', App\Models\Application::class)
                    <x-nav.sidebar-link :href="route('applications.index')" :active="request()->routeIs('applications.*')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        </x-slot>
                        {{ __('Applications') }}
                    </x-nav.sidebar-link>
                @endcan

                @can('viewAny', App\Models\User::class)
                    <x-nav.sidebar-link :href="route('staff.index')" :active="request()->routeIs('staff.*')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </x-slot>
                        {{ __('Staff') }}
                    </x-nav.sidebar-link>
                @endcan
            </x-nav.sidebar-group>
        </nav>
    </aside>

    {{-- Mobile off-canvas sidebar --}}
    <div x-show="sidebarOpen" x-cloak class="lg:hidden fixed inset-0 z-50" style="display: none;">
        <div x-show="sidebarOpen" x-transition:enter="ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" x-transition:leave="ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0" class="fixed inset-0 bg-navy-900/60" @click="sidebarOpen = false"></div>

        <aside x-show="sidebarOpen" x-transition:enter="ease-out duration-200" x-transition:enter-start="-translate-x-full" x-transition:enter-end="translate-x-0" x-transition:leave="ease-in duration-150" x-transition:leave-start="translate-x-0" x-transition:leave-end="-translate-x-full" class="fixed inset-y-0 left-0 z-50 w-72 bg-navy-900 flex flex-col">
            <div class="flex items-center justify-between h-16 px-6 border-b border-white/10 shrink-0">
                <a href="{{ route('dashboard') }}" wire:navigate class="flex items-center gap-2" @click="sidebarOpen = false">
                    <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm">T</span>
                    <x-application-logo class="text-lg text-white" />
                </a>
                <button @click="sidebarOpen = false" class="p-2 rounded-lg text-slate-300 hover:bg-white/5" aria-label="{{ __('Close sidebar') }}">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6" @click="sidebarOpen = false">
                <x-nav.sidebar-group>
                    <x-nav.sidebar-link :href="route('dashboard')" :active="request()->routeIs('dashboard')" wire:navigate>
                        <x-slot name="icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
                        </x-slot>
                        {{ __('Dashboard') }}
                    </x-nav.sidebar-link>

                    @can('viewAny', App\Models\Program::class)
                        <x-nav.sidebar-link :href="route('programs.index')" :active="request()->routeIs('programs.*') || request()->routeIs('curricula.*')" wire:navigate>
                            <x-slot name="icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443" /></svg>
                            </x-slot>
                            {{ __('Programs') }}
                        </x-nav.sidebar-link>
                    @endcan

                    @can('viewAny', App\Models\Subject::class)
                        <x-nav.sidebar-link :href="route('subjects.index')" :active="request()->routeIs('subjects.*')" wire:navigate>
                            <x-slot name="icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                            </x-slot>
                            {{ __('Subjects') }}
                        </x-nav.sidebar-link>
                    @endcan

                    @can('viewAny', App\Models\Student::class)
                        <x-nav.sidebar-link :href="route('students.index')" :active="request()->routeIs('students.*') || request()->routeIs('enrollment.*')" wire:navigate>
                            <x-slot name="icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                            </x-slot>
                            {{ __('Students') }}
                        </x-nav.sidebar-link>
                    @endcan

                    @can('viewAny', App\Models\Application::class)
                        <x-nav.sidebar-link :href="route('applications.index')" :active="request()->routeIs('applications.*')" wire:navigate>
                            <x-slot name="icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                            </x-slot>
                            {{ __('Applications') }}
                        </x-nav.sidebar-link>
                    @endcan

                    @can('viewAny', App\Models\User::class)
                        <x-nav.sidebar-link :href="route('staff.index')" :active="request()->routeIs('staff.*')" wire:navigate>
                            <x-slot name="icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </x-slot>
                            {{ __('Staff') }}
                        </x-nav.sidebar-link>
                    @endcan
                </x-nav.sidebar-group>
            </nav>
        </aside>
    </div>

    {{-- Topbar --}}
    <header class="sticky top-0 z-30 lg:pl-64 bg-white border-b border-border">
        <div class="flex items-center h-16 px-4 sm:px-6 gap-4">
            <button @click="sidebarOpen = true" class="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="{{ __('Open sidebar') }}">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" /></svg>
            </button>

            <div class="hidden sm:flex flex-1 max-w-md">
                <div class="relative w-full">
                    <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input type="search" placeholder="{{ __('Search anything…') }}" class="w-full rounded-lg border-slate-300 bg-slate-50 pl-9 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white" />
                </div>
            </div>

            <div class="flex-1 sm:hidden"></div>

            <div class="flex items-center gap-2 sm:gap-4">
                <button class="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="{{ __('Notifications') }}">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                </button>

                <x-dropdown align="right" width="56">
                    <x-slot name="trigger">
                        <button class="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100">
                            <x-avatar :name="auth()->user()->name" />
                            <span class="hidden md:block text-left">
                                <span class="block text-sm font-medium text-navy-900 leading-tight">{{ auth()->user()->name }}</span>
                                <span class="block text-xs text-slate-500 leading-tight capitalize">{{ auth()->user()->getRoleNames()->first() ? str_replace('_', ' ', auth()->user()->getRoleNames()->first()) : __('No role') }}</span>
                            </span>
                            <svg class="hidden md:block w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
                        </button>
                    </x-slot>

                    <x-slot name="content">
                        <div class="px-4 py-2 border-b border-slate-100">
                            <p class="text-sm font-medium text-navy-900 truncate">{{ auth()->user()->name }}</p>
                            <p class="text-xs text-slate-500 truncate">{{ auth()->user()->email }}</p>
                        </div>

                        <x-dropdown-link :href="route('profile')" wire:navigate>
                            {{ __('My Profile') }}
                        </x-dropdown-link>

                        <button wire:click="logout" class="w-full text-start">
                            <x-dropdown-link>
                                {{ __('Sign Out') }}
                            </x-dropdown-link>
                        </button>
                    </x-slot>
                </x-dropdown>
            </div>
        </div>
    </header>
</div>
