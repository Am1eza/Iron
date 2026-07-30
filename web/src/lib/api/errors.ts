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

  constructor(
    status: number,
    message: string,
    opts?: { code?: string; fields?: Record<string, string>; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = opts?.code;
    this.fields = opts?.fields;
    this.details = opts?.details;
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
