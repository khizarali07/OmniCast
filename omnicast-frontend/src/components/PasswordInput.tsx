'use client';

import { useState } from 'react';

interface PasswordInputProps {
  id: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}

export function PasswordInput({ id, name, placeholder = "••••••••", required = true }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <span className="material-symbols-outlined text-outline-variant group-focus-within:text-primary transition-colors text-[20px]">
          key
        </span>
      </div>
      <input
        className="w-full bg-surface-dim border border-outline-variant/40 rounded-lg py-3 pl-11 pr-12 font-body-md text-body-md text-on-surface placeholder-outline focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all duration-200"
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        type={showPassword ? "text" : "password"}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-outline-variant hover:text-on-surface transition-colors focus:outline-none"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        <span className="material-symbols-outlined text-[20px]">
          {showPassword ? "visibility_off" : "visibility"}
        </span>
      </button>
    </div>
  );
}
