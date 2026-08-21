/**
 * Sub-category glyph resolution.
 *
 * The point of these is not "does the icon look right" — that is a design
 * question a test cannot answer — but the two things that WOULD silently rot:
 * that the name-first resolver keeps covering rows nobody listed by slug (the
 * catalog is admin-editable and gains rows without a deploy), and that the
 * word list stays ordered so a longer, more specific word is never shadowed by
 * a shorter one it contains.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { subCategoryGlyph, SubCategoryArt } from './SubCategoryArt';

describe('subCategoryGlyph', () => {
  it('resolves ورق sub-categories, whose names carry no shape word of their own', () => {
    // «سیاه» and «روغنی» are finishes; only the slug table can know they are
    // plate. This is the case the override table exists for.
    expect(subCategoryGlyph('sheet', 'black', 'سیاه')).toBe('plate');
    expect(subCategoryGlyph('sheet', 'galvanized', 'گالوانیزه')).toBe('plateCoated');
    expect(subCategoryGlyph('sheet', 'deck', 'عرشه فولادی')).toBe('deck');
    expect(subCategoryGlyph('sheet', 'sandwich-panel', 'ساندویچ پانل')).toBe('panel');
  });

  it('keeps the same slug under two categories on two different glyphs', () => {
    // `pipe` is a sub-category slug under both استیل and فلزات رنگی, and
    // `galvanized` under both ورق and لوله. Keying on the pair is what stops
    // «ورق گالوانیزه» from being drawn as a pipe.
    expect(subCategoryGlyph('sheet', 'galvanized', 'گالوانیزه')).toBe('plateCoated');
    expect(subCategoryGlyph('pipe', 'galvanized', 'گالوانیزه')).toBe('pipe');
  });

  it('resolves an unlisted row from its Persian name alone', () => {
    // None of these are in the slug table; they are what an admin typing a new
    // sub-category tomorrow would produce.
    expect(subCategoryGlyph('felezat-rangi', 'brass-angle', 'نبشی برنجی')).toBe('angle');
    expect(subCategoryGlyph('felezat-rangi', 'brass-channel', 'ناودانی برنجی')).toBe('channel');
    expect(subCategoryGlyph('steel', 'x', 'فلنج استنلس استیل')).toBe('flange');
    expect(subCategoryGlyph('wire', 'x', 'مفتول مسی')).toBe('wire');
    expect(subCategoryGlyph('sheet', 'x', 'ورق سیاه صادراتی')).toBe('plate');
  });

  it('tests the longer word first, so a shorter one it contains cannot shadow it', () => {
    // «سیم‌جوش» contains «سیم»; «سیم‌مفتول» contains both «سیم» and «مفتول».
    expect(subCategoryGlyph('wire', 'welding-wire', 'سیم‌جوش استیل')).toBe('wire');
    expect(subCategoryGlyph('wire', 'wire-rod', 'سیم‌مفتول استیل')).toBe('wire');
    // «ورق کرکره» must be the rolled profile, not the flat plate «ورق» would
    // give it.
    expect(subCategoryGlyph('sheet', 'corrugated', 'ورق کرکره')).toBe('corrugated');
    expect(subCategoryGlyph('sheet', 'roofing', 'ورق شیروانی')).toBe('corrugated');
    // «هاش سبک» must be the H section, not the I section «تیرآهن» gives.
    expect(subCategoryGlyph('ibeam', 'hash-sabok', 'هاش سبک')).toBe('beamH');
  });

  it('distinguishes the solid bar from the hollow section, which is the point of the category', () => {
    expect(subCategoryGlyph('profile', 'chaharpahlu', 'چهارپهلو')).toBe('squareBar');
    expect(subCategoryGlyph('profile', 'profil-sotuni', 'پروفیل ستونی')).toBe('box');
  });

  it('matches a one-word pattern on words, not on characters', () => {
    // «مش» is a substring of «نامشخص» and of «مشکی». A bare `includes` would
    // have drawn «ورق مشکی» as woven mesh — the failure this rule exists for.
    expect(subCategoryGlyph('sheet', 'x', 'ورق مشکی')).toBe('plate');
    expect(subCategoryGlyph('rebar', 'mystery', 'کالای نامشخص')).toBeNull();
    expect(subCategoryGlyph('steel', 'mesh', 'مش استنلس استیل')).toBe('mesh');
  });

  it('returns null when nothing matches, so the caller can fall back', () => {
    expect(subCategoryGlyph('rebar', 'mystery', 'قلم متفرقه')).toBeNull();
  });

  it('falls back to the parent category artwork rather than rendering nothing', () => {
    const { container } = render(
      <SubCategoryArt categorySlug="rebar" slug="mystery" name="کالای نامشخص" size={16} />,
    );
    // A ragged column — some rows iconed, some not — is worse than a repeated
    // category mark, so an unresolved row still draws something true of it.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('is decorative everywhere: no glyph contributes an accessible name', () => {
    const { container } = render(
      <SubCategoryArt categorySlug="sheet" slug="grating" name="گریتینگ" size={16} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.textContent).toBe('');
  });
});
