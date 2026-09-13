// @vitest-environment node
/**
 * J-224 — the rule the J-223 fix established, enforced at the source level so
 * it survives the next person to add a tool.
 *
 * The rule: **a model tool may read the world, but it may not change it.**
 * Anything with a real-world consequence — a lead, a پیش‌فاکتور, an armed
 * price alert that will text someone — goes through a draft the visitor
 * confirms, and the write lives in the confirm route.
 *
 * A unit test on a single tool cannot enforce that, because the failure mode
 * is someone adding an ELEVENTH tool six months from now and wiring it
 * straight into a repo. So this reads aiTools.ts's own import list and fails
 * on any binding whose name says it writes. It is a lint rule with a test's
 * error message.
 *
 * If this test fails on a legitimate change, the fix is almost never to widen
 * the allowlist — it is to add a draft + confirm route, the way
 * `prepareProforma` → /api/ai/lead/confirm and `setPriceAlert` →
 * /api/ai/alert/confirm both do.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS_FILE = join(HERE, 'services', 'aiTools.ts');

/** A binding name that, by this codebase's own repo naming, mutates state. */
const WRITE_VERB = /^(create|update|delete|insert|upsert|remove|save|mark|purge|consume|set)[A-Z]/;

/**
 * The two exceptions, and why each is not a write in the sense that matters:
 * both put a short-lived DRAFT in Redis (or the in-process fallback Map) with
 * a 30-minute TTL. Nothing durable changes, nobody is contacted, and the
 * visitor has to press a button before any of it becomes real.
 */
const ALLOWED = new Set(['putDraft', 'putAlertDraft']);

/** Every `import { a, b as c } from '...'` binding in the file, by module. */
function importedBindings(source: string): Array<{ module: string; names: string[] }> {
  const out: Array<{ module: string; names: string[] }> = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const names = m[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      // `a as b` — the LOCAL name is what gets called, but the imported name
      // is what reveals intent, so check both.
      .flatMap((s) => s.split(/\s+as\s+/).map((p) => p.trim()))
      .filter((s) => s && s !== 'type');
    out.push({ module: m[2]!, names });
  }
  return out;
}

describe('aiTools.ts imports nothing that writes (J-224)', () => {
  const source = readFileSync(TOOLS_FILE, 'utf8');

  it('finds the file it is guarding', () => {
    // A rename that silently turned this into a vacuous pass is the one way
    // an architecture test quietly stops being one.
    expect(source).toContain('export const AI_TOOLS');
    expect(source).toContain('export async function runTool');
  });

  it('imports no write-shaped binding beyond the two draft helpers', () => {
    const offenders = importedBindings(source)
      .flatMap(({ module, names }) => names.map((name) => ({ module, name })))
      .filter(({ name }) => WRITE_VERB.test(name) && !ALLOWED.has(name));

    expect(
      offenders,
      `A model tool must not write. Found: ${offenders
        .map((o) => `${o.name} (from ${o.module})`)
        .join(', ')}. Add a draft + confirm route instead — see prepareProforma and setPriceAlert.`,
    ).toEqual([]);
  });

  it('never reaches the two real writers by name', () => {
    // Belt and braces for the `import * as repo` / dynamic-import shapes the
    // regex above cannot see: these identifiers must not be CALLED anywhere
    // in the file. Mentioning them in a comment is fine and deliberate — the
    // J-223 note does exactly that — so only a call site counts.
    for (const fn of ['createLead', 'createAlert', 'consumeDraft', 'consumeAlertDraft']) {
      expect(source, `${fn}( must not be called from a model tool`).not.toMatch(
        new RegExp(`(?<!\\w)${fn}\\s*\\(`),
      );
    }
  });

  it('both draft helpers are still paired with a confirm route that owns the write', () => {
    // The draft half is worthless without the confirm half; if someone
    // deletes a confirm route, the tool silently becomes a dead end.
    const routes = [
      join(HERE, '..', '..', 'app', 'api', 'ai', 'lead', 'confirm', 'route.ts'),
      join(HERE, '..', '..', 'app', 'api', 'ai', 'alert', 'confirm', 'route.ts'),
    ];
    for (const route of routes) {
      const routeSource = readFileSync(route, 'utf8');
      expect(routeSource, `${route} must require a session`).toContain('getSessionVerified');
      expect(routeSource, `${route} must consume its draft exactly once`).toMatch(
        /consume\w*Draft\(/,
      );
    }
  });
});
