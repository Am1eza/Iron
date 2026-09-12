import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('public business claims safeguards', () => {
  it('keeps the requested certification labels in the footer', () => {
    const footer = read('components/layout/Footer.tsx');
    expect(footer).toMatch(/badgeETrust|badgeRegistered|badgeUnion/);
  });

  it('keeps the requested client-logo roster', () => {
    expect(read('components/home/Partners.tsx')).toMatch(/clientLogos|clientsTitle|clientsAria/);
    expect(read('app/[locale]/page.tsx')).toMatch(/clientLogos/);
  });

  it('keeps the core promotional value propositions visible', () => {
    const publicCopy = [
      read('app/[locale]/about/page.tsx'),
      read('app/[locale]/warehouse/page.tsx'),
      read('components/forms/RequestFlow.tsx'),
      read('../messages/fa.json'),
    ].join('\n');
    expect(publicCopy).toMatch(/تحویل ۲۴ ساعته/);
    expect(publicCopy).toMatch(/تأمین رسمی از بورس کالا/);
    expect(publicCopy).toMatch(/پیش‌فاکتور رسمی/);
  });
});
