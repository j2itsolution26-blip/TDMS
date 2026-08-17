@props(['status' => '', 'label' => null])

@php
$key = strtolower(str_replace([' ', '-'], '_', $status));

$classes = match (true) {
    in_array($key, ['active', 'approved', 'completed', 'verified', 'enrolled', 'graduated']) => 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20',
    in_array($key, ['pending', 'for_review', 'submitted', 'applicant']) => 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
    in_array($key, ['rejected', 'cancelled', 'canceled', 'failed', 'returned', 'missing']) => 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
    in_array($key, ['processing', 'information', 'transferred']) => 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20',
    in_array($key, ['draft', 'inactive', 'archived', 'deactivated']) => 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20',
    default => 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20',
};
@endphp

<span {{ $attributes->merge(['class' => "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize {$classes}"]) }}>
    {{ $label ?? str_replace('_', ' ', $status) }}
</span>
