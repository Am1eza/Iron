/** Map an AuthError (or unknown) to a safe Persian JSON response for route handlers. */
import { NextResponse } from 'next/server';
import { AuthError } from './service';
import { reportError } from '@/lib/errors/report';

export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    const res = NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status },
    );
    if (err.retryAfter) res.headers.set('Retry-After', String(err.retryAfter));
    return res;
  }
  reportError(err, { scope: 'auth' });
  return NextResponse.json(
    { error: 'server_error', message: 'مشکلی پیش آمد. دوباره تلاش کنید.' },
    { status: 500 },
  );
}
