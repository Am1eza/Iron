'use client';
import { useState } from 'react';
import { Tabs, TabPanel } from '@/components/ui';
import { AiReview } from './AiReview';
import { AiUsageConsole } from './AiUsageConsole';
import { PromptVersionsPanel } from './PromptVersionsPanel';

/** /admin/ai shell — review queue + usage console (US-24.3) + prompt
 *  A/B testing (US-05.5), one tab each. */
export function AiAdminTabs() {
  const [tab, setTab] = useState('review');
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <Tabs
        label="بخش‌های دستیار هوشمند"
        idBase="ai-admin"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'review', label: 'بازخوردها' },
          { id: 'usage', label: 'مصرف' },
          { id: 'prompts', label: 'پرامپت A/B' },
        ]}
      />
      <TabPanel id="review" active={tab} idBase="ai-admin">
        <AiReview />
      </TabPanel>
      <TabPanel id="usage" active={tab} idBase="ai-admin">
        <AiUsageConsole />
      </TabPanel>
      <TabPanel id="prompts" active={tab} idBase="ai-admin">
        <PromptVersionsPanel />
      </TabPanel>
    </div>
  );
}
