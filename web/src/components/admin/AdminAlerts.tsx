'use client';
/**
 * «زنگِ میز کار» — makes the laptop ring for the sales/ops team. Polls the
 * admin stats every 20s; when the count of NEW leads or NEW contact messages
 * rises, it plays a short tone (WebAudio, no asset needed) and raises a
 * desktop notification so staff notice a fresh inbound even on another tab.
 * Silent until the operator grants notification permission / the first tick
 * establishes a baseline (so it never rings on page load).
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';

function ring() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = [880, 1175]; // a two-tone "ring-ring"
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio blocked — the notification still fires */
  }
}

export function AdminAlerts() {
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const { data } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.stats(),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const s = data?.stats;
    if (!s) return;
    const inbound = (s.newLeads ?? 0) + (s.newMessages ?? 0);
    if (baseline.current === null) {
      baseline.current = inbound; // first tick sets the baseline, no ring
      return;
    }
    if (inbound > baseline.current) {
      const delta = inbound - baseline.current;
      ring();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('آهن‌تایم — درخواست جدید', {
          body: `${delta} مورد جدید (سرنخ/پیام) در پنل ثبت شد.`,
          tag: 'ahantime-inbound',
        });
      }
    }
    baseline.current = inbound;
  }, [data]);

  return null;
}
