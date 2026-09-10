// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_FREIGHT_TABLE } from '@/lib/data/logistics';
import { logisticsSettingSchema } from '@/lib/validation/settingsSchemas';

describe('LOGISTICS settings contract', () => {
  it('accepts the exact current admin-form payload including the freight table', () => {
    const parsed = logisticsSettingSchema.safeParse({
      originLabel: 'انبار شادآباد تهران',
      freightTable: DEFAULT_FREIGHT_TABLE,
      handlingPerTon: 150_000,
      insuranceRate: 0.0025,
      scaleFee: 75_000,
      packagingPerTon: 0,
      taxable: { goods: true, freight: false, handling: false, insurance: false, scale: false, packaging: false },
      sourceNote: 'تأیید تلفنی شریک حمل در ۱۴۰۵/۰۶/۱۳',
      cities: [{ name: 'تهران', km: 20 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.freightTable).toEqual(DEFAULT_FREIGHT_TABLE);
  });

  it('rejects an unverifiable save with no source note', () => {
    const parsed = logisticsSettingSchema.safeParse({
      originLabel: 'انبار', freightTable: DEFAULT_FREIGHT_TABLE,
      handlingPerTon: 0, insuranceRate: 0, scaleFee: 0, packagingPerTon: 0,
      taxable: { goods: true, freight: false, handling: false, insurance: false, scale: false, packaging: false },
      sourceNote: '', cities: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('PUT /api/admin/settings — audit captures the PREVIOUS value too (G-165)', () => {
  const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn(async () => {}) }));
  vi.mock('@/lib/server/utils/apiGuard', () => ({
    requireDb: () => null,
    requireApiPermission: async () => ({ session: { id: 'admin-1', role: 'admin' } }),
    audit: auditMock,
    withApiErrorHandling: (handler: unknown) => handler,
  }));
  const { getSettingMock, setSettingMock } = vi.hoisted(() => ({
    getSettingMock: vi.fn(async () => ({ versions: [{ id: 'v1', label: 'قدیمی', prompt: 'قدیمی' }] })),
    setSettingMock: vi.fn(async () => {}),
  }));
  vi.mock('@/lib/server/repos/settingsRepo', () => ({
    getSetting: getSettingMock,
    setSetting: setSettingMock,
    listSettings: async () => [],
  }));

  it('the AI system prompt (AI_PROMPT_VERSIONS) — writes audit(before: <old prompt>, after: <new prompt>), not just the new value', async () => {
    const { PUT } = await import('./route');
    const newValue = { versions: [{ id: 'v1', label: 'جدید', prompt: 'جدید' }] };
    const req = new NextRequest('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'AI_PROMPT_VERSIONS', value: newValue }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(auditMock).toHaveBeenCalledWith(
      'admin-1',
      'settings.update',
      { type: 'setting', id: 'AI_PROMPT_VERSIONS' },
      { value: { versions: [{ id: 'v1', label: 'قدیمی', prompt: 'قدیمی' }] } },
      { value: newValue },
    );
  });
});
