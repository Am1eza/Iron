/** The production job set — imported once by instrumentation.ts. */
import type { Job } from './scheduler';
import { cleanupJob } from './cleanup.job';
import { marketPollJob } from './marketPoll.job';
import { stalenessJob } from './staleness.job';
import { proformaExpireJob } from './proformaExpire.job';

export const jobs: Job[] = [marketPollJob, stalenessJob, proformaExpireJob, cleanupJob];
