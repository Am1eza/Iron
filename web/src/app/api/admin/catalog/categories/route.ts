import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { adminListCategories, createCategory } from '@/lib/server/repos/catalogAdminRepo';

export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ categories: await adminListCategories() }, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  slug: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  order: z.number().int().min(0).optional(),
  iconId: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const category = await createCategory(v.data);
  await audit(auth.session.id, 'catalog.category.create', { type: 'category', id: category.id }, null, v.data);
  return NextResponse.json({ category }, { status: 201 });
}
