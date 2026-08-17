@props(['padding' => 'p-6'])

<div {{ $attributes->merge(['class' => "bg-card border border-border rounded-xl shadow-sm {$padding}"]) }}>
    {{ $slot }}
</div>
