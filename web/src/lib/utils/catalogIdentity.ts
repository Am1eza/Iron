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
    .replace(/[\s_.،,;؛:()\[\]{}\-/\\]+/g, '')
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
