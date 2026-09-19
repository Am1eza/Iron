/**
 * The root layout sits ABOVE `[locale]` and wraps every page in the fa
 * provider, so a `useTranslations` call here always answered in Persian — the
 * first link a crawler or screen reader met on an /en page was «پرش به محتوا».
 * The label is now resolved by the root layout from the request locale (the
 * `X-NEXT-INTL-LOCALE` header it already reads for `<html lang>`) and passed in.
 */
export function SkipLink({ label }: { label: string }) {
  return (
    <a href="#main" className="skip-link">
      {label}
    </a>
  );
}
