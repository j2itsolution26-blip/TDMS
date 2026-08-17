<?php

use App\Livewire\Forms\LoginForm;
use Illuminate\Support\Facades\Session;
use Livewire\Attributes\Layout;
use Livewire\Volt\Component;

use App\Services\SuperAdminBootstrapService;

new #[Layout('layouts.auth-branded')] class extends Component
{
    public LoginForm $form;

    /**
     * Handle an incoming authentication request.
     */
    public function login(): void
    {
        $this->validate();

        $this->form->authenticate();

        Session::regenerate();

        $this->redirectIntended(default: route('dashboard', absolute: false), navigate: true);
    }

    public function with(SuperAdminBootstrapService $bootstrapService): array
    {
        return [
            'canBootstrap' => $bootstrapService->isBootstrapAllowed(),
        ];
    }
}; ?>

<div>
    <div class="panel__status">
        <x-auth-session-status :status="session('status')" />
    </div>

    <form wire:submit="login">
        <div class="tdms-field">
            <label for="email">Username or Email</label>
            <div class="tdms-input-wrap">
                <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input
                    wire:model="form.email"
                    id="email"
                    type="email"
                    name="email"
                    required
                    autofocus
                    autocomplete="username"
                    placeholder="Enter your username or email"
                >
            </div>
            <x-input-error :messages="$errors->get('form.email')" class="mt-2" />
        </div>

        <div class="tdms-field" x-data="{ show: false }">
            <label for="password">Password</label>
            <div class="tdms-input-wrap">
                <svg class="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <input
                    wire:model="form.password"
                    id="password"
                    :type="show ? 'text' : 'password'"
                    name="password"
                    required
                    autocomplete="current-password"
                    placeholder="Enter your password"
                    style="padding-right: 2.75rem;"
                >
                <button
                    type="button"
                    class="tdms-toggle-visibility"
                    @click="show = !show"
                    :aria-label="show ? 'Hide password' : 'Show password'"
                    aria-pressed="false"
                    :aria-pressed="show.toString()"
                >
                    <svg x-show="!show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg x-show="show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22"/><path d="M9.5 9.5a3 3 0 0 0 4.24 4.24"/></svg>
                </button>
            </div>
            <x-input-error :messages="$errors->get('form.password')" class="mt-2" />
        </div>

        <div class="tdms-row-between">
            <label class="tdms-remember" for="remember">
                <input wire:model="form.remember" id="remember" type="checkbox" name="remember">
                Remember me
            </label>

            @if (Route::has('password.request'))
                <a class="tdms-forgot" href="{{ route('password.request') }}" wire:navigate>Forgot Password?</a>
            @endif
        </div>

        <button type="submit" class="tdms-submit" wire:loading.attr="disabled" wire:target="login">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>
            <span wire:loading.remove wire:target="login">Sign In</span>
            <span wire:loading wire:target="login">Signing In&hellip;</span>
        </button>
    </form>

    @if ($canBootstrap)
        <div class="tdms-bootstrap-wrap">
            <div class="tdms-bootstrap-divider">
                <span>System Initialization</span>
            </div>
            <p class="tdms-bootstrap-label">Don't have a system administrator yet?</p>
            <a href="{{ route('super-admin.create') }}" class="tdms-bootstrap-link" wire:navigate>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                <span>Create Super Admin</span>
            </a>
        </div>
    @endif
</div>
