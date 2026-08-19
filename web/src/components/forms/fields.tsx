'use client';
import { forwardRef, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { toPersianDigits } from '@/lib/utils/format';
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
  const autoId = useId();
  const fid = id ?? name ?? autoId;
  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <input
        {...rest}
        id={fid}
        name={name}
        ref={ref}
        required={required}
        aria-required={required || undefined}
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
  const autoId = useId();
  const fid = id ?? name ?? autoId;
  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <textarea
        {...rest}
        id={fid}
        name={name}
        ref={ref}
        required={required}
        aria-required={required || undefined}
        className={styles.textarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId(fid, !!error, !!helper)}
      />
    </Field>
  );
});

/**
 * Free-text field backed by a native `<input list>` + `<datalist>` of
 * existing values — lets an admin pick from what's already in use instead of
 * retyping, which is the only way a value like a factory name or a
 * subcategory group label stays one consistent string instead of silently
 * splitting into near-identical spellings across records. Originally lived
 * only in SkuDrawer for factory/size/grade; moved here so the catalog
 * taxonomy form (subcategory `groupLabel`) can reuse the exact same pattern
 * instead of re-implementing it.
 */
export function PickerInput({
  id,
  label,
  helper,
  value,
  options,
  error,
  maxLength,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string;
  value: string;
  options: string[];
  error?: string;
  maxLength?: number;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <TextInput
        label={label}
        list={`${id}-options`}
        helper={helper}
        value={value}
        error={error}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-options`}>
        {options.map((o) => (
          // `value` stays the REAL stored string — it is what the browser
          // inserts into the box on pick, and what then flows through the same
          // `onChange` (and therefore the same digit normalization) as manual
          // typing. The child text is the Persian-digit rendering, so a
          // numeric suggestion in the dropdown reads like the rest of the
          // panel instead of being the one place Latin digits show up.
          <option key={o} value={o}>
            {toPersianDigits(o)}
          </option>
        ))}
      </datalist>
    </>
  );
}

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
