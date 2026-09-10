/**
 * G-154 — does the hidden-admin 404 leak, via timing, that /admin exists at
 * all (versus a genuinely unregistered path)? Read-only GETs against the
 * LIVE public host, no auth, no state change: node scripts/adminTimingLeakProbe.mjs
 *
 * Interleaves the three targets round-robin (not block-by-block) so network
 * jitter over the run's duration affects every group equally, rather than
 * biasing whichever group happened to run during a locally slow/fast window.
 */
const SAMPLES = Number(process.argv[2]) || 300;
const TARGETS = {
  hiddenAdmin: 'https://ahantime.com/admin',
  hiddenAdminApi: 'https://ahantime.com/api/admin/users',
  realNotFound: 'https://ahantime.com/this-genuinely-does-not-exist-xyz123',
};

async function timeOne(url) {
  const start = performance.now();
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  await res.arrayBuffer();
  return { ms: performance.now() - start, status: res.status };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    mean: mean.toFixed(2),
    median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
    p90: sorted[Math.floor(sorted.length * 0.9)].toFixed(2),
  };
}

const results = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, { times: [], statuses: new Set() }]));
for (let i = 0; i < SAMPLES; i++) {
  for (const [name, url] of Object.entries(TARGETS)) {
    const { ms, status } = await timeOne(url);
    results[name].times.push(ms);
    results[name].statuses.add(status);
  }
  if (i % 50 === 0) process.stderr.write(`${i}/${SAMPLES}\n`);
}

console.log(`\nSamples per group: ${SAMPLES}\n`);
for (const [name, { times, statuses }] of Object.entries(results)) {
  console.log(`${name}: status=${[...statuses].join(',')} ${JSON.stringify(stats(times))}`);
}
const admin = stats(results.hiddenAdmin.times);
const notFound = stats(results.realNotFound.times);
console.log(`\n|median(hiddenAdmin) - median(realNotFound)| = ${Math.abs(parseFloat(admin.median) - parseFloat(notFound.median)).toFixed(2)}ms`);
