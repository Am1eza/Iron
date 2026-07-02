import { NextResponse, type NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { validateBody } from '@/lib/validation/request';
import { contactSchema } from '@/lib/validation/schemas';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { contactMessages } from '@/lib/server/db/schema';
import { reportError } from '@/lib/errors/report';

/** POST /api/contact — contact-form message → admin inbox. */
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const guard = requireDb();
  if (guard) return guard;

  const v = await validateBody(req, contactSchema);
  if (!v.ok) return v.response;

  try {
    await getDb().insert(contactMessages).values({
      id: ulid(),
      name: v.data.name,
      mobile: v.data.mobile,
      message: v.data.message,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    reportError(err, { route: 'contact' });
    return NextResponse.json(
      { error: 'failed', message: 'ارسال پیام ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}
