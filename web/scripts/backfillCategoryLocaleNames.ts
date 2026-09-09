/**
 * One-time backfill for `categories.name_en/name_ar/name_zh` and
 * `sub_categories.name_en/name_ar/name_zh` (migration 0057, i18n audit
 * follow-up). Run once against a target database after the migration has
 * been applied there:
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/backfillCategoryLocaleNames.ts
 *
 * Idempotent and additive only — matches existing rows by `slug` (and, for
 * sub-categories, the parent category's `slug`) and UPDATEs only the three
 * translated columns; never touches `name`, `order`, `slug`, or any other
 * column, and never inserts or deletes a row. Safe to re-run.
 *
 * This dictionary was built from the REAL production taxonomy (queried live
 * via the public `/api/categories` endpoint on 1405/06/17 — 8 categories,
 * 85 sub-categories), not the `MOCK_CATEGORY_SUBS` dev/test fixture in
 * `lib/data/nav.ts`, which the audit discovered has drifted from production
 * (fewer categories, superseded sub-category slugs — see that file's own
 * header comment). A slug this script doesn't recognize (production catalog
 * growth since 1405/06/17, or a different environment's taxonomy) is left
 * alone — its name_en/ar/zh stay null and every read site falls back to the
 * fa `name`, which is the safe, honest default (still-Persian, not broken).
 */
import { Client } from 'pg';

type Translation = { en: string; ar: string; zh: string };

const CATEGORIES: Record<string, Translation> = {
  rebar: { en: 'Rebar', ar: 'حديد التسليح', zh: '螺纹钢' },
  ibeam: { en: 'I-Beam', ar: 'كمرة I', zh: '工字钢' },
  profile: { en: 'Profile', ar: 'بروفيل (قطاعات)', zh: '型材' },
  sheet: { en: 'Sheet', ar: 'الصفائح', zh: '钢板' },
  'angle-channel': { en: 'Angle & Channel', ar: 'الزاوية والقناة', zh: '角钢与槽钢' },
  pipe: { en: 'Pipe', ar: 'الأنابيب', zh: '钢管' },
  steel: { en: 'Stainless Steel', ar: 'الستانلس ستيل', zh: '不锈钢' },
  'felezat-rangi': { en: 'Non-Ferrous Metals', ar: 'المعادن غير الحديدية', zh: '有色金属' },
  // Dev/test-fixture-only (MOCK_CATEGORY_SUBS in lib/data/nav.ts) — not a
  // production category, kept translated so local dev/e2e stay honest.
  wire: { en: 'Wire Rod & Wire', ar: 'أسلاك الحديد', zh: '盘条与钢丝' },
};

