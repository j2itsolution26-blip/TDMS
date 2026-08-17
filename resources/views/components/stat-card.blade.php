@props(['label', 'value', 'change' => null, 'trend' => null, 'iconBg' => 'bg-indigo-50', 'iconColor' => 'text-indigo-600'])

<div {{ $attributes->merge(['class' => 'bg-card border border-border rounded-xl shadow-sm p-5 flex items-start justify-between gap-4']) }}>
    <div class="min-w-0">
        <p class="text-sm text-slate-500">{{ $label }}</p>
        <p class="mt-1.5 text-[28px] font-semibold text-navy-900 leading-none">{{ $value }}</p>

        @if ($change)
            <p @class([
                'mt-2 text-xs font-medium inline-flex items-center gap-1',
                'text-green-600' => $trend === 'up',
                'text-red-600' => $trend === 'down',
                'text-slate-500' => ! in_array($trend, ['up', 'down']),
            ])>
                @if ($trend === 'up')
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                @elseif ($trend === 'down')
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                @endif
                {{ $change }}
            </p>
        @endif
    </div>

    @isset($icon)
        <div class="shrink-0 w-11 h-11 rounded-full {{ $iconBg }} {{ $iconColor }} flex items-center justify-center">
            {{ $icon }}
        </div>
    @endisset
</div>
