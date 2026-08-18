/**
 * Drive the REAL advisor pipeline against the REAL relay, N times, and print
 * the AnswerTrace for each turn.
 *
 * This exists because an empty answer in production is unattributable from the
 * outside: «the model said nothing» and «a post-processor removed everything
 * it wrote» are the same empty bubble. The route's trace column answers that
 * for live traffic; this answers it in a loop, without waiting for a visitor
 * to hit the case, and without the SSE/rate-limit layer in between.
 *
 * Diagnostic tool, not part of the app or the build. Run it against the compose
 * network so the DB and the relay are both reachable:
 *
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/ai-trace-probe.mts 6 "قیمت میلگرد ۱۶ چنده؟"
 */
import { runAdvisorPipeline } from '../src/lib/server/ai/pipeline';
import { buildChatMessages } from '../src/lib/server/ai/conversation';
import { getDomainFacts } from '../src/lib/server/ai/domainFacts';
import { numbersInText } from '../src/lib/server/ai/grounding';

const runs = Number(process.argv[2] ?? 5);
const prompts = process.argv.slice(3);
if (prompts.length === 0) prompts.push('قیمت میلگرد ۱۶ آجدار چنده؟');

const domainFacts = await getDomainFacts().catch(() => '');
console.log(`domainFacts: ${domainFacts.length} chars · ${runs} run(s) × ${prompts.length} prompt(s)\n`);

let empty = 0;
let total = 0;
for (let i = 0; i < runs; i++) {
  for (const prompt of prompts) {
    total++;
    const userNumbers = new Set<number>(numbersInText(prompt));
    const messages = buildChatMessages([{ role: 'user', content: prompt }], null, domainFacts);
    const t0 = Date.now();
    try {
      const r = await runAdvisorPipeline({
        messages,
        userNumbers,
        session: null,
        signal: AbortSignal.timeout(90_000),
      });
      const t = r.trace;
      if (!r.text.trim()) empty++;
      console.log(
        [
          `#${total}`,
          `${Date.now() - t0}ms`,
          `emptyAt=${t.emptyAt ?? '-'}`,
          `rounds=${t.rounds}`,
          `tools=${t.toolCalls}[${[...r.toolsUsed].join(',')}]`,
          `model=${t.modelChars}`,
          `reasoning=${t.reasoningChars}`,
          `trunc=${t.truncated}`,
          `cont=${t.continued}`,
          `grounded=${t.groundedChars}`,
          `corr=${t.correctionRan}/${t.correctionUsed}`,
          `emptyRetry=${t.emptyRetried}/${t.emptyRetryRescued}`,
          `leak=${t.leakFired}`,
          `claims=${t.claimsRemoved}/-${t.claimsChars}c`,
          `repeat=-${t.repeatChars}c`,
          `final=${t.finalChars}`,
          `tok=${r.usage.promptTokens}/${r.usage.completionTokens}/${r.usage.cacheHitTokens}`,
        ].join(' '),
      );
      if (r.text.trim()) console.log(`   « ${r.text.replace(/\n/g, ' ').slice(0, 160)} »`);
    } catch (e) {
      console.log(`#${total} ${Date.now() - t0}ms THREW ${(e as Error).name}: ${(e as Error).message}`);
    }
  }
}
console.log(`\nempty: ${empty}/${total}`);
process.exit(0);
