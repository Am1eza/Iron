/** The production job set — imported once by instrumentation.ts. */
import type { Job } from './scheduler';
import { cleanupJob } from './cleanup.job';

export const jobs: Job[] = [cleanupJob];
