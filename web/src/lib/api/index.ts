import { marketApi } from './resources/market';
import { catalogApi } from './resources/catalog';
import { authApi } from './resources/auth';
import { leadsApi } from './resources/leads';
import { toolsApi } from './resources/tools';
import { aiApi } from './resources/ai';
import { alertsApi, contactApi, cooperationApi } from './resources/misc';

/** The API client — components/hooks call api.<resource>.<action>(). */
export const api = {
  market: marketApi,
  catalog: catalogApi,
  auth: authApi,
  leads: leadsApi,
  tools: toolsApi,
  ai: aiApi,
  cooperation: cooperationApi,
  contact: contactApi,
  alerts: alertsApi,
} as const;

export type Api = typeof api;
export { ApiError, isApiError, toUserMessage } from './errors';
export { http, setRequestHook } from './http';
export { API_MODE } from './config';
