import type { Metadata } from 'next';
import { StyleGuide } from './StyleGuide';

/** Internal design-system reference (kitchen sink). Never indexed. */
export const metadata: Metadata = {
  title: 'راهنمای طراحی',
  robots: { index: false, follow: false },
};

export default function StyleGuidePage() {
  return <StyleGuide />;
}
