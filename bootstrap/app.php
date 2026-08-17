<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
            'bootstrap.allowed' => \App\Http\Middleware\EnsureSuperAdminNotBootstrapped::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

// On read-only serverless filesystems (Vercel), api/index.php points
// APP_STORAGE at a writable /tmp path — but setting that env var alone
// does nothing until something actually calls useStoragePath() with it.
// No-op locally/on WAMP, where APP_STORAGE is never set.
if ($storagePath = $_ENV['APP_STORAGE'] ?? getenv('APP_STORAGE') ?: null) {
    $app->useStoragePath($storagePath);
    $app->useBootstrapPath($storagePath.'/bootstrap');
}

return $app;
