import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown, parseBlocks, repairStreaming } from './ChatMarkdown';

describe('parseBlocks', () => {
  it('parses a GFM table with header, separator and body rows', () => {
    const md = ['| کارخانه | قیمت |', '|---|---|', '| ذوب‌آهن | 12500 |', '| میانه | 12300 |'].join('\n');
    const blocks = parseBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'table',
      header: ['کارخانه', 'قیمت'],
      rows: [
        ['ذوب‌آهن', '12500'],
        ['میانه', '12300'],
      ],
    });
  });

  it('pads ragged table rows to the header width instead of shifting columns', () => {
    const md = ['| الف | ب | ج |', '|---|---|---|', '| ۱ | ۲ |'].join('\n');
    const t = parseBlocks(md)[0]!;
    expect(t.kind).toBe('table');
    if (t.kind === 'table') expect(t.rows[0]).toEqual(['۱', '۲', '']);
  });

  it('groups bullet and ordered lists (Persian digits included)', () => {
    const md = ['- اول', '- دوم', '', '۱. یک', '2. دو'].join('\n');
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual(['ul', 'ol']);
  });

  it('a pipe-less paragraph, a heading and an hr all survive around a table', () => {
    const md = ['### مقایسه', 'متن ساده', '---', '| a |', 'no table here'].join('\n');
    const kinds = parseBlocks(md).map((b) => b.kind);
    // `| a |` with no separator row is NOT a table — degrades to paragraph text.
    expect(kinds).toEqual(['h', 'p', 'hr', 'p']);
  });

  it('never throws on partial/streaming markdown (half-open table, dangling bold)', () => {
    expect(() => parseBlocks('| کارخانه | قی')).not.toThrow();
    expect(() => parseBlocks('این **مهم است و')).not.toThrow();
    expect(() => parseBlocks('|---|---|')).not.toThrow();
  });
});

describe('repairStreaming', () => {
  it('closes a dangling ** so the tail never flashes as literal asterisks', () => {
    expect(repairStreaming('این **مهم')).toBe('این **مهم**');
    expect(repairStreaming('این **مهم** است')).toBe('این **مهم** است');
  });

  it('closes a dangling backtick', () => {
    expect(repairStreaming('گرید `A3')).toBe('گرید `A3`');
  });

  it('holds back a half-written table row until its line completes', () => {
    const buf = '| کارخانه | قیمت |\n|---|---|\n| ذوب‌آهن | 12500 |\n| میانه | 12';
    const repaired = repairStreaming(buf);
    expect(repaired).not.toContain('میانه');
    expect(repaired).toContain('ذوب‌آهن');
  });

  it('keeps a completed trailing row', () => {
    const buf = '| الف | ب |\n|---|---|\n| ۱ | ۲ |';
    expect(repairStreaming(buf)).toBe(buf);
  });
});

describe('ChatMarkdown rendering', () => {
  it('renders **bold** as <strong>, not literal asterisks', () => {
    render(<ChatMarkdown text="قیمت **12500 تومان** است" />);
    expect(screen.getByText('۱۲۵۰۰ تومان').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('renders a table element with Persian digits in cells', () => {
    const md = ['| کارخانه | قیمت |', '|---|---|', '| ذوب‌آهن | 12500 |'].join('\n');
    render(<ChatMarkdown text={md} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('۱۲۵۰۰')).toBeTruthy();
  });

  it('escapes HTML by construction — markup in model text renders as text', () => {
    const { container } = render(<ChatMarkdown text={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img');
  });

  it('renders a > blockquote as a callout, not a literal ">" character', () => {
    const { container } = render(<ChatMarkdown text={'> قدم بعدی: ثبت درخواست'} />);
    expect(container.querySelector('blockquote')).toBeTruthy();
    expect(container.textContent).not.toContain('>');
  });

  it('renders list items and converts digits', () => {
    render(<ChatMarkdown text={'- شاخه 12 متری\n- بندیل 2 تنی'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/شاخه ۱۲ متری/)).toBeTruthy();
  });
});
