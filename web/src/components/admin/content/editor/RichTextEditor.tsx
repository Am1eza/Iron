'use client';
/**
 * The article body editor (US-12.4).
 *
 * Replaces a raw `<textarea>` whose toolbar inserted markdown TOKENS by string
 * surgery — `**` around the selection, `## ` in front of the line — and left
 * the writer to imagine the result. Three complaints came out of that design,
 * all of them real: no way to put a picture in the middle of an article, no
 * way to build a table, no charts at all.
 *
 * What actually fixes them is not a better toolbar over a textarea; it is that
 * the writer never sees syntax again. Every capability here is a visible
 * control, the document is a tree rather than a string, and what appears in
 * this box is drawn by the same stylesheet as the published page.
 *
 * BOUNDARIES
 * ----------
 * · This is the only file in the app that loads Tiptap. The public article
 *   page renders the same document through `components/content/RichContent`,
 *   which imports nothing from here — readers get no editor runtime.
 * · Everything leaving this component goes through `sanitizeDoc`, i.e. the
 *   SAME zod schema the API validates against, so what the panel calls
 *   "unsaved changes" and what the server stores can never be different
 *   shapes of the same content.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { adminApi } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { useToast } from '@/lib/hooks/useToast';
import { sanitizeDoc, type RichDoc } from '@/lib/content/richDoc';
import { toPersianDigits } from '@/lib/utils/format';
import { compressImageForUpload } from '@/lib/utils/compressImage';
import { ArticleImage, type ImageEditRequest } from './extensions/ArticleImage';
import { ChartBlock } from './extensions/ChartBlock';
import { ImageDetailsDialog } from './ImageDetailsDialog';
import { LinkDialog } from './LinkDialog';
import { TableGridPicker } from './TableGridPicker';
import {
  BoldIcon,
  BulletListIcon,
  ChartBarIcon,
  ColumnMinusIcon,
  ColumnPlusIcon,
  HeaderRowIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  PictureIcon,
  QuoteIcon,
  RedoIcon,
  RowMinusIcon,
  RowPlusIcon,
  RuleIcon,
  SubheadingIcon,
  UndoIcon,
} from './editorIcons';
import s from './editor.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

/** Natural pixel size of an already-uploaded image, read in the browser so the
 *  renderer can reserve its box (`width`/`height` + `aspect-ratio`) and stop
 *  the article's text jumping around it while it loads. Best-effort: a
 *  network hiccup on this decode-only fetch must not block placing the
 *  picture, so a failure resolves to `null` rather than rejecting. */
function measureImage(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
/** Persian reads at roughly this pace; the figure is a rough courtesy for the
 *  writer, not a metric anything depends on. */
const WORDS_PER_MINUTE = 200;

type ToolButtonProps = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Icon-only controls (undo/redo) still need an accessible name. */
  iconOnly?: boolean;
};

function ToolButton({ label, icon, onClick, active, disabled, iconOnly }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={s.toolBtn}
      // A toolbar button that toggles state must SAY it toggles — `aria-pressed`
      // is what makes "bold is currently on" audible.
      aria-pressed={active}
      aria-label={iconOnly ? label : undefined}
      title={label}
      disabled={disabled}
      // The editor loses its selection the moment a button takes focus, and
      // then `toggleBold()` has nothing to apply to.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {iconOnly ? null : label}
    </button>
  );
}

