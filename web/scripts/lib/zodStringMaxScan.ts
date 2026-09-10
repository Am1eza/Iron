/**
 * H-173 — walks the TypeScript AST (not a regex/grep) looking for every
 * `z.string()` call, then checks whether it's chained with something that
 * bounds acceptable input (`.max()`, `.length()`, a fixed-format validator
 * like `.regex()`/`.uuid()`, or a `.superRefine()`/`.refine()` — the pattern
 * this codebase already uses for e.g. `mobileSchema`/`otpCodeSchema`, whose
 * semantic check makes an unbounded `.max()` moot). A field can also be
 * excluded explicitly by a `// unbounded:` (or `no-max`) comment on the same
 * or immediately preceding line — a deliberate, documented exception, not a
 * silent one — per the audit's own carve-out for "fields deliberately
 * unbounded and documented as such". `z.enum()`/`z.literal()`/etc. are
 * naturally exempt because they aren't `z.string()` calls at all.
 *
 * AST-based rather than regex specifically so a multi-line chain (very common
 * in this codebase's z.object({...}) schemas) is still followed correctly —
 * a naive same-line regex would miss `.max(60)` written on the next line.
 */
import ts from 'typescript';
import fs from 'node:fs';

/** Chained method names that count as "this string is already bounded". */
const BOUNDING_METHODS = new Set([
  'max',
  'length',
  'regex',
  'uuid',
  'uuidv4',
  'uuidv7',
  'cuid',
  'cuid2',
  'ulid',
  'nanoid',
  'ip',
  'cidr',
  'emoji',
  'base64',
  'base64url',
  'datetime',
  'date',
  'time',
  'duration',
  'jwt',
  'superRefine',
  'refine',
]);

const EXEMPT_COMMENT = /unbounded|no-max/i;

export interface Finding {
  file: string;
  line: number;
  column: number;
  snippet: string;
}

/** Walk up from a `z.string()` CallExpression through the chain of
 *  PropertyAccessExpression → CallExpression wrappers it's nested inside
 *  (that's how `.max(60)` etc. show up in the AST — as OUTER nodes wrapping
 *  the inner `z.string()` call), collecting every method name chained onto
 *  it. Stops at the first node that is not part of a fluent chain (e.g. once
 *  we hit the enclosing object-literal property or array element). */
function chainedMethodNames(node: ts.Node): string[] {
  const names: string[] = [];
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      names.push(parent.name.text);
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.expression === current) {
      // z.string() itself, or the method call the property access lives in
      // (e.g. `.max(60)`'s CallExpression) — keep climbing through it.
      current = parent;
      continue;
    }
    break;
  }
  return names;
}

function isExemptByComment(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const text = sourceFile.getFullText();
  // Leading trivia (comments) attached anywhere from the previous token up to
  // this node — covers a comment on the property assignment/statement this
  // call lives in (the common case: a `// unbounded: ...` line right above
  // `fieldName: z.string()`), not just trivia attached to the innermost
  // CallExpression node itself, which TypeScript usually assigns to the
  // OUTER property/statement instead.
  const leading = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  for (const range of leading) {
    if (EXEMPT_COMMENT.test(text.slice(range.pos, range.end))) return true;
  }
  const lines = sourceFile.text.split('\n');
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
  // Same physical line (e.g. a trailing `// unbounded: ...`) or the line
  // immediately above it (a standalone comment line right before the field).
  return EXEMPT_COMMENT.test(lines[line] ?? '') || EXEMPT_COMMENT.test(lines[line - 1] ?? '');
}

/** Is `node` (the `z` in `z.string()`) actually the zod import, not some
 *  unrelated local named `z`? Best-effort: checks the file imports `zod`. */
function fileImportsZod(sourceFile: ts.SourceFile): boolean {
  return /from ['"]zod['"]/.test(sourceFile.text);
}

/** Exposed separately from `scanFile` so tests can exercise the actual AST
 *  walk against an in-memory snippet instead of writing temp files to disk. */
export function scanSource(filePath: string, text: string): Finding[] {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  if (!fileImportsZod(sourceFile)) return [];

  const findings: Finding[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'string' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'z'
    ) {
      const chained = chainedMethodNames(node);
      const bounded = chained.some((m) => BOUNDING_METHODS.has(m));
      if (!bounded && !isExemptByComment(sourceFile, node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          file: filePath,
          line: line + 1,
          column: character + 1,
          snippet: node.getText().slice(0, 60),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

export function scanFile(filePath: string): Finding[] {
  return scanSource(filePath, fs.readFileSync(filePath, 'utf8'));
}

export function scanFiles(filePaths: string[]): Finding[] {
  return filePaths.flatMap((f) => scanFile(f));
}
