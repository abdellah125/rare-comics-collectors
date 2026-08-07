"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

const control =
  "w-full rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 disabled:bg-ink-100";

export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden>*</span>}
      </label>
      <div className="mt-1.5">{children(id)}</div>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; className?: string }) {
  return (
    <Field label={label} hint={hint} required={props.required} className={className}>
      {(id) => <input id={id} className={control} {...props} />}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; className?: string }) {
  return (
    <Field label={label} hint={hint} required={props.required} className={className}>
      {(id) => <textarea id={id} rows={5} className={control} {...props} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; className?: string }) {
  return (
    <Field label={label} hint={hint} required={props.required} className={className}>
      {(id) => (
        <select id={id} className={control} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}
