/**
 * H-178 — every ILIKE/LIKE pattern must come from `likeEscape.ts`.
 *
 * The escaping itself was already correct everywhere; what was missing was
 * anything stopping the NEXT person from adding a search predicate and
 * hand-writing `` `%${q}%` ``. That regression is invisible in review and in
 * tests, because the happy path still returns rows — it only shows up as an
 * admin searching «40_40» and silently getting «40x40» (wrong answer, no
 * error), or as a single `%` turning a bounded substring scan into a full
 * table scan on a ten-slot connection pool.
 *
 * WHY AN AST, NOT A GREP. Almost no call site passes a literal: the real
 * shapes in this repo are `const terms = likeContainsDigitVariants(q)` then
 * `terms.flatMap((t) => ilike(col, t))`, and
 * `[...].map(likeContains)` then `patterns.map((p) => ilike(col, p))`. A grep
 * for `` ilike(.*`% `` finds none of those, and a grep for `ilike(` cannot
 * tell a safe identifier from an unsafe one. So this does a small file-local
 * taint analysis: a value is SAFE if it came from one of the three helpers,
 * and safety propagates through variable bindings and through the callback
 * parameter of `.map`/`.flatMap`/`.filter`/`.forEach` on an already-safe
 * array.
 *
 * DELIBERATE LIMIT: the analysis is file-local. A pattern built in one module
 * and passed across a function boundary into another reads as unsafe and must
 * either be built at the call site or carry an explicit
 * `// like-escaped: <reason>` comment. That is the conservative direction —
 * it can ask for an annotation it did not need, but it cannot miss a raw
 * interpolation.
 */
import ts from 'typescript';
import fs from 'node:fs';

/** The three exports of `likeEscape.ts`. Anything they return is escaped. */
const SAFE_FNS = new Set(['likeContains', 'likeContainsDigitVariants', 'escapeLike']);

/** Drizzle predicates whose pattern argument is a LIKE pattern. */
const PATTERN_PREDICATES = new Set(['ilike', 'like', 'notIlike', 'notLike']);

/** Array methods that hand each element to a callback — safety of the
 *  receiver's elements transfers to the callback's parameter. */
const ELEMENT_METHODS = new Set(['map', 'flatMap', 'filter', 'forEach', 'find']);

const ESCAPE_HATCH = /like-escaped:/;

export interface Finding {
  file: string;
  line: number;
  column: number;
  snippet: string;
}

function unwrap(node: ts.Expression): ts.Expression {
  let n = node;
  for (;;) {
    if (ts.isParenthesizedExpression(n)) n = n.expression;
    else if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
    else if (ts.isNonNullExpression(n)) n = n.expression;
    else return n;
  }
}

/** The called name, for both `f(x)` and `obj.f(x)`. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

function isSafeFunctionRef(node: ts.Expression): boolean {
  const n = unwrap(node);
  return ts.isIdentifier(n) && SAFE_FNS.has(n.text);
}

function isSafeExpr(node: ts.Expression, safeNames: ReadonlySet<string>): boolean {
  const n = unwrap(node);

  if (ts.isIdentifier(n)) return safeNames.has(n.text);

  if (ts.isCallExpression(n)) {
    const name = calleeName(n);
    if (name && SAFE_FNS.has(name)) return true;
    // `xs.map(likeContains)` / `xs.map((v) => likeContains(v))` — the mapper
    // is what makes the RESULT safe, whatever the receiver held.
    if (name === 'map' || name === 'flatMap') {
      const mapper = n.arguments[0];
      if (mapper && isSafeFunctionRef(mapper)) return true;
      if (mapper && (ts.isArrowFunction(mapper) || ts.isFunctionExpression(mapper))) {
        if (ts.isBlock(mapper.body)) {
          // Only the simple `return <safe>` form; anything else stays unsafe.
          const ret = mapper.body.statements.find(ts.isReturnStatement);
          return Boolean(ret?.expression && isSafeExpr(ret.expression, safeNames));
        }
        return isSafeExpr(mapper.body, safeNames);
      }
      return false;
    }
    // `xs.filter(...)`/`.slice()`/`.concat()` preserve whatever xs held.
    if (name && ELEMENT_METHODS.has(name)) {
      const callee = unwrap(n.expression);
      return ts.isPropertyAccessExpression(callee) && isSafeExpr(callee.expression, safeNames);
    }
    return false;
  }

  if (ts.isArrayLiteralExpression(n)) {
    const parts = n.elements.map((e) => (ts.isSpreadElement(e) ? e.expression : e));
    return parts.length > 0 && parts.every((e) => isSafeExpr(e, safeNames));
  }

  if (ts.isConditionalExpression(n)) {
    return isSafeExpr(n.whenTrue, safeNames) && isSafeExpr(n.whenFalse, safeNames);
  }

  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return isSafeExpr(n.left, safeNames) && isSafeExpr(n.right, safeNames);
    }
    return false;
  }

  // A template literal is exactly the thing this scan exists to reject.
  return false;
}

/**
 * Names bound to an escaped value, to a fixed point — a binding can depend on
 * one declared later in the file, and a callback parameter's safety depends
 * on its receiver's.
 */
function collectSafeNames(source: ts.SourceFile): Set<string> {
  const safe = new Set<string>(SAFE_FNS);
  for (let pass = 0; pass < 5; pass++) {
    const before = safe.size;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        if (isSafeExpr(node.initializer, safe)) safe.add(node.name.text);
      }
      // `<safe array>.map((p) => …)` → `p` is safe inside the callback.
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        const callee = unwrap(node.expression);
        if (
          name &&
          ELEMENT_METHODS.has(name) &&
          ts.isPropertyAccessExpression(callee) &&
          isSafeExpr(callee.expression, safe)
        ) {
          const cb = node.arguments[0];
          if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
            const p = cb.parameters[0]?.name;
            if (p && ts.isIdentifier(p)) safe.add(p.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (safe.size === before) break;
  }
  return safe;
}

function hasEscapeHatch(source: ts.SourceFile, pos: number): boolean {
  const { line } = source.getLineAndCharacterOfPosition(pos);
  const lines = source.getFullText().split('\n');
  return [lines[line], lines[line - 1]].some((l) => Boolean(l && ESCAPE_HATCH.test(l)));
}

export function scanFiles(files: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    // Cheap pre-filter; the AST parse is the expensive part.
    if (!/\b(?:not)?[Ii]?like\(/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const safeNames = collectSafeNames(source);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        if (name && PATTERN_PREDICATES.has(name) && node.arguments.length >= 2) {
          const pattern = node.arguments[1]!;
          if (!isSafeExpr(pattern, safeNames) && !hasEscapeHatch(source, node.getStart(source))) {
            const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
            findings.push({
              file,
              line: line + 1,
              column: character + 1,
              snippet: node.getText(source).replace(/\s+/g, ' ').slice(0, 120),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}
