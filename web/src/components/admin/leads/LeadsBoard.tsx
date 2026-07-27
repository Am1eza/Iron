'use client';
/** CRM shell — four tabs: leads, user requests, contact messages, and the
 *  proforma register. */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabPanel } from '@/components/ui';
import { LeadsTab } from './LeadsTab';
import { RequestsTab } from './RequestsTab';
import { MessagesTab } from './MessagesTab';
import { ProformasTab } from './ProformasTab';

const TABS = [
  { id: 'leads', label: 'سرنخ‌ها' },
  { id: 'requests', label: 'درخواست‌ها' },
  { id: 'messages', label: 'پیام‌ها' },
  { id: 'proformas', label: 'پیش‌فاکتورها' },
] as const;

const DEFAULT_TAB = 'leads';

export function LeadsBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The tab lives in ?tab= rather than useState: with it in component state a
  // rep could not send «پیش‌فاکتورها» to a colleague, and Back out of a lead
  // page always landed them on «سرنخ‌ها» — three clicks from where they were.
  // An unknown/absent value falls back instead of rendering four empty panels.
  const raw = params.get('tab');
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : DEFAULT_TAB;

  const setTab = (next: string) => {
    const qs = new URLSearchParams(params.toString());
    // The default tab is spelled by the ABSENCE of the param, so /admin/leads
    // (the sidebar link, every existing bookmark) and the leads tab stay one
    // URL — otherwise Back after a single tab round-trip needs two presses.
    if (next === DEFAULT_TAB) qs.delete('tab');
    else qs.set('tab', next);
    // push, not replace: switching tab is a destination the rep expects Back
    // to undo. Filter edits inside LeadsTab replace instead, so typing a
    // search doesn't bury the previous tab under 20 history entries.
    // scroll:false — a tab switch is not a new page; jumping to the top loses
    // the row the rep was reading.
    const s = qs.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div>
      <Tabs items={TABS.map((t) => ({ id: t.id, label: t.label }))} active={tab} onChange={setTab} label="بخش‌های CRM" idBase="crm" />
      <TabPanel id="leads" active={tab} idBase="crm">
        <LeadsTab />
      </TabPanel>
      <TabPanel id="requests" active={tab} idBase="crm">
        <RequestsTab />
      </TabPanel>
      <TabPanel id="messages" active={tab} idBase="crm">
        <MessagesTab />
      </TabPanel>
      <TabPanel id="proformas" active={tab} idBase="crm">
        <ProformasTab />
      </TabPanel>
    </div>
  );
}
