import { toPersianDigits } from './format';

const fa = (v: string | number) => toPersianDigits(v);

/**
 * Quick callback-time presets, shared by every "when should we call back?"
 * control (میز کار من's snooze sheet, the CRM's call-outcome capture) so
 * choosing "فردا ۹:۰۰" means the same instant everywhere it appears.
 *
 * Built from a live clock so «فردا ۹:۰۰» means tomorrow at 9, whenever the
 * rep happens to click it — not a value baked in at module load.
 */
export function callbackPresets(now: Date): Array<{ label: string; at: Date }> {
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
    return d;
  };
  const list: Array<{ label: string; at: Date }> = [
    { label: 'یک ساعت دیگر', at: new Date(now.getTime() + 3_600_000) },
  ];
  // Only offer «امروز ۱۶:۰۰» while it is still ahead — a preset that
  // schedules a callback into the past would land straight in عقب‌افتاده.
  if (now.getHours() < 16) list.push({ label: `امروز ${fa('16:00')}`, at: at(0, 16) });
  list.push({ label: `فردا ${fa('9:00')}`, at: at(1, 9) });
  list.push({ label: `هفتهٔ آینده، ${fa('9:00')}`, at: at(7, 9) });
  return list;
}

/** The one-click snooze offered wherever a single default is enough. */
export function tomorrowAt9(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 9, 0, 0, 0);
}
