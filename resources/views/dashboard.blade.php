<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">
            {{ __('Dashboard') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-lg">
                <div class="p-6 text-gray-900 dark:text-gray-100">
                    <p>{{ __('Welcome, :name.', ['name' => auth()->user()->name]) }}</p>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {{ __('Role(s):') }} {{ auth()->user()->getRoleNames()->join(', ') ?: __('none assigned') }}
                    </p>
                    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        {{ __('Role-specific dashboards are built in later milestones.') }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</x-app-layout>
