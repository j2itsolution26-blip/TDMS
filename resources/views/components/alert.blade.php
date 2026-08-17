@props(['type' => 'info', 'title' => null])

@php
$styles = match ($type) {
    'success' => ['bg-green-50 border-green-200', 'text-green-800', 'text-green-500'],
    'warning' => ['bg-amber-50 border-amber-200', 'text-amber-800', 'text-amber-500'],
    'danger' => ['bg-red-50 border-red-200', 'text-red-800', 'text-red-500'],
    default => ['bg-blue-50 border-blue-200', 'text-blue-800', 'text-blue-500'],
};
[$container, $text, $iconColor] = $styles;

$icon = match ($type) {
    'success' => 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    'warning' => 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    'danger' => 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    default => 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
};
@endphp

<div {{ $attributes->merge(['class' => "flex gap-3 border rounded-xl p-4 {$container}"]) }}>
    <svg class="w-5 h-5 shrink-0 mt-0.5 {{ $iconColor }}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}" />
    </svg>
    <div class="text-sm {{ $text }}">
        @if ($title)
            <p class="font-medium">{{ $title }}</p>
        @endif
        <div class="{{ $title ? 'mt-1' : '' }}">{{ $slot }}</div>
    </div>
</div>
