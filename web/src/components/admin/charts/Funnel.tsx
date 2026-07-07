import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

export interface FunnelStage {
  label: string;
  value: number;
}

/** Conversion funnel with per-stage drop-off %. Bar widths scale to the top
 *  stage; between each pair, the % lost is shown (the actionable part). */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className={styles.funnel}>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.value : null;
        const drop = prev && prev > 0 ? Math.round(((prev - s.value) / prev) * 100) : null;
        return (
          <div key={s.label}>
            <div className={styles.funnelStage}>
              <span className={styles.funnelLabel}>{s.label}</span>
              <div className={styles.funnelBarWrap}>
                <div className={styles.funnelBar} style={{ inlineSize: `${Math.round((s.value / top) * 100)}%` }} />
              </div>
              <span className={`${styles.funnelValue} tnum`}>{toPersianDigits(s.value.toLocaleString('en-US'))}</span>
            </div>
            {drop !== null && drop > 0 ? (
              <div className={styles.funnelDrop}>
                افت <strong className="tnum">{toPersianDigits(drop)}٪</strong> در این مرحله
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
