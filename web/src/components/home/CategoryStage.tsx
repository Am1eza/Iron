'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
} from 'framer-motion';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryStage.module.css';

/**
 * The home stage — «اول مشورت، بعد خرید». A dark canvas with two simple doors:
 * the AI prompt (left, default) and the category rail (right). Hovering a rail
 * item swaps its label for its image AND morphs the left panel into that
 * category's preview (image + sub-categories). Click → its price table.
 * Designed for non-technical buyers: point at a picture, click, done.
 */
export function CategoryStage({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Category | null>(null);
  const [q, setQ] = useState('');
  const stageRef = useRef<HTMLElement | null>(null);

  // Cursor heat-glow
  const mx = useMotionValue(50);
  const my = useMotionValue(40);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });
  const glow = useMotionTemplate`radial-gradient(620px circle at ${sx}% ${sy}%, rgba(245,150,30,0.14), rgba(46,107,255,0.05) 40%, transparent 64%)`;
  const onMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  const ask = (text: string) => {
    const t = text.trim();
    router.push(t ? `${routes.ai()}?q=${encodeURIComponent(t)}` : routes.ai());
  };

  return (
    <section
      ref={stageRef}
      className={styles.stage}
      onMouseMove={onMove}
      aria-label="مشاور هوشمند و دسته‌بندی محصولات"
    >
      <motion.div className={styles.glow} style={{ background: glow }} aria-hidden />
      <div className={styles.gridBg} aria-hidden />

      <div className={`container ${styles.grid}`}>
        {/* RIGHT (RTL start) — the signature category rail */}
        <nav className={styles.rail} aria-label="دسته‌بندی محصولات" onMouseLeave={() => setActive(null)}>
          <p className={styles.railHint}>دسته‌بندی محصولات</p>
          <ul className={styles.railList}>
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={routes.category(cat.slug)}
                  className={styles.railItem}
                  data-active={active?.slug === cat.slug ? '' : undefined}
                  onMouseEnter={() => setActive(cat)}
                  onFocus={() => setActive(cat)}
                  data-event="rail_category_click"
                >
                  <span className={styles.railSwap}>
                    <span className={styles.railName}>{cat.name}</span>
                    <span className={styles.railArt} aria-hidden>
                      <CategoryArt slug={cat.slug} size={34} />
                    </span>
                  </span>
                  <ChevronStartIcon size={16} className={`${styles.railChev} icon--rtl`} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* LEFT — dynamic panel: AI hero by default, category preview on hover */}
        <div className={styles.panel} onMouseLeave={() => setActive(null)}>
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={active.slug}
                className={styles.preview}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={styles.previewArt}>
                  <CategoryArt slug={active.slug} size={96} />
                </span>
                <h2 className={styles.previewTitle}>قیمت روز {active.name}</h2>
                <ul className={styles.subs}>
                  {(CATEGORY_SUBS[active.slug] ?? []).map((s, i) => (
                    <motion.li
                      key={s.slug}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduced ? 0 : 0.04 * i, duration: 0.3 }}
                    >
                      <Link href={routes.subCategory(active.slug, s.slug)} className={styles.subChip}>
                        {s.name}
                      </Link>
                    </motion.li>
                  ))}
                </ul>
                <Link href={routes.category(active.slug)} className={styles.previewCta}>
                  مشاهده جدول قیمت {active.name}
                  <ChevronStartIcon size={18} className="icon--rtl" />
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="hero"
                className={styles.hero}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className={styles.eyebrow}>
                  <span className={styles.live} /> مشاور هوشمند فولاد
                </p>
                <h1 className={styles.title}>
                  اول مشورت،
                  <br />
                  <span className={styles.forge}>بعد خرید.</span>
                </h1>
                <p className={styles.sub}>
                  نمی‌دانی چه بخری؟ متراژت را بگو تا مقدار و هزینه را برایت حساب کنم — یا از فهرست
                  روبه‌رو، دسته‌ات را انتخاب کن.
                </p>
                <form
                  className={styles.ask}
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(q);
                  }}
                  data-event="ai_entry"
                >
                  <span className={styles.askIcon} aria-hidden>
                    <SparkIcon size={20} />
                  </span>
                  <input
                    className={styles.askInput}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="مثلاً: برای سقف ۸۰ متری چقدر میلگرد می‌خواهم؟"
                    aria-label="پرسش از مشاور هوشمند"
                    enterKeyHint="send"
                  />
                  <button type="submit" className={styles.askSend} aria-label="بپرس">
                    <span className={styles.askSendText}>بپرس</span>
                    <ChevronStartIcon size={18} className="icon--rtl" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
