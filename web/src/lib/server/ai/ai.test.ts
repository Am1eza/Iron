import { describe, it, expect } from 'vitest';
import { GroundingLedger, numbersInText, sanitizeGrounded, UNGROUNDED_REPLACEMENT } from './grounding';

/* ------------------------- grounding validator ------------------------- */

describe('GroundingLedger + sanitizeGrounded (AC-D-3)', () => {
  it('passes numbers that came from tools', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded('قیمت میلگرد ۳۸,۵۰۰ تومان بر کیلوگرم است.', ledger, new Set());
    expect(r.violations).toEqual([]);
    expect(r.text).toContain('۳۸,۵۰۰');
  });

  it('censors an invented price', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded('قیمت حدوداً ۴۲٬۰۰۰ تومان است.', ledger, new Set());
    expect(r.violations).toEqual([42000]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
    expect(r.text).not.toContain('۴۲٬۰۰۰');
  });

  it('allows the «هزار تومان» scaled form of a grounded price', () => {
    const ledger = new GroundingLedger();
    ledger.add(38000);
    const r = sanitizeGrounded('حدود ۳۸ هزار تومان بر کیلو.', ledger, new Set());
    expect(r.violations).toEqual([]);
  });

  it('censors an INVENTED «هزار تومان» scaled price (adversarial)', () => {
    const ledger = new GroundingLedger();
    ledger.add(38000); // only 38k is real
    const r = sanitizeGrounded('حدود ۴۵ هزار تومان بر کیلو.', ledger, new Set());
    expect(r.violations).toEqual([45000]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
  });

  it('a grounded but scaled 45-میلیون total does NOT license an invented «۴۵ هزار» price', () => {
    const ledger = new GroundingLedger();
    ledger.add(45_000_000); // real project total
    const r = sanitizeGrounded('قیمت هر کیلو حدود ۴۵ هزار تومان است.', ledger, new Set());
    expect(r.violations).toEqual([45000]);
  });

  it('passes the compound verbalization «۳۸ هزار و ۵۰۰ تومان» of a grounded 38,500', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded('قیمت امروز ۳۸ هزار و ۵۰۰ تومان بر کیلوگرم است.', ledger, new Set());
    expect(r.violations).toEqual([]);
  });

  it('catches Arabic-Indic digits «٤٢٠٠٠» (script LLMs emit for Persian)', () => {
    const r = sanitizeGrounded('قیمت ٤٢٠٠٠ تومان است.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([42000]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
  });

  it('catches a ZWNJ-joined money figure «۹۵‌تومان»', () => {
    const r = sanitizeGrounded('فقط ۹۵‌تومان اختلاف دارد.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([95]);
  });

  it('censors spelled-out money («چهل و دو هزار تومان») outright', () => {
    const r = sanitizeGrounded('قیمت حدود چهل و دو هزار تومان است.', new GroundingLedger(), new Set());
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
    expect(r.text).not.toContain('چهل و دو هزار تومان');
  });

  it('date patterns are data, not claims (Jalali + ISO)', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded(
      'قیمت ۳۸۵۰۰ تومان؛ به‌روزرسانی ۱۴۰۵/۰۴/۱۱ (2026-06-27).',
      ledger,
      new Set(),
    );
    expect(r.violations).toEqual([]);
    expect(r.text).toContain('۱۴۰۵/۰۴/۱۱');
  });

  it('user scale-aware whitelist: «بودجه ۵۰۰ میلیون» licenses the full 500,000,000', () => {
    const user = new Set(numbersInText('بودجه‌ام ۵۰۰ میلیون تومان است'));
    const r = sanitizeGrounded('با بودجهٔ ۵۰۰ میلیون تومانی‌ات…', new GroundingLedger(), user);
    expect(r.violations).toEqual([]);
    // …but the bare user "3" (طبقه) does NOT license an invented ۳ میلیون.
    const user2 = new Set(numbersInText('خونهٔ ۳ طبقه می‌سازم'));
    const r2 = sanitizeGrounded('هزینهٔ جوشکاری حدود ۳ میلیون تومان است.', new GroundingLedger(), user2);
    expect(r2.violations).toEqual([3000000]);
  });

  it('allows the «میلیون تومان» scaled form of a grounded total', () => {
    const ledger = new GroundingLedger();
    ledger.add(820_000_000);
    const r = sanitizeGrounded('جمع کل حدود ۸۲۰ میلیون تومان می‌شود.', ledger, new Set());
    expect(r.violations).toEqual([]);
  });

  it('allows user-typed numbers (their own inputs are not invented)', () => {
    const user = new Set(numbersInText('یه خونهٔ ۱۲۰ متری ۲ طبقه، بودجه ۵۰۰,۰۰۰,۰۰۰ تومان'));
    const r = sanitizeGrounded('برای ۱۲۰ متر و بودجهٔ ۵۰۰٬۰۰۰٬۰۰۰ تومانی‌ات…', new GroundingLedger(), user);
    expect(r.violations).toEqual([]);
  });

  it('leaves small non-claim numbers (sizes, floors, counts) alone', () => {
    const r = sanitizeGrounded('میلگرد ۱۴ برای سقف ۲ طبقه گزینهٔ خوبی است.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([]);
  });

  it('censors a small number glued to a money unit', () => {
    const r = sanitizeGrounded('فقط ۹۵ تومان اختلاف دارد.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([95]);
  });

  it('records every number of a nested tool result', () => {
    const ledger = new GroundingLedger();
    ledger.addFromJson({ a: [{ price: 41000 }], b: { total: 820000000 } });
    expect(ledger.has(41000)).toBe(true);
    expect(ledger.has(820000000)).toBe(true);
  });

  it('kind separation: a real WEIGHT never validates an invented PRICE with the same numeral', () => {
    const ledger = new GroundingLedger();
    ledger.addFromJson({ rebarKg: 3000 }); // calcWeight-style result — tagged 'weight'
    const r = sanitizeGrounded('قیمت میلگرد ۳۰۰۰ تومان است.', ledger, new Set());
    expect(r.violations).toEqual([3000]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
    // ...but the SAME 3000 correctly grounds a weight claim.
    const r2 = sanitizeGrounded('وزنش ۳۰۰۰ کیلوگرم است.', ledger, new Set());
    expect(r2.violations).toEqual([]);
  });

  it('kind tagging from field names: price/cost → money, weight/kg/ton → weight', () => {
    const ledger = new GroundingLedger();
    ledger.addFromJson({ rebarCost: 92000000, avgRebarPricePerKg: 41000, rebarKg: 2200, rebarTons: 2.2, totalAreaM2: 120 });
    expect(sanitizeGrounded('هزینه حدود ۹۲ میلیون تومان می‌شود.', ledger, new Set()).violations).toEqual([]);
    expect(sanitizeGrounded('قیمت هر کیلو ۴۱۰۰۰ تومان است.', ledger, new Set()).violations).toEqual([]);
    expect(sanitizeGrounded('وزن میلگرد ۲۲۰۰ کیلوگرم است.', ledger, new Set()).violations).toEqual([]);
    // A weight-only figure must not ground an unrelated money claim of the same size.
    expect(sanitizeGrounded('قیمت ۲۲۰۰ تومان است.', ledger, new Set()).violations).toEqual([2200]);
  });

  it('censors scale-LESS spelled money/weight («پانصد تومان», «صد کیلوگرم»)', () => {
    const r1 = sanitizeGrounded('فقط پانصد تومان بیشتر است.', new GroundingLedger(), new Set());
    expect(r1.violations.length).toBeGreaterThan(0);
    expect(r1.text).not.toContain('پانصد تومان');
    const r2 = sanitizeGrounded('وزنش حدود صد کیلوگرم است.', new GroundingLedger(), new Set());
    expect(r2.violations.length).toBeGreaterThan(0);
    expect(r2.text).not.toContain('صد کیلوگرم');
  });
});

/**
 * DoD-D: «a QA test set of ≥30 adversarial prompts produces zero ungrounded
 * numbers». Each entry simulates a model reply that tries to smuggle an
 * invented figure in a different disguise; the only grounded number is 38500.
 */
describe('adversarial QA set (DoD-D, ≥30 prompts, zero ungrounded numbers)', () => {
  const ADVERSARIAL: string[] = [
    'قیمت میلگرد ۴۲۰۰۰ تومان است.',
    'قیمت میلگرد 42000 تومان است.',
    'قیمت حدوداً ۴۲,۰۰۰ تومان بر کیلوگرم.',
    'قیمت ۴۲٬۰۰۰ تومان بر کیلوگرم است.',
    'حدود ۴۲ هزار تومان در نظر بگیر.',
    'چیزی حدود 42 هزار تومان می‌شود.',
    'بین ۴۱۵۰۰ تا ۴۳۰۰۰ تومان است.',
    'دیروز ۳۹۹۰۰ بود، امروز کمی بالاتر.',
    'هر شاخه تقریباً ۱۵۵۰ گرم سبک‌تر شده و قیمتش ۴۱۲۳۴ تومان است.',
    'وزن هر شاخه ۱۸۷۵ کیلوگرم است.',
    'هزینهٔ کل پروژه ۸۵۰ میلیون تومان می‌شود.',
    'جمعاً ۸۵۰٬۰۰۰٬۰۰۰ تومان هزینه دارد.',
    'با احتساب مالیات ۴۶۲۰۰ تومان.',
    'قیمت درب کارخانه ۴۰۵۵۰ و بنگاه ۴۱۹۰۰ تومان.',
    'تقریباً ۴.۲ میلیون تومان برای هر تن.',
    'هر کیلو 41500 ریال… ببخشید تومان.',
    'نرخ امروز: ۴۱۵۰۰',
    'میانگین بازار ۴۰۰۰۰ تومان است.',
    'اگر عجله داری همین ۴۱۰۰۰ را قبول کن.',
    'کارخانهٔ الف ۴۰۹۰۰ و کارخانهٔ ب ۴۱۲۰۰ می‌دهد.',
    'با تخفیف می‌شود ۳۹۵۰۰ تومان.',
    'فقط ۹۹ تومان با رقیب اختلاف داریم.',
    'قیمت جهانی حدود ۵۵۰ دلار است، یعنی حدود ۴۵۰۰۰ تومان.',
    'بشکه‌ای ۱۲۰۰۰۰۰ تومان حساب کن.',
    'هر متر مربع ۲۲ کیلو، یعنی ۲۶۴۰ کیلوگرم و ۱۰۸٬۲۴۰٬۰۰۰ تومان.',
    'به‌روزرسانی ۱۴۰۵/۰۴/۱۱: قیمت ۴۱۷۵۰ تومان.',
    'حدود ۴۱ هزار و ۵۰۰ تومان است.',
    'قیمت پایه ۳۸۵۰۱ تومان است.',
    'یعنی روزی ۱۵۰۰۰۰۰ تومان سود می‌کنی.',
    'مجموع سفارش شما ۷۷۰٬۰۰۰٬۰۰۰ تومان می‌شود.',
    'وزنش می‌شود ۲۳۴۵ کیلو.',
    'قیمت ورق هم ۴۹۹۰۰ تومان است.',
  ];

  it(`censors every invented number across ${ADVERSARIAL.length} adversarial replies`, () => {
    const ledger = new GroundingLedger();
    ledger.add(38500); // the ONLY real number this session
    for (const reply of ADVERSARIAL) {
      const r = sanitizeGrounded(reply, ledger, new Set());
      expect(r.violations.length, `should catch: ${reply}`).toBeGreaterThan(0);
      // No censored figure may survive in the sanitized text.
      for (const v of r.violations) {
        expect(numbersInText(r.text)).not.toContain(v);
      }
    }
  });

  it('while the genuinely grounded phrasings still pass', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    for (const ok of [
      'قیمت امروز ۳۸۵۰۰ تومان بر کیلوگرم است.',
      'قیمت امروز ۳۸,۵۰۰ تومان است.',
      'قیمت 38500 تومان (به‌روز).',
    ]) {
      expect(sanitizeGrounded(ok, ledger, new Set()).violations, ok).toEqual([]);
    }
  });
});
