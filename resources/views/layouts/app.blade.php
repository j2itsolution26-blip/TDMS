<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', 'Laravel') }}</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="font-sans antialiased bg-surface text-navy-900">
        <div class="min-h-screen">
            <livewire:layout.navigation />

            <main class="lg:pl-64">
                <!-- Page Heading -->
                @if (isset($header))
                    <div class="border-b border-border bg-white">
                        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                            {{ $header }}
                        </div>
                    </div>
                @endif

                <!-- Page Content -->
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {{ $slot }}
                </div>
            </main>
        </div>
    </body>
</html>
