'use client';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

export type ToolSlug = 'weight' | 'project' | 'cost';

/**
 * Renders only the requested calculator, code-split per tool. `/tools/[tool]`
 * is one route (one `page.tsx`), so a plain static import of all three
 * calculators here would put all three in the same client chunk regardless of
 * which tool a visitor actually requested — `/tools/weight` would ship
 * ProjectEstimator + CostCalculator's code too. Keying `dynamic()` by slug
 * splits each into its own chunk instead.
 */
const TOOL_COMPONENTS: Record<ToolSlug, ComponentType> = {
  weight: dynamic(() => import('./WeightCalculator').then((m) => m.WeightCalculator)),
  project: dynamic(() => import('./ProjectEstimator').then((m) => m.ProjectEstimator)),
  cost: dynamic(() => import('./CostCalculator').then((m) => m.CostCalculator)),
};

export function ToolRenderer({ tool }: { tool: ToolSlug }) {
  const Tool = TOOL_COMPONENTS[tool];
  return <Tool />;
}
