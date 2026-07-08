/** The production job set — imported once by scripts/jobs.ts. */
import type { Job } from './scheduler';
import { cleanupJob } from './cleanup.job';
import { marketPollJob } from './marketPoll.job';
import { stalenessJob } from './staleness.job';
import { proformaExpireJob } from './proformaExpire.job';
import { alertsJob } from './alerts.job';
import { publishArticlesJob } from './publishArticles.job';
import { smsAutomationJob } from './smsAutomation.job';

export const jobs: Job[] = [marketPollJob, stalenessJob, alertsJob, publishArticlesJob, proformaExpireJob, smsAutomationJob, cleanupJob];
