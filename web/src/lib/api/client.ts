/**
 * @deprecated Compatibility shim. Use `api` / `http` / `ApiError` from `@/lib/api`.
 * The real client lives in `http.ts` (core) + `resources/*` (typed actions).
 */
export { ApiError } from './errors';
export { API_MODE } from './config';
export { httpRequest as apiFetch } from './http';
