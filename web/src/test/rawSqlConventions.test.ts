// @vitest-environment node
/**
 * H-177 — `sql.raw()` is the one Drizzle escape hatch that interpolates a
 * string into a query with NO parameter binding. It exists here for the one
 * thing a bind parameter cannot express — an identifier (a table or column
 * name) — and that is exactly the shape an injection needs if the string ever
 * comes from a request.
 *
 * The audit verified this by hand and said so: «صفر فراخوانی `sql.raw()` با
 * یک متغیر غیر-ثابت … برآورده با بررسی دستی این نوبت؛ CI-enforced نیست», and
 * proposed a semgrep/CodeQL rule as the missing half. semgrep is not
 * available in this environment (the MCP server fails to start: `uvx` is not
 * on PATH), and hanging a security invariant on an optional external tool is
 * weaker than owning it — so the rule lives here instead, where it runs on
 * every PR with the rest of the suite and cannot be skipped by a machine that
 * happens to lack a binary.
 *
 * The rule: every `sql.raw()` argument must be a compile-time constant — a
 * string literal, or a value read out of an `as const` lookup table whose
 * keys are a closed union. Anything else fails, including a plain `string`
 * variable that happens to be safe today.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

/**
 * Names of `as const` object literals in the file whose values are therefore
 * fixed at compile time. Reading a property off one of these is as safe as
 * writing the literal inline, and is the pattern `KPI_SOURCES` uses to make
 * the analytics table/column names a closed set.
 */
function constLookupNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init: ts.Expression = node.initializer;
      // Unwrap `{...} as const satisfies Record<...>`
      while (ts.isSatisfiesExpression(init) || ts.isAsExpression(init)) init = init.expression;
      const isAsConst =
        (ts.isAsExpression(node.initializer) || ts.isSatisfiesExpression(node.initializer)) &&
        node.initializer.getText(source).includes('as const');
      if (ts.isObjectLiteralExpression(init) && isAsConst) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** The identifier a (possibly destructured / chained) expression reads from. */
function rootIdentifier(node: ts.Expression): string | undefined {
  let n: ts.Expression = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) n = n.expression;
    else if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n))
      n = n.expression;
    else break;
  }
  return ts.isIdentifier(n) ? n.text : undefined;
}

interface RawCall {
  file: string;
  line: number;
  snippet: string;
  constant: boolean;
}

function scanFile(file: string): RawCall[] {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('sql.raw(')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lookups = constLookupNames(source);

  // Local bindings destructured out of an `as const` lookup — this is the
  // `const { table, dateCol } = KPI_SOURCES[source]` line in analyticsRepo.
  const constBindings = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isObjectBindingPattern(node.name)
    ) {
      const root = rootIdentifier(node.initializer);
      if (root && lookups.has(root)) {
        for (const el of node.name.elements)
          if (ts.isIdentifier(el.name)) constBindings.add(el.name.text);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const calls: RawCall[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'raw' &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0]!;
      const root = rootIdentifier(arg);
      const constant =
        ts.isStringLiteral(arg) ||
        ts.isNoSubstitutionTemplateLiteral(arg) ||
        (root !== undefined && (lookups.has(root) || constBindings.has(root)));
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      calls.push({
        file: path.relative(ROOT, file),
        line: line + 1,
        snippet: node.getText(source).replace(/\s+/g, ' ').slice(0, 100),
        constant,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

const CALLS = [
  ...walk(path.join(ROOT, 'src', 'lib')),
  ...walk(path.join(ROOT, 'src', 'app')),
].flatMap(scanFile);

describe('H-177 — sql.raw() never interpolates a non-constant', () => {
  it('found the sql.raw call sites at all (a vacuous pass would be worse than no test)', () => {
    expect(CALLS.length).toBeGreaterThan(0);
  });

  it('every sql.raw() argument is a literal or a value from an `as const` lookup', () => {
    const dynamic = CALLS.filter((c) => !c.constant);
    if (dynamic.length > 0) {
      const list = dynamic.map((c) => `  ${c.file}:${c.line}  ${c.snippet}`).join('\n');
      expect.fail(
        `sql.raw() bypasses parameter binding entirely, so a non-constant argument is a SQL injection ` +
          `waiting for the value to come from a request. Put the allowed values in an \`as const\` lookup ` +
          `keyed by a closed union (see KPI_SOURCES in analyticsRepo.ts), or use a bind parameter:\n${list}`,
      );
    }
  });

  it('the scanner can tell a dynamic argument apart from a constant one', () => {
    // Proves the check above is doing work rather than classifying everything
    // as constant.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rawsql-'));
    const file = path.join(dir, 'subject.ts');
    try {
      fs.writeFileSync(
        file,
        `import { sql } from 'drizzle-orm';
         const TABLES = { a: { table: 'leads' } } as const;
         export const ok1 = () => sql\`select * from \${sql.raw('leads')}\`;
         export const ok2 = (k: 'a') => { const { table } = TABLES[k]; return sql\`select * from \${sql.raw(table)}\`; };
         export const bad = (t: string) => sql\`select * from \${sql.raw(t)}\`;`,
        'utf8',
      );
      const found = scanFile(file);
      expect(found).toHaveLength(3);
      expect(found.filter((c) => !c.constant)).toHaveLength(1);
      expect(found.find((c) => !c.constant)!.snippet).toContain('sql.raw(t)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
