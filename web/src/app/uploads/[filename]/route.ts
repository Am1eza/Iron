import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';
import { uploadDir, UPLOAD_FILENAME_RE, MIME_FOR_EXT } from '@/lib/server/utils/uploadStorage';

export const runtime = 'nodejs';

/**
 * GET /uploads/:filename — serves admin-uploaded images (article covers,
 * in-body pictures, SKU/category photos).
 *
 * NOT handled by Next's own `public/` static-file serving, on purpose: this
 * app writes new files into `public/uploads` at RUNTIME
 * (`api/admin/upload/route.ts`), but the standalone production server
 * resolves `public/` assets against a list it builds once at process
 * startup — a file written after that point is invisible to it for the rest
 * of that process's life, even though it genuinely exists on disk. That
 * silently 404'd every image immediately after its own upload (confirmed
 * live: a file uploaded before this process started served fine; one
 * uploaded by this same running process did not, and never recovered on
 * its own). A real route handler reads the filesystem fresh on every
 * request, so it has no such staleness window.
 *
 * The filename is exactly what `upload/route.ts` generates
 * (`${ulid()}.${ext}`) — never anything a client supplied — so a strict
 * allowlist regex is both sufficient validation and the path-traversal
 * guard (rejects `..`, slashes, or any other extension outright).
 *
 * DELIBERATELY UNAUTHENTICATED, including for the پولادی customer's
 * letterhead logo (I-210): that logo is embedded (`<img src>`) directly on
 * `/proforma/[ref]`, which is ITSELF a public-capability page by design —
 * "reachable from the SMS link; the ref is the capability" (see that page's
 * own docstring). Whoever holds a proforma link already sees the logo baked
 * into that page's HTML with no session of their own required (a buyer
 * forwarding a quote to their own finance/procurement team is the exact,
 * intended use case — see ProformaSheet.tsx). Gating this route behind auth
 * would only break that legitimate sharing flow; it would add no real
 * confidentiality, because the same image is already reachable, unguarded,
 * through the page that is SUPPOSED to show it to a third party. The actual
 * privacy boundary for that logo is the proforma ref's unguessability, not
 * this route — same trust model as the ref link itself. See
 * docs/audit-upload-media-I.md#I-210 for the full reasoning; do not add an
 * auth check here for the logo case without re-reading it first.
 */
async function GETImpl(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const match = UPLOAD_FILENAME_RE.exec(filename);
  if (!match) {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
  const ext = match[1]!;
  try {
    const buf = await fs.readFile(path.join(uploadDir(), filename));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': MIME_FOR_EXT[ext]!,
        // Caddy's own `@uploads` rule sets the identical value in
        // production and, being applied at the edge, is what a browser
        // actually sees — this is the correct value regardless, for local
        // dev and any request that reaches this route without Caddy in
        // front. Safe because the filename is content-addressed (a ulid,
        // never reused): there is nothing to invalidate.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
}

export const GET = GETImpl;
