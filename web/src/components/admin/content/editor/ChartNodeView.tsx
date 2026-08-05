'use client';
/**
 * The chart block's editing surface (US-12.4) — a small spreadsheet beside a
 * LIVE preview drawn by `ArticleChart`, the exact component the public article
 * page uses. Not a JSON textarea: the writers this editor exists for are
 * non-technical, and the fastest way to make a feature unused is to make its
 * only input a syntax.
 *
 * The preview is rendered from local state rather than from `node.attrs` so
 * typing stays responsive; every edit is still committed to the document
 * immediately, so nothing here can be lost by clicking away.
 */
import { useRef, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Button } from '@/components/ui';
import { ArticleChart } from '@/components/content/ArticleChart';
import { MAX_CHART_POINTS, MAX_CHART_SERIES, type ChartAttrs, type ChartKind } from '@/lib/content/richDoc';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { ChartBarIcon, ChartLineIcon } from './editorIcons';
import s from './editor.module.css';

/** Persian digits, «٫» decimals and stray spaces all have to parse — a writer
 *  types «۱۲۳۴٫۵», not `1234.5`. An unparseable cell is a GAP (null), never a
 *  zero: a zero would draw a bar to the floor and read as "the price was 0". */
function parseNumber(raw: string): number | null {
  const cleaned = normalizeDigits(raw)
    .replace(/[٫،,]/g, (m) => (m === '٫' ? '.' : ''))
    .replace(/\s/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function displayNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return toPersianDigits(String(v)).replace('.', '٫');
}

export function ChartNodeView(props: ReactNodeViewProps) {
  const { node, updateAttributes, deleteNode, selected } = props;
  const idBase = useRef(`chart-editor-${Math.random().toString(36).slice(2, 8)}`).current;

  const [attrs, setAttrs] = useState<ChartAttrs>(() => ({
    kind: (node.attrs.kind as ChartKind) ?? 'bar',
    title: String(node.attrs.title ?? ''),
    unit: String(node.attrs.unit ?? ''),
    labels: Array.isArray(node.attrs.labels) ? (node.attrs.labels as string[]) : [],
    series: Array.isArray(node.attrs.series) ? (node.attrs.series as ChartAttrs['series']) : [],
    source: String(node.attrs.source ?? ''),
  }));
  /** In-progress text for a numeric cell. Kept separate from the committed
   *  value so «۱۲٫» (mid-typing) doesn't round-trip through Number() and
   *  erase the character the writer just pressed. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const commit = (next: ChartAttrs) => {
    setAttrs(next);
    updateAttributes(next);
  };

  const setLabel = (i: number, value: string) => {
    const labels = [...attrs.labels];
    labels[i] = value;
    commit({ ...attrs, labels });
  };

  const setSeriesLabel = (si: number, value: string) => {
    const series = attrs.series.map((sr, i) => (i === si ? { ...sr, label: value } : sr));
    commit({ ...attrs, series });
  };

  const setCell = (si: number, i: number, raw: string) => {
    setDrafts((d) => ({ ...d, [`${si}-${i}`]: raw }));
    const series = attrs.series.map((sr, idx) => {
      if (idx !== si) return sr;
      const values = [...sr.values];
      values[i] = parseNumber(raw);
      return { ...sr, values };
    });
    commit({ ...attrs, series });
  };

  const addRow = () => {
    if (attrs.labels.length >= MAX_CHART_POINTS) return;
    commit({
      ...attrs,
      labels: [...attrs.labels, ''],
      series: attrs.series.map((sr) => ({ ...sr, values: [...sr.values, null] })),
    });
  };

  const removeRow = (i: number) => {
    commit({
      ...attrs,
      labels: attrs.labels.filter((_, idx) => idx !== i),
      series: attrs.series.map((sr) => ({ ...sr, values: sr.values.filter((_, idx) => idx !== i) })),
    });
    setDrafts({});
  };

  const addSeries = () => {
    if (attrs.series.length >= MAX_CHART_SERIES) return;
    commit({
      ...attrs,
      series: [
        ...attrs.series,
        {
          label: `سری ${toPersianDigits(attrs.series.length + 1)}`,
          values: attrs.labels.map(() => null),
        },
      ],
    });
  };

  const removeSeries = (si: number) => {
    commit({ ...attrs, series: attrs.series.filter((_, i) => i !== si) });
    setDrafts({});
  };

  return (
    <NodeViewWrapper
      className={s.chartNode}
      data-selected={selected ? '' : undefined}
      contentEditable={false}
      draggable
      data-drag-handle
      // ProseMirror's keymap is document-wide: without this, Backspace in the
      // «عنوان» field deletes the chart instead of a character.
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      // Same reasoning for paste: without this, pasting text into one of this
      // node's own inputs (e.g. a data value) bubbles up to the editor's
      // document-wide `handlePaste` and triggers the image-upload flow
      // instead of a normal text paste into the field.
      onPaste={(e: React.ClipboardEvent) => e.stopPropagation()}
    >
      <div className={s.chartNodeHead}>
        <span className={s.chartNodeKicker}>نمودار</span>
        <div className={s.kindToggle} role="group" aria-label="نوع نمودار">
          <button
            type="button"
            className={s.kindBtn}
            aria-pressed={attrs.kind === 'bar'}
            onClick={() => commit({ ...attrs, kind: 'bar' })}
          >
            <ChartBarIcon />
            ستونی
          </button>
          <button
            type="button"
            className={s.kindBtn}
            aria-pressed={attrs.kind === 'line'}
            onClick={() => commit({ ...attrs, kind: 'line' })}
          >
            <ChartLineIcon />
            خطی
          </button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => deleteNode()} style={{ marginInlineStart: 'auto' }}>
          حذف نمودار
        </Button>
      </div>

      <div className={s.chartNodeGrid}>
        <div className={s.chartNodeForm}>
          <label className={s.field}>
            <span className={s.fieldLabel}>عنوان نمودار</span>
            <input
              className={s.input}
              value={attrs.title}
              maxLength={160}
              placeholder="مثلاً روند قیمت میلگرد ۱۴"
              onChange={(e) => commit({ ...attrs, title: e.target.value })}
            />
          </label>
          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>واحد</span>
              <input
                className={s.input}
                value={attrs.unit}
                maxLength={40}
                placeholder="تومان"
                onChange={(e) => commit({ ...attrs, unit: e.target.value })}
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>منبع داده</span>
              <input
                className={s.input}
                value={attrs.source ?? ''}
                maxLength={200}
                placeholder="مثلاً بورس کالای ایران"
                onChange={(e) => commit({ ...attrs, source: e.target.value })}
              />
            </label>
          </div>

          <div className={s.dataGridWrap}>
            <table className={s.dataGrid}>
              <thead>
                <tr>
                  <th scope="col">دسته</th>
                  {attrs.series.map((sr, si) => (
                    <th key={si} scope="col">
                      <div className={s.seriesHead}>
                        <input
                          className={s.input}
                          value={sr.label}
                          maxLength={60}
                          aria-label={`نام سری ${toPersianDigits(si + 1)}`}
                          onChange={(e) => setSeriesLabel(si, e.target.value)}
                        />
                        <span className={s.seriesSwatch} data-series={si} aria-hidden="true" />
                        {attrs.series.length > 1 ? (
                          <button
                            type="button"
                            className={s.miniBtn}
                            aria-label={`حذف سری ${sr.label || toPersianDigits(si + 1)}`}
                            onClick={() => removeSeries(si)}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th scope="col">
                    <span className="visually-hidden">حذف ردیف</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attrs.labels.map((label, i) => (
                  <tr key={i}>
                    <th scope="row">
                      <input
                        className={s.input}
                        value={label}
                        maxLength={60}
                        aria-label={`نام دستهٔ ${toPersianDigits(i + 1)}`}
                        onChange={(e) => setLabel(i, e.target.value)}
                      />
                    </th>
                    {attrs.series.map((sr, si) => (
                      <td key={si}>
                        <input
                          className={`${s.input} ${s.numInput} tnum`}
                          inputMode="decimal"
                          value={drafts[`${si}-${i}`] ?? displayNumber(sr.values[i])}
                          aria-label={`${sr.label || `سری ${toPersianDigits(si + 1)}`} — ${label || toPersianDigits(i + 1)}`}
                          onChange={(e) => setCell(si, i, e.target.value)}
                          onBlur={() =>
                            setDrafts((d) => {
                              const next = { ...d };
                              delete next[`${si}-${i}`];
                              return next;
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      {attrs.labels.length > 1 ? (
                        <button
                          type="button"
                          className={s.miniBtn}
                          aria-label={`حذف ردیف ${label || toPersianDigits(i + 1)}`}
                          onClick={() => removeRow(i)}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.chartNodeActions}>
            <Button type="button" size="sm" variant="ghost" onClick={addRow} disabled={attrs.labels.length >= MAX_CHART_POINTS}>
              افزودن ردیف
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addSeries}
              disabled={attrs.series.length >= MAX_CHART_SERIES}
            >
              افزودن سری داده
            </Button>
            {attrs.series.length >= MAX_CHART_SERIES ? (
              <span className={s.hint}>
                بیشتر از {toPersianDigits(MAX_CHART_SERIES)} سری در یک نمودار خوانا نیست؛ نمودار دوم اضافه کنید.
              </span>
            ) : null}
          </div>
        </div>

        <div className={s.chartNodePreview}>
          <span className={s.previewKicker}>همان چیزی که خواننده می‌بیند</span>
          <ArticleChart attrs={attrs} idBase={idBase} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
