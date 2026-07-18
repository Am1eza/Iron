import { describe, it, expect } from 'vitest';
import { toCsv, csvResponse } from './csv';

describe('toCsv', () => {
  it('joins headers and rows with commas and CRLF, prefixed with a UTF-8 BOM', () => {
    const out = toCsv(['a', 'b'], [['1', '2']]);
    expect(out).toBe('﻿a,b\r\n1,2\r\n');
  });

  it('quotes a field containing a comma, doubling nothing else', () => {
    expect(toCsv(['x'], [['a,b']])).toContain('"a,b"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(toCsv(['x'], [['a"b']])).toContain('"a""b"');
  });

  it('quotes a field containing a newline', () => {
    expect(toCsv(['x'], [['line1\nline2']])).toContain('"line1\nline2"');
  });

  it('renders null/undefined as an empty field, not the string "null"', () => {
    expect(toCsv(['x'], [[null, undefined] as unknown[]])).toContain('x\r\n,');
  });

  it('serializes a Date as ISO 8601', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(toCsv(['at'], [[d]])).toContain('2026-01-01T00:00:00.000Z');
  });

  it('leaves a Persian value untouched (no escaping needed for non-comma/quote text)', () => {
    expect(toCsv(['نام'], [['کارشناس فروش']])).toContain('کارشناس فروش');
  });
});

describe('csvResponse', () => {
  it('sets the CSV content type and an attachment filename', async () => {
    const res = csvResponse('test.csv', ['a'], [['1']]);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="test.csv"');
    expect(await res.text()).toContain('a\r\n1');
  });
});
