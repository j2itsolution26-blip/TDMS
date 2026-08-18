<?php

use App\Services\SuperAdminBootstrapService;
use Illuminate\Support\Facades\Session;
use Illuminate\Validation\Rules\Password;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

new #[Layout('layouts.auth-branded')] class extends Component
{
    public string $name = '';
    public string $email = '';
    public string $password = '';
    public string $password_confirmation = '';

    public function mount(SuperAdminBootstrapService $bootstrapService): void
    {
        if (! $bootstrapService->isBootstrapAllowed()) {
            Session::flash('status', 'Super Admin setup has already been completed. Please log in using the existing administrator account.');
            $this->redirect(route('login', absolute: false), navigate: true);
        }
    }

    /**
     * Create the one-time Super Admin account.
     */
    public function createSuperAdmin(SuperAdminBootstrapService $bootstrapService): void
    {
        $validated = $this->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:users,email'],
            'password' => [
                'required', 'string', 'confirmed',
                Password::min(8)->mixedCase()->numbers()->symbols(),
            ],
        ]);

        try {
            $bootstrapService->createSuperAdmin(
                data: [
                    'name' => $validated['name'],
                    'email' => $validated['email'],
                    'password' => $validated['password'],
                ],
                ip: request()->ip(),
                userAgent: request()->userAgent(),
            );

            Session::flash('status', 'Super Admin Created Successfully. Please sign in with your new account.');

            $this->redirect(route('login', absolute: false), navigate: true);
        } catch (\Throwable $e) {
            $this->addError('email', $e->getMessage());
        }
    }
}; ?>

<div>
    <div class="panel__status">
        <x-auth-session-status :status="session('status')" />
    </div>

    <div class="tdms-setup-notice">
        <div class="tdms-setup-notice__badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>One-Time System Setup</span>
        </div>
        <p class="tdms-setup-notice__text">
            Configure the primary <strong>Super Admin</strong> account. This option is permanently locked once the account is created.
        </p>
    </div>

    <form wire:submit="createSuperAdmin">
        <!-- Full Name -->
        <div class="tdms-field">
            <label for="name">Full Name</label>
            <div class="tdms-input-wrap">
                <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input
                    wire:model="name"
                    id="name"
                    type="text"
                    name="name"
                    required
                    autofocus
                    autocomplete="name"
                    placeholder="Enter your full name"
                >
            </div>
            <x-input-error :messages="$errors->get('name')" class="mt-2" />
        </div>

        <!-- Email Address -->
        <div class="tdms-field">
            <label for="email">Email Address</label>
            <div class="tdms-input-wrap">
                <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <input
                    wire:model="email"
                    id="email"
                    type="email"
                    name="email"
                    required
                    autocomplete="email"
                    placeholder="admin@example.com"
                >
            </div>
            <x-input-error :messages="$errors->get('email')" class="mt-2" />
        </div>

        <!-- Password + Confirm Password: shared Alpine scope so the live
             requirement checklist and match indicator can react to both
             fields instantly, purely client-side (no server round-trip). -->
        <div x-data="{
            password: '',
            passwordConfirmation: '',
            showPassword: false,
            showConfirmPassword: false,
            get hasLength() { return this.password.length >= 8 },
            get hasUpperLower() { return /[A-Z]/.test(this.password) && /[a-z]/.test(this.password) },
            get hasNumber() { return /[0-9]/.test(this.password) },
            get hasSpecial() { return /[^A-Za-z0-9]/.test(this.password) },
            get passwordsMatch() { return this.passwordConfirmation.length > 0 && this.password === this.passwordConfirmation }
        }">
            <!-- Password -->
            <div class="tdms-field">
                <label for="password">Password</label>
                <div class="tdms-input-wrap">
                    <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    <input
                        wire:model="password"
                        id="password"
                        type="password"
                        :type="showPassword ? 'text' : 'password'"
                        name="password"
                        required
                        autocomplete="new-password"
                        placeholder="Create a strong password (min 8 chars)"
                        style="padding-right: 2.75rem;"
                        @input="password = $event.target.value"
                    >
                    <button
                        type="button"
                        class="tdms-toggle-visibility"
                        @click="showPassword = !showPassword"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    >
                        <svg x-show="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg x-show="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22"/><path d="M9.5 9.5a3 3 0 0 0 4.24 4.24"/></svg>
                    </button>
                </div>
                <x-input-error :messages="$errors->get('password')" class="mt-2" />

                <ul class="tdms-password-requirements" aria-live="polite">
                    <li :class="{ 'is-met': hasLength }">
                        <span class="tdms-req-icon" x-text="hasLength ? '✓' : '○'" aria-hidden="true"></span>
                        At least 8 characters
                    </li>
                    <li :class="{ 'is-met': hasUpperLower }">
                        <span class="tdms-req-icon" x-text="hasUpperLower ? '✓' : '○'" aria-hidden="true"></span>
                        Uppercase and lowercase letters
                    </li>
                    <li :class="{ 'is-met': hasNumber }">
                        <span class="tdms-req-icon" x-text="hasNumber ? '✓' : '○'" aria-hidden="true"></span>
                        Number
                    </li>
                    <li :class="{ 'is-met': hasSpecial }">
                        <span class="tdms-req-icon" x-text="hasSpecial ? '✓' : '○'" aria-hidden="true"></span>
                        Special character
                    </li>
                </ul>
            </div>

            <!-- Confirm Password -->
            <div class="tdms-field">
                <label for="password_confirmation">Confirm Password</label>
                <div class="tdms-input-wrap">
                    <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    <input
                        wire:model="password_confirmation"
                        id="password_confirmation"
                        type="password"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        name="password_confirmation"
                        required
                        autocomplete="new-password"
                        placeholder="Re-enter your password"
                        style="padding-right: 2.75rem;"
                        @input="passwordConfirmation = $event.target.value"
                    >
                    <button
                        type="button"
                        class="tdms-toggle-visibility"
                        @click="showConfirmPassword = !showConfirmPassword"
                        :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'"
                    >
                        <svg x-show="!showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg x-show="showConfirmPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22"/><path d="M9.5 9.5a3 3 0 0 0 4.24 4.24"/></svg>
                    </button>
                </div>
                <x-input-error :messages="$errors->get('password_confirmation')" class="mt-2" />

                <p class="tdms-password-match" :class="{ 'is-met': passwordsMatch }" x-show="passwordConfirmation.length > 0" x-cloak>
                    <span x-text="passwordsMatch ? '✓' : '○'" aria-hidden="true"></span>
                    <span x-text="passwordsMatch ? 'Passwords match' : 'Passwords do not match yet'"></span>
                </p>
            </div>
        </div>

        <div class="mt-4">
            <button type="submit" class="tdms-submit" wire:loading.attr="disabled" wire:target="createSuperAdmin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span wire:loading.remove wire:target="createSuperAdmin">Complete Super Admin Setup</span>
                <span wire:loading wire:target="createSuperAdmin">Creating Account&hellip;</span>
            </button>
        </div>

        <div class="text-center mt-4">
            <a href="{{ route('login') }}" class="tdms-forgot text-sm inline-flex items-center gap-1.5" wire:navigate>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
                Back to Login
            </a>
        </div>
    </form>
</div>
