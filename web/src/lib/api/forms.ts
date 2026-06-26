/**
 * Form submitters — thin façade over the API client so the form components stay unchanged.
 * (All transport/mock/validation now lives in `api.*` resources.)
 */
import { api } from './index';

export const formsApi = {
  requestOtp: (mobile: string) => api.auth.requestOtp(mobile),
  verifyOtp: (mobile: string, code: string) => api.auth.verifyOtp(mobile, code),
  submitRequest: (payload: unknown) => api.leads.create(payload),
  createAlert: (payload: unknown) => api.alerts.create(payload),
  submitCooperation: (payload: unknown) => api.cooperation.submit(payload),
  submitContact: (payload: unknown) => api.contact.submit(payload),
} as const;
