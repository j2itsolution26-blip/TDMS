@props(['disabled' => false])

<input @disabled($disabled) {{ $attributes->merge(['class' => 'border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500']) }}>
