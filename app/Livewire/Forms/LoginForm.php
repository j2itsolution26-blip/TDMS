<?php

namespace App\Livewire\Forms;

use App\Models\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Livewire\Attributes\Validate;
use Livewire\Form;

class LoginForm extends Form
{
    /**
     * The "Username or Email" identifier. The property keeps its original
     * name so the existing view binding (wire:model="form.email") and the
     * error bag key ('form.email') stay untouched — it is no longer
     * validated as an email, because the field has always accepted both.
     */
    #[Validate('required|string|max:255')]
    public string $email = '';

    #[Validate('required|string')]
    public string $password = '';

    #[Validate('boolean')]
    public bool $remember = false;

    /**
     * Attempt to authenticate the request's credentials.
     *
     * @throws ValidationException
     */
    public function authenticate(): void
    {
        $this->ensureIsNotRateLimited();

        [$column, $identifier] = $this->identifier();

        // Password verification stays inside Laravel's Eloquent user
        // provider, which runs Hash::check() against the stored bcrypt
        // hash. The closure only narrows *which* row is looked up.
        $attempted = Auth::attempt([
            fn ($query) => $query->whereRaw("LOWER({$column}) = ?", [$identifier]),
            'password' => $this->password,
        ], $this->remember);

        if (! $attempted) {
            $this->logAttempt($column, $identifier, passwordVerified: false);

            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'form.email' => trans('auth.failed'),
            ]);
        }

        if (! Auth::user()->is_active) {
            $this->logAttempt($column, $identifier, passwordVerified: true);

            Auth::logout();
            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'form.email' => trans('auth.inactive'),
            ]);
        }

        $this->logAttempt($column, $identifier, passwordVerified: true);

        RateLimiter::clear($this->throttleKey());
    }

    /**
     * Resolve the submitted identifier to the column it should be matched
     * against. Both sides of the comparison are lower-cased, so emails
     * match case-insensitively (as RFC-practical mail does) and usernames
     * are treated as case-insensitive too — the column is new, so no
     * existing case-sensitive username can be broken by this.
     *
     * @return array{0: 'email'|'username', 1: string}
     */
    protected function identifier(): array
    {
        $identifier = trim($this->email);

        return [
            str_contains($identifier, '@') ? 'email' : 'username',
            Str::lower($identifier),
        ];
    }

    /**
     * Ensure the authentication request is not rate limited.
     */
    protected function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        event(new Lockout(request()));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'form.email' => trans('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ]);
    }

    /**
     * Get the authentication rate limiting throttle key.
     */
    protected function throttleKey(): string
    {
        return Str::transliterate(Str::lower(trim($this->email)).'|'.request()->ip());
    }

    /**
     * Local/debug-only trace of where an attempt lands. Deliberately
     * records no identifier value, password, hash, token or cookie —
     * only whether each stage passed.
     */
    private function logAttempt(string $column, string $identifier, bool $passwordVerified): void
    {
        if (app()->isProduction() || ! config('app.debug')) {
            return;
        }

        $user = User::whereRaw("LOWER({$column}) = ?", [$identifier])->first();

        Log::debug('AUTH DEBUG', [
            'identifier_received' => $identifier !== '',
            'lookup_column' => $column,
            'user_found' => $user !== null,
            'password_verified' => $passwordVerified,
            'account_active' => $user?->is_active,
            'roles_found' => $user?->getRoleNames()->all() ?? [],
            'session_created' => Auth::check(),
        ]);
    }
}
