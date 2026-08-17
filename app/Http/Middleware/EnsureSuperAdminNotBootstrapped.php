<?php

namespace App\Http\Middleware;

use App\Services\SuperAdminBootstrapService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdminNotBootstrapped
{
    public function __construct(
        protected SuperAdminBootstrapService $bootstrapService
    ) {}

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->bootstrapService->isBootstrapAllowed()) {
            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'Super Admin setup has already been completed. Please log in using the existing administrator account.',
                ], 403);
            }

            return redirect()->route('login')->with(
                'status',
                'Super Admin setup has already been completed. Please log in using the existing administrator account.'
            );
        }

        return $next($request);
    }
}
