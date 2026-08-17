<x-app-layout>
    <x-slot name="header">
        <x-page-header title="Profile" subtitle="Manage your account information and security." />
    </x-slot>

    <div class="space-y-6 max-w-3xl">
        <x-card>
            <livewire:profile.update-profile-information-form />
        </x-card>

        <x-card>
            <livewire:profile.update-password-form />
        </x-card>

        <x-card>
            <livewire:profile.delete-user-form />
        </x-card>
    </div>
</x-app-layout>
