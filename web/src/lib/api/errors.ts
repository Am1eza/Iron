/** Normalized API error model. */
export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  /** Full parsed JSON body of the error response, when the response was
   *  valid JSON (W22) — most call sites only need `message`/`code`, but some
   *  error bodies carry extra structured data the generic shape doesn't
   *  cover (e.g. the alerts-limit 409's `cap`). Undefined when the body
   *  wasn't JSON or had no extra fields. */
  details?: Record<string, unknown>;
  /** Parsed `Retry-After` (seconds) when the response carried one — 429s from
   *  `rateLimit()` always do, and it is the ONLY place the real wait is
   *  stated (the JSON body says «کمی بعد» without a duration). Undefined when
   *  the header was absent or not a plain delta-seconds value. */
  retryAfterSeconds?: number;

  constructor(
    status: number,
    message: string,
    opts?: {
      code?: string;
      fields?: Record<string, string>;
      details?: Record<string, unknown>;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = opts?.code;
    this.fields = opts?.fields;
    this.details = opts?.details;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Always a safe Persian string for the UI — never a raw/English failure. */
export function toUserMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'خطایی رخ داد. دوباره تلاش کنید.';
}
