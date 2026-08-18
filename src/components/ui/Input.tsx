import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 ${className}`}
        {...props}
      />
    );
  }
);
