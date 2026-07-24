'use client';
/** CRM shell — four tabs: leads, user requests, contact messages, and the
 *  proforma register. */
import { useState } from 'react';
import { Tabs, TabPanel } from '@/components/ui';
import { LeadsTab } from './LeadsTab';
import { RequestsTab } from './RequestsTab';
import { MessagesTab } from './MessagesTab';
import { ProformasTab } from './ProformasTab';

export function LeadsBoard() {
  const [tab, setTab] = useState('leads');
  return (
    <div>
      <Tabs
        items={[
          { id: 'leads', label: 'سرنخ‌ها' },
          { id: 'requests', label: 'درخواست‌ها' },
          { id: 'messages', label: 'پیام‌ها' },
          { id: 'proformas', label: 'پیش‌فاکتورها' },
        ]}
        active={tab}
        onChange={setTab}
        label="بخش‌های CRM"
        idBase="crm"
      />
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
