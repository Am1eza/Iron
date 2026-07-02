/** Evaluate price alerts every 60s (after the market poll's cadence). */
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import type { Job } from './scheduler';

export const alertsJob: Job = {
  name: 'alerts-evaluate',
  everyMs: 60 * 1000,
  initialDelayMs: 15_000,
  run: async () => {
    await evaluateAlerts();
  },
};
