'use client';
import { useReportWebVitals } from 'next/web-vitals';
import { reportMetric } from '@/lib/perf/webVitals';

/** Subscribes to Core Web Vitals and routes them to the reporter. Mount once. */
export function WebVitals() {
  useReportWebVitals((metric) => {
    reportMetric({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      // `rating` exists on web-vital metrics but not Next custom metrics.
      rating: (metric as { rating?: 'good' | 'needs-improvement' | 'poor' }).rating,
    });
  });
  return null;
}
