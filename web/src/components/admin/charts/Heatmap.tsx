import { toPersianDigits } from '@/lib/utils/format';
import styles from './charts.module.css';

export interface CohortRow {
  label: string; // e.g. "فروردین ۱۴۰۴"
  size: number; // cohort size (users acquired)
  cells: (number | null)[]; // retention % per period (null = period hasn't elapsed)
}

/** Cohort-retention heatmap: rows = acquisition cohort, columns = periods
 *  since, cell = retention %. Cell tint scales with the value using the brand
 *  chart color at variable alpha (token-driven, no hardcoded hex). */
export function Heatmap({ rows, columns }: { rows: CohortRow[]; columns: string[] }) {
  return (
    <div className={styles.heatmapWrap}>
      <table className={styles.heatmap}>
        <thead>
          <tr>
            <th scope="col">گروه ورود</th>
            <th scope="col">تعداد</th>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className={`${styles.heatCell} tnum`}>{toPersianDigits(r.size)}</td>
              {r.cells.map((v, i) => (
                <td
                  key={i}
                  className={`${styles.heatCell} ${v === null ? styles.heatEmpty : ''}`}
                  style={
                    v === null
                      ? undefined
                      : {
                          background: `color-mix(in srgb, var(--chart-1) ${Math.max(6, Math.round(v))}%, transparent)`,
                        }
                  }
                >
                  {v === null ? '' : `${toPersianDigits(Math.round(v))}٪`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
