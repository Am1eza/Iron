/**
 * The i18n audit's condition 5 — «یک فرایند بازبینی کیفیت ترجمه برای هر PR
 * که کلید تازه به کاتالوگ پیام اضافه می‌کند … بدون این فرایند، این الگو
 * تکرار می‌شود».
 *
 * The audit's root-cause finding was that ~1940 lines of hardcoded Persian
 * sat in 159 client-facing files, so switching language left most of the
 * functional site in Persian. That sweep has since been done. What was never
 * built is the thing that keeps it done: nothing stops the next component
 * from shipping with its Persian written inline, and the failure is
 * invisible to every existing test — the Persian-speaking majority of users
 * see exactly what they expect.
 *
 * This walks the TypeScript AST of every CUSTOMER-FACING component and
 * reports user-visible Persian that did not come from the message catalogue.
 *
 * The AST matters for one specific reason: this codebase documents itself in
 * Persian. `PriceHeader.tsx`'s header comment is «بر اساس کارخانه», and a
 * regex over file text flags it. Comments are not nodes in the walk below, so
 * they are structurally out of scope rather than filtered out by a fragile
 * heuristic.
 *
 * OUT OF SCOPE, deliberately:
 *  - `src/components/admin/**` and `src/app/admin/**` — the panel is
 *    staff-only and Persian by design (CLAUDE.md: the admin panel lives on
 *    panel.ahantime.com and is never shown to a foreign customer). Making it
 *    translatable would be work with no reader.
 *  - tests, stories and the message catalogues themselves.
 */
import ts from 'typescript';
import fs from 'node:fs';

/** Persian/Arabic letters. Deliberately NOT the whole block: Persian digits
 *  (۰-۹) and «٬» are formatting, and appear legitimately in code that builds
 *  numbers. A letter is what makes a string a sentence. */
const PERSIAN_LETTER = /[ء-غف-يپچژکگھی]/;

/** Props whose string value is read out loud or rendered. */
const USER_VISIBLE_PROPS = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
  'label',
  'heading',
  'headline',
  'caption',
  'description',
  'message',
  'confirmLabel',
  'cancelLabel',
  'emptyMessage',
]);

const EXEMPT = /i18n-exempt:/;

export interface Finding {
  file: string;
  line: number;
  column: number;
  kind: 'jsx-text' | 'prop' | 'object-label' | 'throw';
  snippet: string;
}

function hasExemption(source: ts.SourceFile, pos: number): boolean {
  const { line } = source.getLineAndCharacterOfPosition(pos);
  const lines = source.getFullText().split('\n');
  return [lines[line], lines[line - 1]].some((l) => Boolean(l && EXEMPT.test(l)));
}

export function scanFiles(files: readonly string[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!PERSIAN_LETTER.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const record = (node: ts.Node, kind: Finding['kind'], snippet: string) => {
      const start = node.getStart(source);
      if (hasExemption(source, start)) return;
      const { line, character } = source.getLineAndCharacterOfPosition(start);
      findings.push({
        file,
        line: line + 1,
        column: character + 1,
        kind,
        snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, 80),
      });
    };

    const visit = (node: ts.Node): void => {
      // 1. Text rendered directly between tags.
      if (ts.isJsxText(node) && PERSIAN_LETTER.test(node.text)) {
        record(node, 'jsx-text', node.text);
      }

      // 2. A user-visible prop given a Persian literal.
      if (ts.isJsxAttribute(node) && node.initializer) {
        const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(source);
        if (USER_VISIBLE_PROPS.has(name)) {
          const init = node.initializer;
          const literal = ts.isJsxExpression(init) ? init.expression : init;
          if (
            literal &&
            (ts.isStringLiteral(literal) ||
              ts.isNoSubstitutionTemplateLiteral(literal) ||
              ts.isTemplateExpression(literal)) &&
            PERSIAN_LETTER.test(literal.getText(source))
          ) {
            record(node, 'prop', node.getText(source));
          }
        }
      }

      // 3. A user-visible string passed as an object property rather than a
      // JSX attribute — `breadcrumbs={[{ label: 'خانه', href: … }]}` is the
      // shape that carries most of the remaining ones, and it renders in
      // exactly the same place a JSX attribute would.
      if (ts.isPropertyAssignment(node)) {
        const name =
          ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : undefined;
        const value = node.initializer;
        if (
          name &&
          USER_VISIBLE_PROPS.has(name) &&
          (ts.isStringLiteral(value) ||
            ts.isNoSubstitutionTemplateLiteral(value) ||
            ts.isTemplateExpression(value)) &&
          PERSIAN_LETTER.test(value.getText(source))
        ) {
          record(node, 'object-label', node.getText(source));
        }
      }

      // 4. A Persian error message thrown or rejected — these surface in the
      // UI through the shared error boundary, so they are user-visible too.
      if (ts.isThrowStatement(node) && PERSIAN_LETTER.test(node.getText(source))) {
        record(node, 'throw', node.getText(source));
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return findings;
}
