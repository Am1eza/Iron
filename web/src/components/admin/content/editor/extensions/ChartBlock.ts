/**
 * The `chart` block node (US-12.4) — a new capability, not a port: neither the
 * old editor nor the old renderer had any concept of a chart.
 *
 * It is an ATOM: the document holds the numbers, not a rendered picture, and
 * ProseMirror never puts a cursor inside it. All editing happens in the node
 * view's own form, which writes back through `updateAttributes`, so a chart in
 * the body is a small, typed piece of data that renders identically in the
 * panel and on the public page — the same `ArticleChart` component draws both.
 *
 * The alternative — asking a writer to paste JSON into a textarea — was
 * explicitly ruled out. The audience for this editor has never seen JSON.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { chartAttrsSchema, type ChartAttrs } from '@/lib/content/richDoc';
import { ChartNodeView } from '../ChartNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chartBlock: {
      /** Inserts a chart pre-filled with a small, editable example so the
       *  writer sees a real chart the instant they click «نمودار» — an empty
       *  grid of inputs reads as broken. */
      insertChart: (attrs?: Partial<ChartAttrs>) => ReturnType;
    };
  }
}

export const DEFAULT_CHART: ChartAttrs = {
  kind: 'bar',
  title: 'عنوان نمودار',
  unit: 'تومان',
  labels: ['فروردین', 'اردیبهشت', 'خرداد'],
  series: [{ label: 'سری اول', values: [0, 0, 0] }],
  source: '',
};

export const ChartBlock = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: DEFAULT_CHART.kind },
      title: { default: '' },
      unit: { default: '' },
      labels: { default: [] as string[] },
      series: { default: [] as ChartAttrs['series'] },
      source: { default: '' },
    };
  },

  parseHTML() {
    // Round-trips a chart through a copy/paste within the editor. Anything
    // arriving from outside simply isn't a chart, which is the correct
    // outcome — the data has to have been entered here. `getAttrs` returning
    // `false` makes ProseMirror reject the match entirely (falls through to
    // the next rule / plain text), so a shape the schema won't accept can
    // never reach `ChartNodeView`'s render — the same `chartAttrsSchema` the
    // server enforces on save is enforced here, before the first paint.
    return [{ tag: 'div[data-chart]', getAttrs: (el) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse((el as HTMLElement).getAttribute('data-chart') || '{}');
      } catch {
        return false;
      }
      const result = chartAttrsSchema.safeParse(parsed);
      return result.success ? result.data : false;
    } }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes({ 'data-chart': JSON.stringify(node.attrs) }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },

  addCommands() {
    return {
      insertChart:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { ...DEFAULT_CHART, ...attrs },
          }),
    };
  },
});
