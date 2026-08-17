@props(['name' => '', 'size' => 'md'])

@php
$initials = collect(explode(' ', trim($name)))
    ->filter()
    ->map(fn ($part) => mb_strtoupper(mb_substr($part, 0, 1)))
    ->take(2)
    ->implode('');

$sizeClasses = match ($size) {
    'sm' => 'w-8 h-8 text-xs',
    'lg' => 'w-12 h-12 text-base',
    default => 'w-9 h-9 text-sm',
};
@endphp

<div {{ $attributes->merge(['class' => "shrink-0 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center {$sizeClasses}"]) }}>
    {{ $initials ?: '?' }}
</div>
