/**
 * Custom پیش‌فاکتور letterhead (پولادی-tier perk) — pure, shared between
 * server (proforma page's eligibility check) and client (the account form's
 * "usable yet?" hint), so the definition of "usable" can never drift between
 * where it's enforced and where it's explained.
 */
export interface LetterheadFields {
  logoUrl: string | null;
  companyName: string | null;
}

/** A logo alone or a name alone is not a letterhead — both are required
 *  before it's offered as a پیش‌فاکتور option; address/phone stay optional. */
export function isLetterheadUsable(l: LetterheadFields | null | undefined): boolean {
  return Boolean(l?.logoUrl && l?.companyName?.trim());
}
