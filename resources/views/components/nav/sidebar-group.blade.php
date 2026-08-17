@props(['title' => null])

<div>
    @if ($title)
        <p class="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{{ $title }}</p>
    @endif
    <div class="space-y-1">
        {{ $slot }}
    </div>
</div>
