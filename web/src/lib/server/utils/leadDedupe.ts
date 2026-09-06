import { createHash } from 'node:crypto';
import type { PriceUnit } from '@/lib/types/domain';

export interface LeadDedupeInput {
  contact: { mobile: string; name?: string };
  items: Array<{ skuId: string; qty: number; unit: PriceUnit; quotedUnitPrice?: number }>;
  channel: string;
  source?: string;
  note?: string;
}

/** Stable semantic fingerprint: ordering lines differently is the same cart,
 * but changing any financially meaningful field is a different request. */
export function leadDedupeFingerprint(input: LeadDedupeInput): string {
  const canonical = JSON.stringify({
    contact: { mobile: input.contact.mobile, name: input.contact.name ?? null },
    items: [...input.items]
      .map((item) => ({ ...item, quotedUnitPrice: item.quotedUnitPrice ?? null }))
      .sort((a, b) =>
        `${a.skuId}\u0000${a.unit}\u0000${a.qty}\u0000${a.quotedUnitPrice ?? ''}`.localeCompare(
          `${b.skuId}\u0000${b.unit}\u0000${b.qty}\u0000${b.quotedUnitPrice ?? ''}`,
        ),
      ),
    channel: input.channel,
    source: input.source ?? null,
    note: input.note ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
