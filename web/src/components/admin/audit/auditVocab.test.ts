/** The activity log's readability rests on this diff — pin its behaviour. */
import { describe, it, expect } from 'vitest';
import { diffFields, actionMeta, entityLabel, fieldLabel } from './auditVocab';

describe('diffFields', () => {
  it('returns ONLY the fields that actually changed', () => {
    const changes = diffFields(
      { title: 'میلگرد', price: 100, slug: 'rebar' },
      { title: 'میلگرد', price: 120, slug: 'rebar' },
    );
    expect(changes).toEqual([{ key: 'price', before: 100, after: 120 }]);
  });

  it('counts a key present on only one side (added / removed)', () => {
    expect(diffFields({}, { role: 'sales' })).toEqual([{ key: 'role', before: undefined, after: 'sales' }]);
    expect(diffFields({ role: 'sales' }, {})).toEqual([{ key: 'role', before: 'sales', after: undefined }]);
  });

  it('treats deep-equal objects/arrays as unchanged', () => {
    expect(diffFields({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
    expect(diffFields({ tags: ['a'] }, { tags: ['b'] })).toHaveLength(1);
  });

  it('tolerates null/undefined snapshots (create and delete events)', () => {
    expect(diffFields(undefined, { name: 'x' })).toHaveLength(1);
    expect(diffFields(null, null)).toEqual([]);
  });
});

describe('vocabulary', () => {
  it('maps known actions to a Persian verb and a tone', () => {
    expect(actionMeta('content.publish')).toEqual({ verb: 'مقاله را منتشر کرد', tone: 'publish' });
    expect(actionMeta('lead.delete').tone).toBe('destroy');
  });

  it('falls back to the raw code rather than hiding an unmapped event', () => {
    expect(actionMeta('brand.new.action').verb).toBe('brand.new.action');
  });

  it('labels entities and fields, passing unknown keys through', () => {
    expect(entityLabel('sku')).toBe('کالا');
    expect(entityLabel('mystery')).toBe('mystery');
    expect(fieldLabel('slug')).toBe('نشانی (Slug)');
    expect(fieldLabel('zzz')).toBe('zzz');
  });
});
