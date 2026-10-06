'use client';

import { useState, type Ref } from 'react';
import { EyeIcon, EyeOffIcon, LockIcon } from './icons';

/**
 * A password field with a show/hide toggle.
 *
 * The toggle is a real button with a state-describing label and aria-pressed,
 * and it never submits the form. Uses the shared .tdms-input-wrap styling so it
 * sits beside any other auth field.
 */
export default function PasswordInput({
  id,
  name = id,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder,
  invalid = false,
  describedBy,
  disabled = false,
  inputRef,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: 'current-password' | 'new-password';
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="tdms-input-wrap">
      <LockIcon className="tdms-input-icon" />
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        className="has-trailing"
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="tdms-toggle-visibility"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={id}
      >
        {/* Shows the current state: struck through while hidden. */}
        {visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>
    </div>
  );
}
