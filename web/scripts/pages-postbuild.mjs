// Post-process `next export` output for a static host (GitHub Pages).
// 1. Decode any percent-encoded directory/file names so the host's decoded
//    request path matches the file on disk (no-op for ASCII routes).
// 2. Add .nojekyll so the `_next` directory (leading underscore) is served.
import { readdirSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../out', import.meta.url).pathname;

function decodeTree(dir) {
  for (const name of readdirSync(dir)) {
    // Leave `_next` untouched: its chunk paths are referenced encoded.
    if (name === '_next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) decodeTree(full);
    if (name.includes('%')) {
      let decoded = name;
      try { decoded = decodeURIComponent(name); } catch { /* leave as-is */ }
      if (decoded !== name) renameSync(full, join(dir, decoded));
    }
  }
}

decodeTree(OUT);
writeFileSync(join(OUT, '.nojekyll'), '');
console.log('pages-postbuild: done (.nojekyll written)');
