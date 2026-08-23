/** The production job set — imported once by scripts/jobs.ts. */
import type { Job } from './scheduler';
import { cleanupJob } from './cleanup.job';
import { marketPollJob } from './marketPoll.job';
import { billetPollJob } from './billetPoll.job';
import { stalenessJob } from './staleness.job';
import { proformaExpireJob } from './proformaExpire.job';
import { alertsJob } from './alerts.job';
import { publishArticlesJob } from './publishArticles.job';
import { smsAutomationJob } from './smsAutomation.job';
import { weeklyReportJob } from './weeklyReport.job';
import { searchConsoleRefreshJob } from './searchConsoleRefresh.job';

export const jobs: Job[] = [marketPollJob, billetPollJob, stalenessJob, alertsJob, publishArticlesJob, proformaExpireJob, smsAutomationJob,
  weeklyReportJob, searchConsoleRefreshJob, cleanupJob];
