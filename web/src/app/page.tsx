/**
 * Home — placeholder for the dual-mode landing (ticker + AI hero + category rail).
 * The full build lands in the Home/Layout sections; this verifies the foundation
 * (RTL shell + design tokens) renders.
 */
export default function HomePage() {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      <p style={{ font: 'var(--t-overline)', color: 'var(--color-text-muted)' }}>
        پولادین · بازار هوشمند آهن و فولاد
      </p>
      <h1 style={{ marginBlockStart: 'var(--space-2)' }}>اول مشورت، بعد خرید.</h1>
      <p style={{ font: 'var(--t-body-lg)', color: 'var(--color-text-muted)', marginBlockStart: 'var(--space-4)' }}>
        پایهٔ پروژه آماده است. در بخش‌های بعدی، نوار «نبض بازار»، جستجوی هوشمند «پولادین» و
        ریل دسته‌بندی ساخته می‌شوند.
      </p>
    </div>
  );
}
