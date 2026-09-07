import { normalizeDigits } from './format';
import { normalizePersian } from './persianText';

/** Comparison-only canonical form. It deliberately treats space and ZWNJ as
 * equivalent and removes harmless punctuation, so visually identical Persian
 * catalog values cannot evade duplicate detection. Display text is untouched. */
export function canonicalCatalogValue(value: string | null | undefined): string {
  return normalizeDigits(normalizePersian(value ?? ''))
    .replace(/[آأإ]/g, 'ا')
    .replace(/\u200c/g, ' ')
    .replace(/[×xX*٭]/g, 'x')
    // `/` is excluded from the vanish-set on purpose: it is the fraction
    // separator («۱/۲ اینچ» = 1/2"), the one meaningful character among these
    // — stripping it entirely made "1/2" and "12" the same identity (a real
    // production collision between a 1/2" and a 12" pipe). Every other
    // separator here really is decoration around an already-explicit token
    // (e.g. the space in "14 x 14" next to the literal "x"), so it still
    // vanishes rather than becoming a space that would itself need folding.
    .replace(/[\s_.،,;؛:()\[\]{}\-\\]+/g, '')
    .toLocaleLowerCase('fa');
}

export type CatalogIdentityInput = {
  name?: string | null;
  size?: string | null;
  grade?: string | null;
  condition?: string | null;
  dimensions?: string | null;
  schedule?: string | null;
  standard?: string | null;
  factory?: string | null;
  unit?: string | null;
  priceBasis?: string | null;
  branchLengthM?: number | null;
};

/** Product identity comes from structured facts, never its marketing name. */
export function catalogProductIdentity(input: CatalogIdentityInput): string {
  const coreFacts = [
    input.size,
    input.grade,
    input.condition,
    input.dimensions,
    input.schedule,
    input.standard,
  ];
  const facts = [
    ...coreFacts,
    input.factory,
    input.branchLengthM == null ? '' : String(input.branchLengthM),
  ];
  // Legacy/general rows with no structured facts still need a discriminator;
  // there the normalized name is the only identity information available.
  const identityFacts = coreFacts.some((value) => canonicalCatalogValue(String(value ?? '')) !== '')
    ? facts
    : [input.name, input.factory, input.branchLengthM == null ? '' : String(input.branchLengthM)];
  return [...identityFacts, input.unit ?? 'kg', input.priceBasis ?? 'kg']
    .map((value) => canonicalCatalogValue(String(value ?? '')))
    .join('|');
}
