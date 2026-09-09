import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import { findProformaByRef, findLead } from '@/lib/server/repos/leadsRepo';
import { ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { getSession } from '@/lib/auth/session';
import { clubStatus, getLetterhead } from '@/lib/server/repos/clubRepo';
import { isLetterheadUsable } from '@/lib/utils/letterhead';
import { formatJalali } from '@/lib/utils/jalali';
import { formatTehranJalaliDateTime } from '@/lib/server/utils/jalali';
import { ProformaSheet, type CustomLetterhead } from './ProformaSheet';

export const metadata: Metadata = buildMetadata({ title: 'پیش‌فاکتور', noindex: true });

type Params = { params: Promise<{ ref: string }> };

/**
 * Public پیش‌فاکتور view — reachable from the SMS link; the ref is the
 * capability. A proper letterhead (logo + legal contact block) + a
 * print-to-PDF button so the buyer can download a branded PDF.
 */
export default async function ProformaPage({ params }: Params) {
  const { ref } = await params;
  if (API_MODE !== 'live' || !hasDb()) notFound();

  const CONTACT = await getContact();
  const p = await findProformaByRef(decodeURIComponent(ref).toUpperCase());
  if (!p) notFound();

  // The lead is fetched unconditionally now — every پیش‌فاکتور needs its
  // buyer's name/mobile printed on it (a standard proforma cannot identify
  // who it was issued to otherwise), not just the signed-in-owner path the
  // letterhead check below already had a reason to fetch it for.
  const lead = await findLead(p.leadId);

  // Own-letterhead eligibility (US-tender-letterhead): signed in, actually
  // owns the lead this proforma belongs to (not just anyone who has the
  // link — the ref is a public capability, but the letterhead swap is a
  // per-customer perk), پولادی tier, and has filled in a usable letterhead.
  // Any failure at any step just means `custom` stays null and the page
  // renders exactly as it always has.
  let custom: CustomLetterhead | null = null;
  const session = await getSession();
  if (session && lead?.userId === session.id) {
    const [status, letterhead] = await Promise.all([
      clubStatus(session.id),
      getLetterhead(session.id),
    ]);
    if (status.tier === 'poolad' && isLetterheadUsable(letterhead)) {
      custom = {
        logoUrl: letterhead!.logoUrl!,
        companyName: letterhead!.companyName!,
        address: letterhead!.address,
        phone: letterhead!.phone,
      };
    }
  }

  return (
    <ProformaSheet
      orgName={ORG_NAME}
      address={CONTACT.address}
      phoneLandline={CONTACT.phoneLandline}
      phoneMobile={CONTACT.phoneMobile}
      refCode={p.ref}
      date={formatJalali(p.createdAt.toISOString())}
      customerName={lead?.contactName ?? null}
      customerMobile={lead?.contactMobile ?? null}
      custom={custom}
      status={p.status}
      validUntilText={formatTehranJalaliDateTime(p.validUntil)}
      lines={p.lines}
      subtotal={p.subtotal}
      volumeDiscountToman={p.volumeDiscountToman}
      volumeDiscountLabel={p.volumeDiscountLabel}
      discountToman={p.discountToman}
      vatRatePct={Math.round(p.vatRate * 100)}
      vatAmount={p.vatAmount}
      total={p.total}
    />
  );
}
