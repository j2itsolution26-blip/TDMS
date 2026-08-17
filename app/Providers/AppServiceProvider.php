<?php

namespace App\Providers;

use App\Services\SuperAdminBootstrapService;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Singleton so the bootstrap-allowed check can be memoized per
        // request — the route middleware and the Volt page's mount() both
        // ask this within the same GET, and should share one query.
        $this->app->singleton(SuperAdminBootstrapService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (request()->header('X-Forwarded-Proto') === 'https' || app()->environment('production')) {
            URL::forceScheme('https');
        }

        // Implicitly grant 'super_admin' role all permissions
        Gate::before(function ($user, $ability) {
            return $user->hasRole('super_admin') ? true : null;
        });
    }
}
