<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', 'TDMS') }}</title>

        @vite(['resources/css/app.css', 'resources/css/auth.css', 'resources/js/app.js'])
    </head>
    <body>
        @php
            $campusImage = 'images/auth/campus.jpg';
            $logoImage = 'images/auth/logo.png';
            $hospitalityImage = 'images/auth/hospitality-student.jpg';
            $itImage = 'images/auth/it-student.jpg';

            $hasCampus = file_exists(public_path($campusImage));
            $hasLogo = file_exists(public_path($logoImage));
            $hasHospitality = file_exists(public_path($hospitalityImage));
            $hasIt = file_exists(public_path($itImage));
        @endphp

        <div class="tdms-auth">
            <div class="tdms-auth__main">
                <section class="tdms-auth__hero" @if($hasCampus) style="--tdms-campus-image: url('{{ asset($campusImage) }}');" @endif>
                    <div class="hero__copy">
                        <p class="hero__eyebrow">Welcome to</p>
                        <h1 class="hero__title">TDMS</h1>
                        <p class="hero__subtitle">(TVET DIPLOMA MANAGEMENT SYSTEM)</p>
                        <div class="hero__divider" aria-hidden="true"></div>
                        <p class="hero__description">A comprehensive platform for managing diploma programs, students, faculty, and academic processes efficiently.</p>

                        <div class="hero__badges">
                            <div class="hero__badge">
                                <span class="hero__badge-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></svg>
                                </span>
                                <span class="hero__badge-text">Empowering Skills. Building Futures.</span>
                            </div>
                            <div class="hero__badge">
                                <span class="hero__badge-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9c.15.6.68 1.02 1.3 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>
                                </span>
                                <span class="hero__badge-text">Excellence in TVET Education and Training.</span>
                            </div>
                            <div class="hero__badge">
                                <span class="hero__badge-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                </span>
                                <span class="hero__badge-text">Innovate. Educate. Elevate.</span>
                            </div>
                        </div>
                    </div>

                    <div class="hero__cards">
                        <div class="program-card">
                            <div class="program-card__body">
                                <span class="program-card__icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2s1 1 1 3-1 3-1 3v11a3 3 0 0 0 3 3"/><path d="M7 2v9"/><path d="M11 2v9"/><path d="M7 11h4"/><path d="M20 21V8a5 5 0 0 0-5-5v18"/></svg>
                                </span>
                                <p class="program-card__title">Hospitality Technology</p>
                            </div>
                            <div class="program-card__media program-card__media--hospitality">
                                @if($hasHospitality)
                                    <img src="{{ asset($hospitalityImage) }}" alt="Hospitality Technology student at the training bar">
                                @endif
                            </div>
                        </div>

                        <div class="program-card">
                            <div class="program-card__body">
                                <span class="program-card__icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                                </span>
                                <p class="program-card__title">Information Technology</p>
                            </div>
                            <div class="program-card__media program-card__media--it">
                                @if($hasIt)
                                    <img src="{{ asset($itImage) }}" alt="Information Technology student in the computer laboratory">
                                @endif
                            </div>
                        </div>
                    </div>
                </section>

                <section class="tdms-auth__panel">
                    <div class="panel__card">
                        <div class="panel__logo-wrap">
                            @if($hasLogo)
                                <img src="{{ asset($logoImage) }}" alt="Asian College Diploma Program Department logo" class="panel__logo">
                            @else
                                <span class="panel__logo-fallback" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 6l9 4 9-4-9-4Z"/><path d="M3 6v8c0 1 4 3 9 3s9-2 9-3V6"/><path d="M21 10v6"/></svg>
                                </span>
                            @endif
                        </div>

                        <p class="panel__eyebrow">Welcome to</p>
                        <h2 class="panel__title">TDMS</h2>
                        <p class="panel__subtitle">TVET DIPLOMA MANAGEMENT SYSTEM</p>
                        <div class="panel__divider" aria-hidden="true"></div>

                        <p class="panel__heading">Sign in to your account</p>
                        <p class="panel__subheading">Enter your credentials to continue</p>

                        {{ $slot }}

                        <div class="panel__trust">
                            <span class="panel__trust-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/></svg>
                                Secure
                            </span>
                            <span class="panel__trust-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
                                Reliable
                            </span>
                            <span class="panel__trust-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 11-13h-7l1-7Z"/></svg>
                                Efficient
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            <footer class="tdms-auth__footer">
                <span class="tdms-auth__footer-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    Asian College of Science and Technology
                </span>
                <span>&copy; {{ date('Y') }} Asian College. All rights reserved.</span>
                <span class="tdms-auth__footer-right">Empowering Skills. Building Futures.</span>
            </footer>
        </div>
    </body>
</html>
