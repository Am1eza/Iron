/**
 * Client logos for the «کسانی که به آهن‌تایم اعتماد کرده‌اند» (trusted-by) wall.
 *
 * `hasLogo: true`  → an optimized logo file exists in this folder and is shown.
 * `hasLogo: false` → no official logo could be found (see missing-logos.md).
 *                    The UI falls back to a clean name chip, and auto-upgrades
 *                    the moment you add `<slug>.<svg|png|webp>` here and flip
 *                    `hasLogo` to true.
 *
 * Persian names (`nameFa`) are best-effort for these well-known Iranian firms —
 * please verify/adjust. `monogram` is the chip fallback label.
 */
export type ClientLogo = {
  slug: string;
  name: string;
  nameFa: string;
  website?: string;
  /** Public path, served from /assets/logos/clients/<slug>.<ext>. */
  file: string;
  hasLogo: boolean;
  monogram: string;
};

export const clientLogos: ClientLogo[] = [
  { slug: 'kordestan-cement', name: 'Kurdestan Cement', nameFa: 'سیمان کردستان', website: 'https://www.kordestancement.com', file: '/assets/logos/clients/kordestan-cement.webp', hasLogo: true, monogram: 'KC' },
  { slug: 'dashtestan-cement', name: 'Dashtestan Cement', nameFa: 'سیمان دشتستان', website: 'https://dashtestancement.com', file: '/assets/logos/clients/dashtestan-cement.webp', hasLogo: true, monogram: 'DC' },
  { slug: 'hegmatan-cement', name: 'Hegmatan Cement', nameFa: 'سیمان هگمتان', website: 'https://www.hegmatancement.com', file: '/assets/logos/clients/hegmatan-cement.webp', hasLogo: true, monogram: 'HC' },
  { slug: 'parsian-construction-development', name: 'Parsian Construction Development', nameFa: 'توسعه ساختمانی پارسیان', website: 'https://pcdco.org', file: '/assets/logos/clients/parsian-construction-development.webp', hasLogo: true, monogram: 'PCD' },
  { slug: 'sina-port-marine', name: 'Sina Port & Marine Services Development', nameFa: 'توسعه خدمات دریایی و بندری سینا', website: 'https://spmco.co', file: '/assets/logos/clients/sina-port-marine.svg', hasLogo: true, monogram: 'SINA' },
  { slug: 'persi-iran-gas', name: 'Persi Iran Gas', nameFa: 'پرسی ایران گاز', website: 'https://persiirangas.ir', file: '/assets/logos/clients/persi-iran-gas.webp', hasLogo: true, monogram: 'PIG' },
  { slug: 'torc', name: 'Tehran Oil Refining Company', nameFa: 'پالایش نفت تهران', website: 'https://www.torc.ir', file: '/assets/logos/clients/torc.webp', hasLogo: true, monogram: 'TORC' },
  { slug: 'mibic', name: 'International Building & Industry Company (MIBIC)', nameFa: 'شرکت بین‌المللی ساختمان و صنعت', website: 'https://mibic.ir', file: '/assets/logos/clients/mibic.webp', hasLogo: true, monogram: 'MIBIC' },
  { slug: 'pasargad-alloy-steel', name: 'Pasargad Alloy Steel', nameFa: 'فولاد آلیاژی پاسارگاد', website: 'https://www.pascosteel.com', file: '/assets/logos/clients/pasargad-alloy-steel.webp', hasLogo: true, monogram: 'PASCO' },
  { slug: 'esfahan-alloy-steel', name: 'Esfahan Alloy Steel', nameFa: 'فولاد آلیاژی اصفهان', file: '/assets/logos/clients/esfahan-alloy-steel.svg', hasLogo: false, monogram: 'EAS' },
  { slug: 'faradast-energy-falat', name: 'Faradast Energy Falat', nameFa: 'فرادست انرژی فلات', file: '/assets/logos/clients/faradast-energy-falat.svg', hasLogo: false, monogram: 'FEF' },
  { slug: 'pars-garma', name: 'Pars Garma', nameFa: 'پارس گرما', website: 'https://parsgarma.com', file: '/assets/logos/clients/pars-garma.webp', hasLogo: true, monogram: 'PG' },
  { slug: 'pgpic', name: 'Persian Gulf Petrochemical Industries Company', nameFa: 'صنایع پتروشیمی خلیج فارس', website: 'https://pgpic.ir', file: '/assets/logos/clients/pgpic.webp', hasLogo: true, monogram: 'PGPIC' },
  { slug: 'azarab', name: 'Azarab', nameFa: 'صنایع آذرآب', website: 'http://www.azarab.ir', file: '/assets/logos/clients/azarab.webp', hasLogo: true, monogram: 'AZ' },
  { slug: 'shams-energy', name: 'Shams Energy', nameFa: 'انرژی شمس', website: 'https://shams.energy', file: '/assets/logos/clients/shams-energy.webp', hasLogo: true, monogram: 'SHAMS' },
  { slug: 'pgsoc', name: 'Persian Gulf Star Oil Company', nameFa: 'نفت ستاره خلیج فارس', website: 'https://www.pgsoc.ir', file: '/assets/logos/clients/pgsoc.webp', hasLogo: true, monogram: 'PGSOC' },
  { slug: 'mapna-pars', name: 'MAPNA Pars Generator Engineering & Manufacturing', nameFa: 'مپنا پارس', website: 'https://mapnagroup.com/mapnacompanies/mapna-pars', file: '/assets/logos/clients/mapna-pars.webp', hasLogo: true, monogram: 'MAPNA' },
  { slug: 'pars-machine-manufacturing', name: 'Pars Machine Manufacturing', nameFa: 'ماشین‌سازی پارس', website: 'https://mspco.ir', file: '/assets/logos/clients/pars-machine-manufacturing.webp', hasLogo: true, monogram: 'MSP' },
  { slug: 'insig', name: 'National Iranian Steel Industries Group', nameFa: 'گروه ملی صنعتی فولاد ایران', website: 'https://insig.org', file: '/assets/logos/clients/insig.webp', hasLogo: true, monogram: 'INSIG' },
  { slug: 'karun-agro-industry', name: 'Karun Agro Industry', nameFa: 'کشت و صنعت کارون', website: 'https://karuncane.com', file: '/assets/logos/clients/karun-agro-industry.webp', hasLogo: true, monogram: 'KARUN' },
  { slug: 'imam-khomeini-agro-industry', name: 'Imam Khomeini Agro Industry', nameFa: 'کشت و صنعت امام خمینی', website: 'https://www.ik-sugarcane.ir', file: '/assets/logos/clients/imam-khomeini-agro-industry.webp', hasLogo: true, monogram: 'IKAI' },
];