export function RichTextEditor({
  initialDoc,
  onChange,
  onReady,
}: {
  initialDoc: RichDoc;
  /** Fires on every edit, with the document exactly as the server will store it. */
  onChange: (doc: RichDoc) => void;
  /** Fires once, with the document the editor NORMALISED the input into.
   *  The drawer uses it as the "unchanged" baseline — without it, simply
   *  opening an article counted as an edit, because ProseMirror fills in
   *  attribute defaults the stored JSON did not carry. */
  onReady: (doc: RichDoc) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // A SEPARATE input from `fileRef`: that one always starts a brand-new
  // insertion (`uploadThenAsk` clears `applyImageRef` and resets alt/
  // caption). Swapping the picture inside an already-open dialog — new or
  // editing a placed image — must keep whatever apply-target and alt text
  // the writer already has; only `src`/`width`/`height` change.
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [pendingImage, setPendingImage] = useState<ImageEditRequest | null>(null);
  /** Set when an ALREADY-PLACED image is being edited; the node view hands us
   *  the writer-back function so we don't have to hunt for the node position. */
  const applyImageRef = useRef<((next: ImageEditRequest) => void) | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSeed, setLinkSeed] = useState({ text: '', href: '', hasSelection: false });

  const openImageEditor = useCallback((current: ImageEditRequest, apply: (next: ImageEditRequest) => void) => {
    applyImageRef.current = apply;
    setPendingImage(current);
  }, []);

  // `uploading` (React state) is read inside `handlePaste`/`handleDrop`, which
  // Tiptap captures once when the editor is created — a plain read of the
  // state variable there would always see the value from that first render.
  // Mirroring it into a ref, updated on every render, is what lets those
  // handlers see the CURRENT in-flight status.
  const uploadingRef = useRef(false);

  /** Upload first, THEN ask for the description — the writer can see the
   *  picture while writing its alt text, which is the difference between a
   *  useful description and «تصویر».
   *
   *  Deliberately serial: `pendingImage`/`applyImageRef` are single slots, not
   *  a queue. Two uploads racing (e.g. paste, then paste again before the
   *  first dialog appears) would have the second silently overwrite the
   *  first's result — the first upload succeeds on the server but is never
   *  referenced by the document, a quiet loss of the writer's own current
   *  work. Refusing to start a second upload while one is in flight is
   *  simpler than a queue and matches what the toolbar button already showed
   *  (disabled while `uploading`) — paste/drop just didn't honour it. */
  const uploadThenAsk = useCallback(
    async (file: File) => {
      if (uploadingRef.current) {
        toast.error('یک تصویر در حال آپلود است؛ کمی صبر کنید.');
        return;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        toast.error('فقط تصاویر JPG، PNG یا WebP مجاز است.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('حجم فایل نباید از ۵ مگابایت بیشتر باشد.');
        return;
      }
      uploadingRef.current = true;
      setUploading(true);
      try {
        const { url } = await adminApi.uploadImage(await compressImageForUpload(file));
        const dims = await measureImage(url);
        applyImageRef.current = null;
        setPendingImage({
          src: url,
          alt: '',
          caption: '',
          decorative: false,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'آپلود ناموفق بود؛ دوباره تلاش کنید.');
      } finally {
        uploadingRef.current = false;
        setUploading(false);
      }
    },
    [toast],
  );

  /** Swap the picture inside the dialog that is ALREADY open (US-14.6 —
   *  "می‌خواستم منظورم این بود که یک عکس دیگر را جابه‌جا کند"). Same
   *  validation/upload path as `uploadThenAsk`, but updates `pendingImage`
   *  in place instead of creating a fresh one — `applyImageRef`, and
   *  whatever alt/caption text is already typed, are left untouched. */
  const uploadReplacement = useCallback(
    async (file: File) => {
      if (uploadingRef.current) {
        toast.error('یک تصویر در حال آپلود است؛ کمی صبر کنید.');
        return;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        toast.error('فقط تصاویر JPG، PNG یا WebP مجاز است.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('حجم فایل نباید از ۵ مگابایت بیشتر باشد.');
        return;
      }
      uploadingRef.current = true;
      setReplacing(true);
      try {
        const { url } = await adminApi.uploadImage(await compressImageForUpload(file));
        const dims = await measureImage(url);
        setPendingImage((prev) => (prev ? { ...prev, src: url, width: dims?.width ?? null, height: dims?.height ?? null } : prev));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'آپلود ناموفق بود؛ دوباره تلاش کنید.');
      } finally {
        uploadingRef.current = false;
        setReplacing(false);
      }
    },
    [toast],
  );

  // `handlePaste`/`handleDrop` are captured when the editor is created, so they
  // close over the FIRST `uploadThenAsk`. Keeping the live one in a ref means
  // the handlers always call the current implementation.
  const uploadRef = useRef(uploadThenAsk);
  uploadRef.current = uploadThenAsk;

  const editor = useEditor({
    // Next renders this on the server first; Tiptap must not touch the DOM
    // until hydration or the first paint mismatches.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // The document schema is deliberately small — every node type here is
        // one the public renderer knows how to draw and the zod schema
        // accepts. Anything else would validate to a 400 on save, which is a
        // terrible way for a writer to discover a formatting option exists.
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        strike: false,
        underline: false,
        // Persian typography does not use underline for emphasis, and an
        // underlined run is indistinguishable from a link to a reader.
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto', 'tel'],
          HTMLAttributes: { rel: 'noopener' },
        },
        dropcursor: { color: 'var(--color-accent)', width: 2 },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? 'عنوان بخش…' : 'متن مقاله را اینجا بنویسید…',
      }),
      // `resizable` gives the writer column-width handles; without it a wide
      // Persian column and a two-digit number column get the same width.
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      ArticleImage.configure({ onEdit: openImageEditor }),
      ChartBlock,
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        // `noUncheckedIndexedAccess` types every CSS-module lookup as possibly
        // undefined; this map has to be Record<string, string>.
        class: s.surface ?? '',
        dir: 'rtl',
        // The drawer's own aria-label names the dialog; this names the field.
        'aria-label': 'متن مقاله',
        role: 'textbox',
        'aria-multiline': 'true',
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? [])[0];
        if (!file || !file.type.startsWith('image/')) return false;
        event.preventDefault();
        void uploadRef.current(file);
        return true;
      },
      handleDrop: (_view, event) => {
        const file = Array.from((event as DragEvent).dataTransfer?.files ?? [])[0];
        if (!file || !file.type.startsWith('image/')) return false;
        event.preventDefault();
        void uploadRef.current(file);
        return true;
      },
      // Pasting a FILE (a screenshot, an image copied from the OS) is caught
      // above and always goes through `uploadThenAsk` — the upload endpoint
      // and the alt-text dialog. Pasting a chunk of HTML that merely CONTAINS
      // an `<img src="https://…">` (a paragraph copied from another website,
      // or out of Word/Google Docs) is a different path: it carries no `File`
      // object at all, so `handlePaste` above never fires, and it would
      // otherwise fall straight through to ProseMirror's default HTML
      // parsing, which matches any bare `<img>` and inserts it with whatever
      // (often empty) `alt` the source had — silently defeating the one thing
      // this editor exists to guarantee. Stripping `<img>` out of pasted HTML
      // here means every picture in the body, with no exception, went through
      // the upload + alt-text flow to get there.
      transformPastedHTML: (html) => html.replace(/<img\b[^>]*>/gi, ''),
    },
    onCreate: ({ editor: ed }) => {
      onReady(sanitizeDoc(ed.getJSON()).doc);
    },
    onUpdate: ({ editor: ed }) => {
      const { doc, dropped } = sanitizeDoc(ed.getJSON());
      if (dropped > 0) {
        toast.error('بخشی از محتوای چسبانده‌شده پشتیبانی نمی‌شود و حذف شد.');
      }
      onChange(doc);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            h2: ed.isActive('heading', { level: 2 }),
            h3: ed.isActive('heading', { level: 3 }),
            bullet: ed.isActive('bulletList'),
            ordered: ed.isActive('orderedList'),
            quote: ed.isActive('blockquote'),
            link: ed.isActive('link'),
            inTable: ed.isActive('table'),
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
            words: ed.getText({ blockSeparator: ' ' }).trim().split(/\s+/).filter(Boolean).length,
          }
        : null,
  });

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    const href = (editor.getAttributes('link').href as string | undefined) ?? '';
    // Editing an existing link with a collapsed caret: take the whole link's
    // text, not the zero-width selection under the cursor.
    let text = selected;
    if (!text && href) {
      editor.commands.extendMarkRange('link');
      const sel = editor.state.selection;
      text = editor.state.doc.textBetween(sel.from, sel.to, ' ');
    }
    setLinkSeed({ text, href, hasSelection: Boolean(text) });
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(
    ({ text, href }: { text: string; href: string }) => {
      if (!editor) return;
      // One path, three cases: a fresh caret, a selected run, and an existing
      // link being re-pointed. `extendMarkRange` turns the third into the
      // second, and `insertContent` replaces whatever is selected — so the
      // link text the dialog shows is always the link text that results.
      const chain = editor.chain().focus();
      if (editor.isActive('link')) chain.extendMarkRange('link');
      chain
        .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
        // Without this the mark stays "on" and the next character typed after
        // the link silently becomes part of it.
        .unsetMark('link')
        .run();
      setLinkOpen(false);
    },
    [editor],
  );

  const insertImage = useCallback(
    (next: ImageEditRequest) => {
      const apply = applyImageRef.current;
      if (apply) {
        apply(next);
      } else if (editor) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src: next.src,
              alt: next.alt,
              caption: next.caption || null,
              decorative: next.decorative,
              width: next.width ?? null,
              height: next.height ?? null,
            },
          })
          .run();
      }
      applyImageRef.current = null;
      setPendingImage(null);
    },
    [editor],
  );

  const readingMinutes = useMemo(
    () => Math.max(1, Math.round((state?.words ?? 0) / WORDS_PER_MINUTE)),
    [state?.words],
  );

  // NOTE: the editor is created once and `initialDoc` is never re-applied.
  // Switching articles remounts this component with a new React key (see the
  // drawer), which is also what guarantees article A's text can never be
  // written onto article B. `useEditor` handles its own teardown.

  if (!editor) {
    return <div className={s.loading} aria-busy="true">در حال آماده‌سازی ویرایشگر…</div>;
  }

  return (
    <div className={s.root}>
      <div className={s.toolbar} role="toolbar" aria-label="ابزار نوشتن">
        <div className={s.group}>
          <ToolButton
            label="پررنگ"
            icon={<BoldIcon />}
            active={state?.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolButton
            label="مورب"
            icon={<ItalicIcon />}
            active={state?.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolButton label="پیوند" icon={<LinkIcon />} active={state?.link} onClick={openLinkDialog} />
        </div>

        <span className={s.sep} aria-hidden="true" />

        <div className={s.group}>
          <ToolButton
            label="عنوان"
            icon={<HeadingIcon />}
            active={state?.h2}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolButton
            label="زیرعنوان"
            icon={<SubheadingIcon />}
            active={state?.h3}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
          <ToolButton
            label="فهرست"
            icon={<BulletListIcon />}
            active={state?.bullet}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolButton
            label="فهرست شماره‌دار"
            icon={<OrderedListIcon />}
            active={state?.ordered}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolButton
            label="نقل‌قول"
            icon={<QuoteIcon />}
            active={state?.quote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        </div>

        <span className={s.sep} aria-hidden="true" />

        <div className={s.group}>
          <ToolButton
            label={uploading ? 'در حال آپلود…' : 'تصویر'}
            icon={<PictureIcon />}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          />
          <TableGridPicker
            onInsert={({ rows, cols, withHeaderRow }) =>
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow }).run()
            }
          />
          <ToolButton
            label="نمودار"
            icon={<ChartBarIcon />}
            onClick={() => editor.chain().focus().insertChart().run()}
          />
          <ToolButton
            label="خط جداکننده"
            icon={<RuleIcon />}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
        </div>

        <span className={s.spacer} />

        <div className={s.group}>
          <ToolButton
            label="واگرد"
            iconOnly
            icon={<UndoIcon />}
            disabled={!state?.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolButton
            label="ازنو"
            iconOnly
            icon={<RedoIcon />}
            disabled={!state?.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
      </div>

      {/* Table controls appear only where they mean something. A permanently
          visible "حذف ستون" next to "پررنگ" is noise 95% of the time and, the
          other 5%, ambiguous about which column it would delete. */}
      {state?.inTable ? (
        <div className={s.contextBar} role="toolbar" aria-label="ابزار جدول">
          <span className={s.contextLabel}>جدول</span>
          <ToolButton label="افزودن سطر" icon={<RowPlusIcon />} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolButton label="حذف سطر" icon={<RowMinusIcon />} onClick={() => editor.chain().focus().deleteRow().run()} />
          <ToolButton
            label="افزودن ستون"
            icon={<ColumnPlusIcon />}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          />
          <ToolButton
            label="حذف ستون"
            icon={<ColumnMinusIcon />}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          />
          <ToolButton
            label="سطر عنوان"
            icon={<HeaderRowIcon />}
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          />
          <ToolButton
            label="حذف جدول"
            icon={<ColumnMinusIcon />}
            onClick={() => editor.chain().focus().deleteTable().run()}
          />
        </div>
      ) : null}

      <EditorContent editor={editor} className={s.surfaceWrap} />

      <p className={s.status} aria-live="polite">
        {toPersianDigits(state?.words ?? 0)} واژه · حدود {toPersianDigits(readingMinutes)} دقیقه مطالعه
      </p>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void uploadRef.current(file);
        }}
      />
      <input
        ref={replaceFileRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void uploadReplacement(file);
        }}
      />

      <ImageDetailsDialog
        open={pendingImage !== null}
        initial={pendingImage}
        onSubmit={insertImage}
        onReplace={() => replaceFileRef.current?.click()}
        replacing={replacing}
        onClose={() => {
          applyImageRef.current = null;
          setPendingImage(null);
        }}
      />

      <LinkDialog
        open={linkOpen}
        initialText={linkSeed.text}
        initialHref={linkSeed.href}
        hasSelection={linkSeed.hasSelection}
        onSubmit={applyLink}
        onRemove={() => {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          setLinkOpen(false);
        }}
        onClose={() => setLinkOpen(false)}
      />
    </div>
  );
}
