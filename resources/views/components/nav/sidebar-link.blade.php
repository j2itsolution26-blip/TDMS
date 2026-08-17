@props(['active' => false])

<a {{ $attributes->merge(['class' => (($active ?? false)
        ? 'bg-indigo-600 text-white'
        : 'text-slate-300 hover:bg-white/5 hover:text-white')
        . ' group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition duration-150 ease-in-out'
]) }}>
    @isset($icon)
        <span class="w-5 h-5 shrink-0 {{ ($active ?? false) ? 'text-white' : 'text-slate-400 group-hover:text-white' }}">
            {{ $icon }}
        </span>
    @endisset
    {{ $slot }}
</a>
