import { describe, it, expect } from 'vitest';
import { normalizePersian, normalizeSizeText } from './persianText';
import { slugSchema, uploadPathSchema } from '@/lib/validation/utils';

describe('normalizePersian', () => {
  it('folds Arabic letters onto their Persian twins', () => {
    // The whole point: these render identically but never ILIKE-match, so a
    // name pasted from Excel becomes permanently unfindable.
    expect(normalizePersian('كيلو')).toBe('کیلو');
    expect(normalizePersian('ميلگرد')).toBe('میلگرد');
    expect(normalizePersian('مكه')).toBe('مکه');
  });

  it('makes an Arabic-typed name match a Persian-typed one', () => {
    expect(normalizePersian('ميلگرد آجدار')).toBe(normalizePersian('میلگرد آجدار'));
  });

  it('strips tatweel and diacritics', () => {
    expect(normalizePersian('میــلگرد')).toBe('میلگرد');
    expect(normalizePersian('مِیلگَرد')).toBe('میلگرد');
  });

  it('folds Arabic-Indic digits to Persian', () => {
    expect(normalizePersian('٤٥')).toBe('۴۵');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizePersian('  میلگرد   ۱۴  ')).toBe('میلگرد ۱۴');
  });

  it('leaves already-clean Persian untouched', () => {
    expect(normalizePersian('میلگرد ۱۴ آجدار')).toBe('میلگرد ۱۴ آجدار');
  });
});

describe('normalizeSizeText', () => {
  it('settles one size on a single spelling', () => {
    // 40x40, 40X40 and ۴۰×۴۰ are the same product dimension typed three ways.
    expect(normalizeSizeText('40x40')).toBe('۴۰×۴۰');
    expect(normalizeSizeText('40 X 40')).toBe('۴۰×۴۰');
    expect(normalizeSizeText('۴۰×۴۰')).toBe('۴۰×۴۰');
  });

  it('converts Latin digits to Persian', () => {
    expect(normalizeSizeText('14')).toBe('۱۴');
  });

  it('keeps non-numeric size words', () => {
    expect(normalizeSizeText('2 اینچ')).toBe('۲ اینچ');
  });
});

describe('slugSchema', () => {
  const s = slugSchema(60);

  it('accepts a normal slug', () => {
    expect(s.safeParse('rebar-14-a3').success).toBe(true);
  });

  it('rejects the traversal segment that silently rewrote canonical URLs', () => {
    // `encodeURIComponent` does not escape dots, so `..` survived into
    // new URL(path, SITE_URL) and collapsed a real page's canonical tag and
    // sitemap entry onto the homepage.
    expect(s.safeParse('..').success).toBe(false);
    expect(s.safeParse('a/../b').success).toBe(false);
  });

  it('rejects Persian text, spaces, uppercase and edge hyphens', () => {
    expect(s.safeParse('میلگرد').success).toBe(false);
    expect(s.safeParse('hello world').success).toBe(false);
    expect(s.safeParse('Rebar').success).toBe(false);
    expect(s.safeParse('-rebar').success).toBe(false);
    expect(s.safeParse('rebar-').success).toBe(false);
  });
});

describe('uploadPathSchema', () => {
  it('keeps a same-origin upload path', () => {
    expect(uploadPathSchema.parse('/uploads/abc.jpg')).toBe('/uploads/abc.jpg');
  });

  it('strips the origin an admin browser baked in', () => {
    // ImageUpload resolves against window.location.origin, so a photo added
    // from the panel host stored a cross-origin URL the public site cannot
    // load. Storing the path makes it origin-independent.
    expect(uploadPathSchema.parse('https://panel.ahantime.com/uploads/abc.jpg')).toBe('/uploads/abc.jpg');
    expect(uploadPathSchema.parse('http://localhost:3000/uploads/abc.jpg')).toBe('/uploads/abc.jpg');
  });

  it('rejects the schemes z.string().url() would have allowed', () => {
    expect(uploadPathSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(uploadPathSchema.safeParse('data:text/html,x').success).toBe(false);
    expect(uploadPathSchema.safeParse('https://evil.com/x.jpg').success).toBe(false);
  });
});
