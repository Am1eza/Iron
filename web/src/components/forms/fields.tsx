'use client';
import { forwardRef } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import styles from './field.module.css';

function descId(id: string, hasError: boolean, hasHelper: boolean) {
  if (hasError) return `${id}-error`;
  if (hasHelper) return `${id}-help`;
  return undefined;
}

export function Field({
  label,
  htmlFor,
  required,
  error,
  helper,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
        {required ? (
          <span className={styles.req} aria-hidden>
            {' *'}
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={`${htmlFor}-help`} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helper?: string;
  required?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { label, error, helper, required, id, name, ...rest },
  ref,
) {
  const fid = id ?? name ?? label;
  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <input
        {...rest}
        id={fid}
        name={name}
        ref={ref}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId(fid, !!error, !!helper)}
      />
    </Field>
  );
});

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  helper?: string;
  required?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, AreaProps>(function Textarea(
  { label, error, helper, required, id, name, ...rest },
  ref,
) {
  const fid = id ?? name ?? label;
  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <textarea
        {...rest}
        id={fid}
        name={name}
        ref={ref}
        className={styles.textarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId(fid, !!error, !!helper)}
      />
    </Field>
  );
});

export function RadioGroup({
  label,
  options,
  register,
  error,
  required,
}: {
  label: string;
  options: { value: string; label: string }[];
  register: UseFormRegisterReturn;
  error?: string;
  required?: boolean;
}) {
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {label}
        {required ? (
          <span className={styles.req} aria-hidden>
            {' *'}
          </span>
        ) : null}
      </legend>
      <div className={styles.radios}>
        {options.map((o) => (
          <label key={o.value} className={styles.radio}>
            <input type="radio" value={o.value} {...register} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
