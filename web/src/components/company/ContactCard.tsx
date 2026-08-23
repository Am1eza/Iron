import { getContact } from '@/lib/server/contact';
import { ContactCardView } from './ContactCardView';

/**
 * ContactCard — office address + tappable phone links (tel:) and a primary
 * «تماس» CTA to the contact page. Stays an async Server Component so the
 * contact details are fetched on the server; the markup and its (translated)
 * labels live in `ContactCardView`.
 */
export async function ContactCard() {
  const CONTACT = await getContact();
  return (
    <ContactCardView
      address={CONTACT.address}
      phoneLandline={CONTACT.phoneLandline}
      phoneMobile={CONTACT.phoneMobile}
    />
  );
}
