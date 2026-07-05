import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StyleGuide } from './StyleGuide';

/** Internal design-system reference (kitchen sink). Never indexed, and not
 *  served in production — it's a dev/design tool, not customer-facing. */
export const metadata: Metadata = {
  title: 'راهنمای طراحی',
  robots: { index: false, follow: false },
};

export default function StyleGuidePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StyleGuide />;
}
