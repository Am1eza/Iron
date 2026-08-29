'use client';
import type { AdvisorBlock } from '@/lib/ai/blocks';
import { OptionsCard } from './OptionsCard';
import { QuoteCard } from './QuoteCard';
import { CompareCard } from './CompareCard';
import { TrendCard } from './TrendCard';
import { ExpertCard } from './ExpertCard';
import styles from './blocks.module.css';

/**
 * Block kind → component. The ONE place the mapping lives.
 *
 * The `default` arm returning null is load-bearing, not defensive padding: a
 * deployed browser tab can outlive several deploys, and a client that predates
 * a new block kind must ignore it rather than throw inside a message list it
 * has already committed to rendering. The prose of the answer is always
 * present too, so a dropped card degrades to the answer this advisor used to
 * give — never to a blank screen.
 */
function renderBlock(block: AdvisorBlock, onPick: (text: string) => void) {
  switch (block.kind) {
    case 'options':
      return <OptionsCard block={block} onPick={onPick} />;
    case 'quote':
      return <QuoteCard block={block} onPick={onPick} />;
    case 'compare':
      return <CompareCard block={block} onPick={onPick} />;
    case 'trend':
      return <TrendCard block={block} />;
    case 'expert':
      return <ExpertCard block={block} />;
    default:
      return null;
  }
}

/**
 * The cards under one advisor message, in the order the tools produced them.
 *
 * Keyed by index deliberately: blocks are append-only within a finished
 * message and never reordered or filtered, so the index IS stable, while a
 * content-derived key would collide the moment a turn legitimately draws two
 * cards of the same kind (a comparison for two different sizes, say).
 */
export function AdvisorBlocks({
  blocks,
  onPick,
}: {
  blocks: AdvisorBlock[];
  onPick: (text: string) => void;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className={styles.stack}>
      {blocks.map((block, i) => {
        const node = renderBlock(block, onPick);
        return node ? <div key={`${block.kind}-${i}`}>{node}</div> : null;
      })}
    </div>
  );
}
