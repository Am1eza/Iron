'use client';
/**
 * System-prompt A/B testing (US-05.5) — structured version rows (same
 * addable/removable-row pattern as US-22.2's settings cards) + the
 * per-version comparison table. Fewer than 2 versions = A/B is off; every
 * conversation keeps using the baseline AI_SYSTEM_PROMPT (see
 * promptVersions.ts) with zero DeepSeek cache impact.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

type VersionRow = { rowId: string; id: string; label: string; prompt: string };
const newRowId = () => (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));

function VersionsEditor() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  const configured = (data?.settings.find((s) => s.key === 'AI_PROMPT_VERSIONS')?.value as { versions?: VersionRow[] } | undefined)
    ?.versions;

  const [rows, setRows] = useState<VersionRow[]>([]);
  useEffect(() => {
    setRows((configured ?? []).map((v) => ({ ...v, rowId: newRowId() })));
  }, [configured]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.saveSetting('AI_PROMPT_VERSIONS', {
        versions: rows.map(({ id, label, prompt }) => ({ id: id.trim(), label: label.trim(), prompt: prompt.trim() })),
      }),
    onSuccess: () => {
      toast.success('نسخه‌های پرامپت ذخیره شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.'),
  });

  const setField = (rowId: string, patch: Partial<VersionRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  const addRow = () => setRows((prev) => [...prev, { rowId: newRowId(), id: '', label: '', prompt: '' }]);

  const hasDuplicateIds = new Set(rows.map((r) => r.id.trim())).size !== rows.length;
  const canSave = rows.every((r) => r.id.trim() && r.label.trim() && r.prompt.trim()) && !hasDuplicateIds;

  if (isLoading) return <TableSkeleton rows={2} cols={2} />;

  return (
    <Card>
      <Heading level={2}>نسخه‌های پرامپت</Heading>
      <Text color="muted">حداقل ۲ نسخه لازم است تا A/B فعال شود؛ با صفر یا یک نسخه، همه از پرامپت پایه استفاده می‌کنند.</Text>
      <div style={{ display: 'grid', gap: 'var(--space-3)', marginBlockStart: 'var(--space-3)' }}>
        {rows.map((r) => (
          <div key={r.rowId} className={ui.panel}>
            <div className={ui.grid2}>
              <TextInput
                label="شناسهٔ نسخه (لاتین، یکتا)"
                dir="ltr"
                value={r.id}
                onChange={(e) => setField(r.rowId, { id: e.target.value })}
                placeholder="a"
              />
              <TextInput label="عنوان" value={r.label} onChange={(e) => setField(r.rowId, { label: e.target.value })} placeholder="نسخهٔ A — رسمی‌تر" />
            </div>
            <Textarea
              label="متن کامل پرامپت سیستمی"
              rows={6}
              style={{ fontFamily: 'monospace', marginBlockStart: 'var(--space-2)' }}
              value={r.prompt}
              onChange={(e) => setField(r.rowId, { prompt: e.target.value })}
            />
            <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-2)' }}>
              <Button size="sm" variant="ghost" onClick={() => removeRow(r.rowId)}>
                حذف این نسخه
              </Button>
            </div>
          </div>
        ))}
      </div>
      {hasDuplicateIds ? <p className={ui.muted}>شناسهٔ نسخه‌ها باید یکتا باشد.</p> : null}
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" variant="secondary" onClick={addRow}>
          افزودن نسخه
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!canSave} loading={save.isPending}>
          ذخیرهٔ نسخه‌ها
        </Button>
      </div>
    </Card>
  );
}

function MetricsTable() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'ai-prompt-metrics'],
    queryFn: () => adminApi.promptVersionMetrics(),
  });
  const metrics = data?.metrics ?? [];

  if (isLoading) return <TableSkeleton rows={2} cols={5} />;
  if (isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="بارگذاری مقایسه ناموفق بود."
        primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
      />
    );
  }
  if (metrics.length === 0) {
    return <EmptyState size="section" headline="هنوز داده‌ای نیست" body="پس از فعال‌سازی A/B و ورود چند گفتگو، مقایسه اینجا نمایش داده می‌شود." />;
  }

  return (
    <table className={ui.table}>
      <caption className="visually-hidden">مقایسهٔ نسخه‌های پرامپت</caption>
      <thead>
        <tr>
          <th scope="col">نسخه</th>
          <th scope="col">تعداد گفتگو</th>
          <th scope="col">نرخ بازخورد مثبت</th>
          <th scope="col">میانگین توکن هر گفتگو</th>
          <th scope="col">نسبت برخورد کش</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((m) => {
          const totalFeedback = m.feedbackUp + m.feedbackDown;
          const upRate = totalFeedback > 0 ? Math.round((m.feedbackUp / totalFeedback) * 100) : null;
          const avgTokens = m.conversationCount > 0 ? Math.round((m.promptTokens + m.completionTokens) / m.conversationCount) : 0;
          const cacheRate = m.promptTokens > 0 ? Math.round((m.cacheHitTokens / m.promptTokens) * 100) : 0;
          return (
            <tr key={m.versionId}>
              <td className={ui.mono}>{m.versionId}</td>
              <td className="tnum">{toPersianDigits(m.conversationCount)}</td>
              <td className="tnum">{upRate === null ? '—' : `${toPersianDigits(upRate)}٪ (${toPersianDigits(totalFeedback)} رأی)`}</td>
              <td className="tnum">{toPersianDigits(avgTokens.toLocaleString('en-US'))}</td>
              <td className="tnum">{toPersianDigits(cacheRate)}٪</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PromptVersionsPanel() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <VersionsEditor />
      <div>
        <Heading level={2}>مقایسهٔ نسخه‌ها</Heading>
        <MetricsTable />
      </div>
    </div>
  );
}
