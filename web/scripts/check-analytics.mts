// Ops diagnostic: run the admin analytics SQL against the live DB.
// Usage: docker run --rm --network ahantime_default -v $PWD/web:/app -w /app -e DATABASE_URL=... node:20-alpine node_modules/.bin/tsx scripts/check-analytics.mts
import { overviewStats, marketingStats, seoStats } from '../src/lib/server/repos/analyticsRepo';
const [o, m, s] = await Promise.all([overviewStats(), marketingStats(), seoStats()]);
console.log('OVERVIEW leads:', JSON.stringify({ cur: o.leads.current, delta: o.leads.deltaPct, today: o.leads.today, seriesLen: o.leads.series.length }));
console.log('OVERVIEW proformaValue:', o.proformas.valueCurrent, 'delta:', o.proformas.valueDeltaPct);
console.log('MARKETING funnel:', JSON.stringify(m.funnel), '| sources:', m.bySource.length, '| resp:', JSON.stringify(m.responseMinutes), '| repeat:', JSON.stringify(m.repeatRate), '| sms rows:', m.sms.length);
console.log('SEO score:', s.score, '| published:', s.published, '| failing:', s.failing.length, '| rates t/e/w:', s.titlePassRate, s.excerptPassRate, s.thinPassRate);
process.exit(0);
