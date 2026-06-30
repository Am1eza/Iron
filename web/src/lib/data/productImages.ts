/**
 * Real product photography (studio shots on white) per category slug. Files live
 * in /public/products and are pre-optimized WebP (~1200×800). Served via a plain
 * <img> (see components/catalog/ProductImage) since the project ships no image
 * optimizer. Categories without a photo fall back to the CategoryArt illustration.
 */
export const PRODUCT_IMAGES: Record<string, string> = {
  rebar: '/products/rebar.webp',
  ibeam: '/products/ibeam.webp',
  profile: '/products/profile.webp',
  sheet: '/products/sheet.webp',
  'angle-channel': '/products/angle-channel.webp',
  pipe: '/products/pipe.webp',
  wire: '/products/wire.webp',
};

/** Absolute public path for a category's photo, or undefined if none exists. */
export function productImage(slug: string): string | undefined {
  return PRODUCT_IMAGES[slug];
}

/**
 * Small (~320px) thumbnail variant for menus, rails and compact headers — a
 * fraction of the full image's bytes/decode. Returns undefined if the category
 * has no photo. Files: /products/<slug>-thumb.webp.
 */
export function productThumb(slug: string): string | undefined {
  const full = PRODUCT_IMAGES[slug];
  return full ? full.replace(/\.webp$/, '-thumb.webp') : undefined;
}