/** Keyed `${categorySlug}/${subSlug}`. */
const SUB_CATEGORIES: Record<string, Translation> = {
  // angle-channel
  'angle-channel/nabshi': { en: 'Equal Angle', ar: 'زاوية متساوية', zh: '等边角钢' },
  'angle-channel/angle-unequal': { en: 'Unequal Angle', ar: 'زاوية غير متساوية', zh: '不等边角钢' },
  'angle-channel/spot': { en: 'Cut Angle (Cleat)', ar: 'زاوية قصيرة', zh: '短角钢' },
  'angle-channel/channel-light': { en: 'Light Channel', ar: 'قناة خفيفة', zh: '轻型槽钢' },
  'angle-channel/channel-heavy': { en: 'Heavy Channel', ar: 'قناة ثقيلة', zh: '重型槽钢' },
  'angle-channel/separi': { en: 'T-Bar', ar: 'زاوية تي (تي بار)', zh: 'T型钢' },
  'angle-channel/val-post': { en: 'Wall Post', ar: 'عمود جداري (وول بوست)', zh: '墙柱型材' },
  // pipe
  'pipe/seamless-internal': { en: 'Seamless Pipe (Domestic)', ar: 'أنبوب سيمليس محلي', zh: '无缝管(国产)' },
  'pipe/seamless-external': { en: 'Seamless Pipe (Imported)', ar: 'أنبوب سيمليس مستورد', zh: '无缝管(进口)' },
  'pipe/gas': { en: 'Gas Pipe', ar: 'أنبوب غاز', zh: '燃气管' },
  'pipe/industrial': { en: 'Welded Industrial Pipe', ar: 'أنبوب صناعي ملحوم', zh: '工业焊管' },
  'pipe/scaffold': { en: 'Scaffold Pipe', ar: 'أنبوب سقالات', zh: '脚手架管' },
  'pipe/galvanized': { en: 'Galvanized Pipe', ar: 'أنبوب مجلفن', zh: '镀锌管' },
  'pipe/spiral': { en: 'Spiral Pipe', ar: 'أنبوب حلزوني', zh: '螺旋管' },
  'pipe/furniture': { en: 'Furniture-Grade Pipe', ar: 'أنبوب درجة الأثاث', zh: '家具级管' },
  'pipe/well-casing': { en: 'Well Casing Pipe', ar: 'أنبوب تغليف الآبار', zh: '套管(井用)' },
  'pipe/thick-walled': { en: 'Thick-Walled Pipe', ar: 'أنبوب سميك الجدار', zh: '厚壁管' },
  // steel (stainless)
  'steel/pipe': { en: 'Stainless Steel Pipe', ar: 'أنبوب ستانلس ستيل', zh: '不锈钢管' },
  'steel/profile': { en: 'Stainless Steel Profile', ar: 'بروفيل ستانلس ستيل', zh: '不锈钢型材' },
  'steel/angle': { en: 'Stainless Steel Angle', ar: 'زاوية ستانلس ستيل', zh: '不锈钢角钢' },
  'steel/channel': { en: 'Stainless Steel Channel', ar: 'قناة ستانلس ستيل', zh: '不锈钢槽钢' },
  'steel/strip': { en: 'Stainless Steel Strip', ar: 'شريط ستانلس ستيل', zh: '不锈钢带' },
  'steel/wire-mesh': { en: 'Stainless Steel Wire Mesh', ar: 'شبك أسلاك ستانلس ستيل', zh: '不锈钢丝网' },
  'steel/mesh': { en: 'Stainless Steel Mesh', ar: 'مش ستانلس ستيل', zh: '不锈钢网' },
  'steel/tube': { en: 'Stainless Steel Tube', ar: 'تيوب ستانلس ستيل', zh: '不锈钢圆管' },
  'steel/ring': { en: 'Stainless Steel Ring', ar: 'حلقة ستانلس ستيل', zh: '不锈钢环' },
  'steel/flange': { en: 'Stainless Steel Flange', ar: 'فلانجة ستانلس ستيل', zh: '不锈钢法兰' },
  'steel/spring': { en: 'Stainless Steel Spring', ar: 'نابض (سبرنج) ستانلس ستيل', zh: '不锈钢弹簧' },
  // felezat-rangi (non-ferrous)
  'felezat-rangi/aluminum-pipe': { en: 'Aluminum Pipe', ar: 'أنبوب ألومنيوم', zh: '铝管' },
  'felezat-rangi/aluminum-rebar': { en: 'Aluminum Rod', ar: 'قضيب ألومنيوم', zh: '铝棒' },
  'felezat-rangi/aluminum-flat-bar': { en: 'Aluminum Flat Bar', ar: 'شريط مسطح ألومنيوم', zh: '铝扁条' },
  'felezat-rangi/aluminum-angle': { en: 'Aluminum Angle', ar: 'زاوية ألومنيوم', zh: '铝角材' },
  'felezat-rangi/aluminum-welding-wire': { en: 'Aluminum Welding Wire', ar: 'سلك لحام ألومنيوم', zh: '铝焊丝' },
  'felezat-rangi/copper-pipe': { en: 'Copper Pipe', ar: 'أنبوب نحاس', zh: '铜管' },
  'felezat-rangi/copper-strip': { en: 'Copper Strip', ar: 'شريط نحاس', zh: '铜带' },
  'felezat-rangi/copper-sheet': { en: 'Copper Sheet', ar: 'صفيحة نحاس', zh: '铜板' },
  'felezat-rangi/copper-rebar': { en: 'Copper Rod', ar: 'قضيب نحاس', zh: '铜棒' },
  'felezat-rangi/copper-bushing': { en: 'Copper Bushing', ar: 'كُم (بوشن) نحاس', zh: '铜衬套' },
  'felezat-rangi/aluminum-sheet': { en: 'Aluminum Sheet', ar: 'صفيحة ألومنيوم', zh: '铝板' },
  'felezat-rangi/aluminum-profile': { en: 'Aluminum Profile', ar: 'بروفيل ألومنيوم', zh: '铝型材' },
  'felezat-rangi/aluminum-channel': { en: 'Aluminum Channel', ar: 'قناة ألومنيوم', zh: '铝槽' },
  // rebar
  'rebar/deformed': { en: 'Deformed Rebar', ar: 'حديد تسليح مضلع', zh: '带肋钢筋' },
  'rebar/heat-treated': { en: 'Heat-Treated Rebar', ar: 'حديد تسليح معالج حرارياً', zh: '热处理钢筋' },
  'rebar/coupler': { en: 'Rebar Coupler', ar: 'وصلة (كوبلر) حديد التسليح', zh: '钢筋连接套筒' },
  'rebar/mylgrd-sadh': { en: 'Plain Rebar', ar: 'حديد تسليح أملس', zh: '光圆钢筋' },
  'rebar/stainless': { en: 'Stainless Rebar', ar: 'حديد تسليح ستانلس ستيل', zh: '不锈钢钢筋' },
  // profile
  'profile/box-square': { en: 'Square Box Section', ar: 'بروفيل مربع', zh: '方管' },
  'profile/box-rect': { en: 'Rectangular Box Section', ar: 'بروفيل مستطيل', zh: '矩形管' },
  'profile/frame': { en: 'Door & Window Frame Profile', ar: 'بروفيل أبواب ونوافذ', zh: '门窗型材' },
  'profile/chaharpahlu': { en: 'Square Bar', ar: 'قضيب مربع', zh: '方钢' },
  'profile/chaharpahlu-alloy': { en: 'Alloy Square Bar', ar: 'قضيب مربع من سبيكة', zh: '合金方钢' },
  'profile/congress': { en: 'Corrugated Profile', ar: 'بروفيل مضلع', zh: '波纹型材' },
  'profile/prvfyl-sakhtmany': { en: 'Construction Profile', ar: 'بروفيل إنشائي', zh: '建筑型材' },
  'profile/profil-sotuni': { en: 'Column Profile', ar: 'بروفيل أعمدة', zh: '立柱型材' },
  'profile/prvfyl-snaty': { en: 'Industrial Profile', ar: 'بروفيل صناعي', zh: '工业型材' },
  'profile/profil-mobli': { en: 'Furniture-Grade Profile', ar: 'بروفيل درجة الأثاث', zh: '家具级型材' },
  'profile/profil-galvanizeh': { en: 'Galvanized Profile', ar: 'بروفيل مجلفن', zh: '镀锌型材' },
  'profile/profil-z': { en: 'Z-Profile', ar: 'بروفيل Z', zh: 'Z型钢' },
  'profile/prvfyl-astyl': { en: 'Stainless Steel Profile', ar: 'بروفيل ستانلس ستيل', zh: '不锈钢型材' },
  // sheet
  'sheet/black': { en: 'Black Sheet (Hot-Rolled)', ar: 'صفيحة سوداء (ساخنة الدرفلة)', zh: '黑板(热轧)' },
  'sheet/oiled': { en: 'Oiled Sheet (Cold-Rolled)', ar: 'صفيحة مزيتة (باردة الدرفلة)', zh: '涂油板(冷轧)' },
  'sheet/galvanized': { en: 'Galvanized Sheet', ar: 'صفيحة مجلفنة', zh: '镀锌板' },
  'sheet/pickled': { en: 'Pickled Sheet', ar: 'صفيحة مخللة', zh: '酸洗板' },
  'sheet/checkered': { en: 'Checkered Sheet', ar: 'صفيحة مبروزة', zh: '花纹板' },
  'sheet/colored': { en: 'Pre-Painted Sheet', ar: 'صفيحة ملونة', zh: '彩涂板' },
  'sheet/alloy': { en: 'Alloy Sheet', ar: 'صفيحة من سبيكة', zh: '合金板' },
  'sheet/deck': { en: 'Steel Deck Sheet', ar: 'صاج مموج', zh: '楼承板' },
  'sheet/strip': { en: 'Steel Strip', ar: 'شريط حديد', zh: '钢带' },
  'sheet/sandwich-panel': { en: 'Sandwich Panel', ar: 'ساندويتش بانل', zh: '夹芯板' },
  'sheet/corrugated': { en: 'Corrugated Sheet', ar: 'صفيحة مموجة', zh: '瓦楞板' },
  'sheet/roofing': { en: 'Roofing Sheet', ar: 'صفيحة أسقف', zh: '屋面板' },
  'sheet/steel': { en: 'Stainless Steel Sheet', ar: 'صفيحة ستانلس ستيل', zh: '不锈钢板' },
  'sheet/grating': { en: 'Grating', ar: 'شبك أرضيات', zh: '格栅板' },
  'sheet/aluzinc': { en: 'Aluzinc (Galvalume)', ar: 'ألوزنك (جالفالوم)', zh: '铝锌板(镀铝锌)' },
  'sheet/tin-coated': { en: 'Tin-Coated Sheet', ar: 'صفيحة مطلية بالقصدير', zh: '镀锡板' },
  'sheet/perforated-black': { en: 'Perforated Black Sheet', ar: 'صفيحة سوداء مثقبة', zh: '黑冲孔板' },
  'sheet/wear-resistant': { en: 'Wear-Resistant Sheet', ar: 'صفيحة مقاومة للتآكل', zh: '耐磨板' },
  'sheet/marine': { en: 'Marine-Grade Sheet', ar: 'صفيحة بحرية', zh: '船用板' },
  'sheet/vrgh-st52': { en: 'Sheet ST52', ar: 'صفيحة ST52', zh: 'ST52钢板' },
  'sheet/vrgh-a516': { en: 'Sheet A516', ar: 'صفيحة A516', zh: 'A516钢板' },
  // ibeam
  'ibeam/light': { en: 'Light', ar: 'خفيف', zh: '轻型' },
  'ibeam/tirahan': { en: 'Standard I-Beam', ar: 'كمرة I قياسية', zh: '标准工字钢' },
  'ibeam/hash-sabok': { en: 'Light H-Beam (HEA)', ar: 'H خفيف (HEA)', zh: '轻型H型钢(HEA)' },
  'ibeam/hash-sangin': { en: 'Heavy H-Beam (HEB)', ar: 'H ثقيل (HEB)', zh: '重型H型钢(HEB)' },
  'ibeam/lane-zanburi': { en: 'Castellated Beam', ar: 'عارضة مخرمة', zh: '蜂窝梁' },

  // --- Below: MOCK_CATEGORY_SUBS (lib/data/nav.ts) dev/test fixture slugs
  // only — this taxonomy has drifted from production (see that file's own
  // header comment) but is what `db:seed`/e2e/local dev actually seed, so
  // translating it too keeps local screenshots and manual QA honest.
  'angle-channel/tbar': { en: 'T-Bar', ar: 'زاوية تي (تي بار)', zh: 'T型钢' },
  'angle-channel/angle': { en: 'Equal Angle', ar: 'زاوية متساوية', zh: '等边角钢' },
  'ibeam/hea': { en: 'Light H (HEA)', ar: 'H خفيف (HEA)', zh: '轻型H型钢(HEA)' },
  'ibeam/heb': { en: 'Heavy H (HEB)', ar: 'H ثقيل (HEB)', zh: '重型H型钢(HEB)' },
  'ibeam/ipe': { en: 'IPE', ar: 'IPE', zh: 'IPE' },
  'ibeam/castellated': { en: 'Castellated', ar: 'عارضة مخرمة', zh: '蜂窝梁' },
  'pipe/seamless': { en: 'Seamless', ar: 'سيمليس (بدون لحام)', zh: '无缝管' },
  'profile/z': { en: 'Z-Profile', ar: 'بروفيل Z', zh: 'Z型钢' },
  'profile/galvanized': { en: 'Galvanized', ar: 'مجلفن', zh: '镀锌' },
  'profile/column': { en: 'Column 135', ar: 'عمودي 135', zh: '柱型135' },
  'profile/furniture': { en: 'Furniture-Grade', ar: 'درجة الأثاث', zh: '家具级' },
  'rebar/deformed-a2': { en: 'Deformed A2', ar: 'مضلع A2', zh: '带肋 A2' },
  'rebar/plain': { en: 'Plain', ar: 'أملس', zh: '光圆' },
  'rebar/coil': { en: 'Coil', ar: 'لفائف', zh: '盘卷' },
  'rebar/stirrup': { en: 'Stirrup', ar: 'كانات', zh: '箍筋' },
  'rebar/alloy': { en: 'Alloy', ar: 'سبائكي', zh: '合金' },
  'wire/coil': { en: 'Plain Coil', ar: 'لفة سلك سادة', zh: '光圆盘条' },
  'wire/coil-ribbed': { en: 'Ribbed Coil', ar: 'لفة سلك مضلع', zh: '带肋盘条' },
  'wire/wire': { en: 'Black Wire', ar: 'سلك أسود', zh: '黑钢丝' },
  'wire/wire-galvanized': { en: 'Galvanized Wire', ar: 'سلك مجلفن', zh: '镀锌钢丝' },
  'wire/tie': { en: 'Tie Wire', ar: 'سلك ربط حديد التسليح', zh: '扎丝' },
  'wire/mesh': { en: 'Mesh', ar: 'شبك (مش)', zh: '钢丝网' },
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const client = new Client(url);
  await client.connect();

  let catUpdated = 0;
  let catSkipped = 0;
  for (const [slug, t] of Object.entries(CATEGORIES)) {
    const res = await client.query(
      `update categories set name_en = $1, name_ar = $2, name_zh = $3 where slug = $4`,
      [t.en, t.ar, t.zh, slug],
    );
    if (res.rowCount) catUpdated += res.rowCount;
    else catSkipped++;
  }

  let subUpdated = 0;
  let subSkipped = 0;
  for (const [key, t] of Object.entries(SUB_CATEGORIES)) {
    const [catSlug, subSlug] = key.split('/');
    const res = await client.query(
      `update sub_categories s set name_en = $1, name_ar = $2, name_zh = $3
       from categories c where s.category_id = c.id and c.slug = $4 and s.slug = $5`,
      [t.en, t.ar, t.zh, catSlug, subSlug],
    );
    if (res.rowCount) subUpdated += res.rowCount;
    else subSkipped++;
  }

  const [{ rows: catTotal }, { rows: subTotal }] = await Promise.all([
    client.query('select count(*)::int as n from categories'),
    client.query('select count(*)::int as n from sub_categories'),
  ]);
  const [{ rows: catNull }, { rows: subNull }] = await Promise.all([
    client.query('select count(*)::int as n from categories where name_en is null'),
    client.query('select count(*)::int as n from sub_categories where name_en is null'),
  ]);

  console.log(`categories: ${catUpdated} matched+updated, ${catSkipped} dictionary entries matched no row`);
  console.log(`sub_categories: ${subUpdated} matched+updated, ${subSkipped} dictionary entries matched no row`);
  console.log(`categories still untranslated (no en name): ${catNull[0].n} of ${catTotal[0].n}`);
  console.log(`sub_categories still untranslated (no en name): ${subNull[0].n} of ${subTotal[0].n}`);
  if (Number(catNull[0].n) > 0 || Number(subNull[0].n) > 0) {
    console.log(
      'Rows above are ones this dictionary does not cover — added to the catalog after 1405/06/17, or a taxonomy slug this script never saw. They fall back to the fa name on every locale, which is safe; extend the dictionaries above and re-run (idempotent) to cover them.',
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
