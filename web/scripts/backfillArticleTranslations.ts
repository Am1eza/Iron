/**
 * One-time backfill for `articles.translations` (migration 0058, i18n audit
 * follow-up — title/excerpt only, see that column's own doc comment in
 * `lib/server/db/schema/content.ts` for why the article BODY is out of
 * scope). Run once against a target database after the migration has been
 * applied there:
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/backfillArticleTranslations.ts
 *
 * Idempotent and additive only — matches existing rows by `slug` and merges
 * (jsonb `||`) only the three locale keys this dictionary covers into
 * `translations`, so re-running it, or running it alongside some other
 * future writer of this same column, never clobbers a key it didn't set.
 * Never touches `title`, `excerpt`, `body_md`, `body_json`, or any other
 * column, and never inserts or deletes a row. Safe to re-run.
 *
 * This dictionary was built from the REAL production blog + news articles
 * (fetched live from the public RSS feeds, `/blog/rss.xml` and
 * `/news/rss.xml`, on 1405/06/18 — 50 blog posts, 2 news pieces) and
 * translated by hand for accuracy and natural B2B/SEO register, not run
 * through a bulk MT pass. A slug this script doesn't recognize (an article
 * published after 1405/06/18, or a different environment's content) is
 * left alone — its `translations` stays null/whatever it already was, and
 * every read site falls back to the fa `title`/`excerpt`, which is the
 * safe, honest default (still-Persian, not broken).
 */
import { Client } from 'pg';

type LocaleContent = { title: string; excerpt: string };
type Translation = { en: LocaleContent; ar: LocaleContent; zh: LocaleContent };

const TRANSLATIONS: Record<string, Translation> = {
  'قیمت-لوله-فولادی-ایران': {
    en: {
      title: 'Steel Pipe Price | Calculation, Comparison & Buying Guide',
      excerpt:
        'Explore steel pipe pricing with sample recorded rates, a pipe-type table, key factors, a per-length calculation method, and a checklist for requesting and comparing proformas.',
    },
    ar: {
      title: 'سعر الأنابيب الفولاذية | الحساب والمقارنة ودليل الشراء',
      excerpt:
        'تعرف على سعر الأنابيب الفولاذية من خلال نماذج أسعار مسجلة، وجدول لأنواع الأنابيب، والعوامل المؤثرة، وطريقة حساب كل قطعة، وقائمة تحقق لطلب عروض السعر ومقارنتها.',
    },
    zh: {
      title: '钢管价格｜计算、比较与选购指南',
      excerpt:
        '通过实际登记价格样本、钢管种类表、影响因素、单支计算方法以及询价与形式发票比较清单，全面了解钢管价格。',
    },
  },
  'پروفیل-سبک': {
    en: {
      title: 'What Is Light Profile Steel? Weight Table, Uses, Price & Buying Guide',
      excerpt:
        'A simple introduction to light profile steel: how it differs from heavy profile, its uses, the weight formula and table, and buying tips — including a look at a real Ahantime product.',
    },
    ar: {
      title: 'ما هو البروفيل الخفيف؟ جدول الوزن والاستخدامات والسعر ودليل الشراء',
      excerpt:
        'تعرف ببساطة على البروفيل الخفيف: الفرق مع النوع الثقيل، والاستخدامات، ومعادلة وجدول الوزن، ونصائح الشراء، مع مراجعة لمنتج حقيقي من آهن‌تايم.',
    },
    zh: {
      title: '轻型型材是什么？重量表、用途、价格与选购指南',
      excerpt:
        '简单了解轻型型材：与重型型材的区别、常见用途、重量公式与重量表，以及选购要点，并附一款安挺真实产品的实测点评。',
    },
  },
  'قیمت-ورق-فولادی-چگونه-تعیین-می-شود-دلار-و-بورس-کالا': {
    en: {
      title: 'How Is Steel Sheet Price Determined? The Dollar & Commodity Exchange',
      excerpt:
        'Understand the factors behind steel sheet pricing — from the dollar rate and the commodity exchange to the difference between hot- and cold-rolled sheet, technical specs, freight cost, and final landed price.',
    },
    ar: {
      title: 'كيف يحدد سعر الصفائح الفولاذية؟ الدولار وبورصة السلع',
      excerpt:
        'تعرف على العوامل المؤثرة في سعر الصفائح الفولاذية؛ من سعر الدولار وبورصة السلع إلى الفرق بين الصفائح الساخنة والباردة، والمواصفات الفنية، وتكلفة الشحن، والسعر النهائي للشراء.',
    },
    zh: {
      title: '钢板价格如何确定？美元汇率与大宗商品交易所',
      excerpt:
        '了解影响钢板价格的各项因素：从美元汇率、大宗商品交易所，到热轧板与冷轧板的区别、技术规格、运费及最终采购成本。',
    },
  },
  'لوله-فولادی-بدون-درز-چیست-راهنمای-استاندارد-رده-و-خرید': {
    en: {
      title: 'What Is Seamless Steel Pipe? Standards, Schedule & Buying Guide',
      excerpt:
        'Get to know seamless (mannesmann) steel pipe — production method, applications, standards, Schedule, weight, the difference from welded pipe, and industrial buying tips.',
    },
    ar: {
      title: 'ما هو الأنبوب الفولاذي عديم اللحام؟ دليل المعايير والفئة والشراء',
      excerpt:
        'تعرف على الأنبوب الفولاذي عديم اللحام (مانيسمان): طريقة التصنيع، الاستخدامات، المعايير، الـSchedule، الوزن، الفرق مع الأنبوب الملحوم، ونصائح الشراء الصناعي.',
    },
    zh: {
      title: '无缝钢管是什么？标准、壁厚等级与选购指南',
      excerpt:
        '了解无缝（曼内斯曼）钢管：生产工艺、应用场景、标准、Schedule 壁厚等级、重量，以及与焊接钢管的区别和工业采购要点。',
    },
  },
  'راهنمای-خواندن-جدول-قیمت-لوله-قطر-ضخامت-schedule-و-وزن': {
    en: {
      title: 'Pipe Price & Weight Table: A Guide to Diameter and Schedule',
      excerpt:
        'A steel pipe weight table covering wall thickness, outer diameter, weight per meter, and how to calculate the total weight for a project.',
    },
    ar: {
      title: 'جدول أسعار ووزن الأنابيب: دليل القطر والـSchedule',
      excerpt:
        'جدول وزن الأنابيب الفولاذية يشمل السماكة، القطر الخارجي، الوزن لكل متر، وطريقة حساب الوزن الإجمالي للمشروع.',
    },
    zh: {
      title: '钢管价格与重量表：管径与 Schedule 壁厚等级指南',
      excerpt: '钢管重量表涵盖壁厚、外径、每米重量，以及项目总重量的计算方法。',
    },
  },
  'لوله-فولادی-انواع-استانداردها-وزن-راهنمای-خرید': {
    en: {
      title: 'What Is Steel Pipe? Types, Standards, Weight & Key Buying Tips',
      excerpt:
        'A guide to choosing and buying steel pipe by application, fluid, pressure, temperature, diameter, wall thickness, production method, and standard — with a comparison table, weight formula, chart, and FAQ.',
    },
    ar: {
      title: 'ما هو الأنبوب الفولاذي؟ الأنواع والمعايير والوزن وأهم نصائح الشراء',
      excerpt:
        'دليل لاختيار وشراء الأنبوب الفولاذي حسب الاستخدام، والمائع، والضغط، ودرجة الحرارة، والقطر، والسماكة، وطريقة التصنيع، والمعيار؛ مع جدول مقارنة، ومعادلة الوزن، ورسم بياني، وأسئلة شائعة.',
    },
    zh: {
      title: '钢管是什么？种类、标准、重量与选购要点',
      excerpt:
        '根据用途、介质、压力、温度、管径、壁厚、生产工艺与标准选购钢管的指南，附对比表、重量计算公式、图表及常见问题解答。',
    },
  },
  'میلگرد-چیست-انواع-گریدها-کاربردها-روش-تولید-و-راهنمای-خرید': {
    en: {
      title: 'What Is Rebar? Types, Grades, Uses, Production & Buying Guide',
      excerpt:
        'Rebar is one of the most important steel sections for reinforcing concrete. Learn about its types, grades A2 through A4, production method, standards, and tips for buying and storing rebar.',
    },
    ar: {
      title: 'ما هو حديد التسليح؟ الأنواع والدرجات والاستخدامات والتصنيع ودليل الشراء',
      excerpt:
        'حديد التسليح من أهم المقاطع الفولاذية لتسليح الخرسانة. تعرف على أنواعه، ودرجاته من A2 إلى A4، وطريقة تصنيعه، والمعايير، ونصائح شرائه وتخزينه.',
    },
    zh: {
      title: '螺纹钢是什么？种类、级别、用途、生产工艺与选购指南',
      excerpt:
        '螺纹钢是用于混凝土配筋的重要钢材之一。本文介绍其种类、A2 至 A4 级别、生产工艺、执行标准，以及采购与储存要点。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-کوپلر-و-اتصالات': {
    en: {
      title: "Invoicing & Iran's Tax System for Rebar Coupler & Structural Fitting Sales",
      excerpt:
        "Rebar couplers and structural fittings come in many types and sizes, often requiring a certificate — which makes entering the correct product code in Iran's e-invoicing system (Samaneh-ye Mo'addian) especially important.",
    },
    ar: {
      title: 'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الكوبلر والوصلات الإنشائية',
      excerpt:
        'تعرض وصلات الكوبلر والوصلات الإنشائية بأنواع وأحجام متعددة وغالبا مع اشتراط شهادة، ما يجعل تسجيل رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أمرا حساسا.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：钢筋连接套筒与结构连接件销售",
      excerpt:
        "钢筋连接套筒与结构连接件规格型号繁多，且常需附带合格证书，因此在伊朗税务发票系统（Samaneh-ye Mo'addian）中正确填写商品编码尤为重要。",
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-پروفیل': {
    en: {
      title: "Invoicing & Iran's Tax System for Profile Sales: Furniture-Grade vs. Column-Grade",
      excerpt:
        "Profile and box sections come in light, heavy, black, and galvanized variants — this variety makes entering the correct product code in Iran's e-invoicing system (Samaneh-ye Mo'addian) especially important.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع البروفيل: الفرق بين درجة الأثاث ودرجة الأعمدة',
      excerpt:
        'يعرض البروفيل والقطاعات المربعة بأنواع خفيفة وثقيلة وسوداء ومجلفنة؛ هذا التنوع يجعل تسجيل رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أمرا حساسا.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：型材销售中的家具级与承重柱级区分",
      excerpt:
        "型材与方管有轻型、重型、黑铁及镀锌等多种规格，品类繁多使得在伊朗税务发票系统（Samaneh-ye Mo'addian）中正确填写商品编码变得尤为重要。",
    },
  },
  'بهترین-زمان-خرید-و-انبار-میلگرد-در-فصل-ساخت-و-ساز': {
    en: {
      title: 'The Best Time to Buy and Stock Rebar During Construction Season',
      excerpt:
        'Seasonal construction demand and the risk of reduced supply in the cold season create a predictable pattern throughout the year. Read tips for buying and stocking rebar each season.',
    },
    ar: {
      title: 'أفضل وقت لشراء وتخزين حديد التسليح خلال موسم البناء',
      excerpt:
        'يشكل الطلب الموسمي على البناء وخطر انخفاض العرض في فصل الشتاء نمطا يمكن التنبؤ به على مدار السنة. تعرف على نصائح شراء وتخزين حديد التسليح في كل فصل.',
    },
    zh: {
      title: '建筑旺季螺纹钢的最佳采购与囤货时机',
      excerpt:
        '建筑业的季节性需求与寒冷季节供应减少的风险，在全年形成了可预测的规律。了解各季节螺纹钢采购与囤货的要点。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-تیرآهن': {
    en: {
      title: "Invoicing & Iran's Tax System for I-Beam Sales: The Cost of a Mistake",
      excerpt:
        "The high value of each I-beam invoice means recording errors in Iran's e-invoicing system (Samaneh-ye Mo'addian) carry a bigger absolute cost. Read the key points for I-beam invoicing.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الكمرة I: كلفة الخطأ الباهظة',
      excerpt:
        'القيمة العالية لكل فاتورة كمرة I تعني أن أخطاء التسجيل في النظام الضريبي الإيراني (سامانه مؤديان) تحدث فرقا ماليا مطلقا أكبر. تعرف على أهم نقاط فوترة الكمرة I.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：工字钢销售与高额出错成本",
      excerpt:
        "工字钢每张发票金额较高，意味着在伊朗税务发票系统（Samaneh-ye Mo'addian）中登记出错会造成更大的绝对损失。了解工字钢开票的关键要点。",
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-فلنج-و-اتصالات': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Flange & Fitting Sales: Precision in Class and Type",
      excerpt:
        'Flanges and fittings come in many types, pressure classes, and materials, often on long project lists — which makes accurate product-code entry essential.',
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الفلنجات والوصلات: الدقة في الفئة والنوع',
      excerpt:
        'تعرض الفلنجات والوصلات بأنواع وفئات ضغط وخامات متعددة، وغالبا ضمن قوائم مشاريع طويلة؛ ما يجعل تسجيل رمز السلعة أمرا حساسا.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：法兰与管件销售中压力等级与型号的精准把控",
      excerpt:
        '法兰与管件种类、压力等级及材质繁多，常出现在冗长的项目清单中，这使得商品编码的准确登记尤为关键。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-لوله': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Pipe Sales: Why Recording Type and Schedule Precisely Matters",
      excerpt:
        "Pipe is sold as seamless, welded, or galvanized, in various schedules and sizes — this variety makes entering the correct product code in Iran's e-invoicing system (Samaneh-ye Mo'addian) especially important.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الأنابيب: أهمية تسجيل النوع والفئة بدقة',
      excerpt:
        'يعرض الأنبوب بأنواع عديمة اللحام والملحومة والمجلفنة، وبفئات وأحجام متعددة؛ هذا التنوع يجعل تسجيل رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أمرا حساسا.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：钢管销售中类型与壁厚等级的精确登记",
      excerpt:
        "钢管分为无缝管、焊接管和镀锌管，规格等级与尺寸繁多，这种多样性使得在伊朗税务发票系统（Samaneh-ye Mo'addian）中正确填写商品编码尤为重要。",
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-شیرآلات-صنعتی': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Industrial Valve Sales: Precision in Type and Class",
      excerpt:
        "Industrial valves come in many types, pressure classes, materials, and sizes, and carry high value — which makes correct product-code entry in Iran's e-invoicing system (Samaneh-ye Mo'addian) especially important.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الصمامات الصناعية: الدقة في النوع والفئة',
      excerpt:
        'تعرض الصمامات الصناعية بأنواع وفئات ضغط وخامات وأحجام متعددة وبقيمة عالية؛ ما يجعل تسجيل رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أمرا حساسا.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：工业阀门销售中类型与压力等级的精准登记",
      excerpt:
        "工业阀门种类、压力等级、材质及规格繁多，且单价较高，这使得在伊朗税务发票系统（Samaneh-ye Mo'addian）中正确填写商品编码尤为重要。",
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-ورق': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Sheet Sales: The Challenge of Choosing the Right Product Code",
      excerpt:
        "Sheet comes in a wide range of types, thicknesses, and grades, making the correct product code in Iran's e-invoicing system (Samaneh-ye Mo'addian) trickier to select than for rebar. Learn the key points for sheet invoicing.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الصفائح: صعوبة اختيار رمز السلعة',
      excerpt:
        'تتميز الصفائح بتنوع كبير في النوع والسماكة والدرجة، ما يجعل اختيار رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أكثر تعقيدا مقارنة بحديد التسليح. تعرف على أهم نقاط فوترة الصفائح.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：钢板销售中商品编码选择的难点",
      excerpt:
        "钢板在种类、厚度和级别上差异很大，因此在伊朗税务发票系统（Samaneh-ye Mo'addian）中选择正确的商品编码比螺纹钢更复杂。了解钢板开票的关键要点。",
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-استیل': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Stainless Steel Sales: Precision in Grade and Finish",
      excerpt:
        "Stainless steel comes in many grades, forms, and finishes, and carries high value — which makes correct product-code entry in Iran's e-invoicing system (Samaneh-ye Mo'addian) especially important. Learn the key points.",
    },
    ar: {
      title:
        'الفاتورة والنظام الضريبي الإيراني (سامانه مؤديان) في بيع الستانلس ستيل: الدقة في تسجيل الدرجة والتشطيب',
      excerpt:
        'يعرض الستانلس ستيل بدرجات وأشكال وتشطيبات متعددة وبقيمة عالية؛ ما يجعل تسجيل رمز السلعة الصحيح في النظام الضريبي الإيراني (سامانه مؤديان) أمرا حساسا. تعرف على أهم النقاط.',
    },
    zh: {
      title: "开票与伊朗税务系统（Samaneh-ye Mo'addian）：不锈钢销售中级别与表面处理的精准登记",
      excerpt:
        "不锈钢级别、形态及表面处理种类繁多，且单价较高，这使得在伊朗税务发票系统（Samaneh-ye Mo'addian）中正确填写商品编码尤为重要。了解相关关键要点。",
    },
  },
  'پرمصرف-ترین-سایز-کوپلر-و-انبارداری': {
    en: {
      title: 'Which Rebar Coupler Size Sells the Most? A Warehousing Guide',
      excerpt:
        'Couplers sized for the most commonly used structural rebar diameters (such as 16, 18, and 20 mm) see the highest demand. Learn how to manage inventory by size and type.',
    },
    ar: {
      title: 'ما هو أكثر مقاس كوبلر مبيعا؟ دليل إدارة المخزون',
      excerpt:
        'تحظى وصلات الكوبلر بمقاسات حديد التسليح الإنشائي الأكثر استخداما (مثل 16 و18 و20 ملم) بأعلى طلب. تعرف على دليل إدارة المخزون حسب المقاس والنوع.',
    },
    zh: {
      title: '哪种规格的钢筋连接套筒销量最高？仓储管理指南',
      excerpt:
        '适配常用结构钢筋规格（如16、18、20毫米）的连接套筒需求量最大。了解按规格与类型进行库存管理的指南。',
    },
  },
  'قوطی-سبک-مبلی-یا-سنگین-ستونی-تفاوت-و-کاربرد': {
    en: {
      title: 'Light vs. Heavy Box Profile: The Difference You Should Know Before Selling',
      excerpt:
        'Steel box profile splits into two very different categories: light (furniture-grade) for furniture and fine work, and heavy (structural) for construction. Learn the difference in thickness and application.',
    },
    ar: {
      title: 'قوطي خفيف أم ثقيل؟ الفرق الذي يجب معرفته قبل البيع',
      excerpt:
        'ينقسم القوطي الفولاذي إلى فئتين مختلفتين تمامًا: خفيف (للأثاث) للأثاث والأعمال الدقيقة، وثقيل (إنشائي) للمنشآت. تعرّف على هذا الفرق في السماكة والاستخدام.',
    },
    zh: {
      title: '轻型与重型方管：销售前必须了解的区别',
      excerpt:
        '钢制方管分为两大类：轻型（家具用）适用于家具及精细加工，重型（结构用）适用于建筑结构。了解两者在厚度与用途上的差异。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-فلزات-رنگی': {
    en: {
      title: "Invoicing & Iran's Tax System for Non-Ferrous Metal Sales: Telling New from Scrap",
      excerpt:
        "Non-ferrous metals come in different metal types, purities, forms, and new-vs-scrap condition — and carry high value. That makes getting the product code right in Iran's e-invoicing system critical.",
    },
    ar: {
      title: 'الفوترة ونظام المؤديان في بيع المعادن غير الحديدية: التمييز بين الجديد والخردة',
      excerpt:
        'تُعرَض المعادن غير الحديدية بأنواع معدن ونقاء وأشكال مختلفة، وبحالة جديدة أو خردة، وتحمل قيمة عالية؛ لذا يصبح تسجيل رمز السلعة الصحيح في نظام المؤديان أمرًا حساسًا.',
    },
    zh: {
      title: '有色金属销售中的开票与纳税系统：区分全新与废料',
      excerpt:
        '有色金属按金属种类、纯度、形态及全新或废料状态划分，价值较高，这使得在伊朗纳税系统中正确登记商品编码变得尤为关键。',
    },
  },
  'بهترین-زمان-خرید-و-انبار-تیرآهن': {
    en: {
      title: 'Best Time to Buy and Stock I-Beams: Two Critical Seasons a Year',
      excerpt:
        "Unlike rebar, I-beam supply has more than one risk season — winter gas cuts and summer power restrictions can both squeeze mill output. Here's how to time your purchase right.",
    },
    ar: {
      title: 'أفضل وقت لشراء وتخزين الكمرات: موسمان حرجان في السنة',
      excerpt:
        'على عكس حديد التسليح، لا تقتصر مخاطر عرض الكمرات على موسم واحد؛ فانقطاع الغاز شتاءً وتقييد الكهرباء صيفًا يمكن أن يقلّصا الإنتاج كليهما. تعرّف على التوقيت الصحيح للشراء.',
    },
    zh: {
      title: '工字钢采购与囤货的最佳时机：一年中的两个关键季节',
      excerpt:
        '与螺纹钢不同，工字钢供应面临不止一个风险季节——冬季限气与夏季限电都可能压缩工厂产量。了解正确的采购时机。',
    },
  },
  'نوع-سطح-فلنج-و-انتخاب-واشر-درست': {
    en: {
      title: 'Flange Face Types (RF and FF) and Choosing the Right Gasket',
      excerpt:
        'Flange sealing faces come in different types (like RF and FF), and the gasket has to match both the face and the fluid. Learn this often-overlooked detail and how it affects sealing.',
    },
    ar: {
      title: 'أنواع سطح الفلنجة (RF وFF) واختيار الحشية الصحيحة',
      excerpt:
        'يأتي سطح إحكام الفلنجة بأنواع مختلفة (مثل RF وFF)، ويجب أن تتوافق الحشية معه ومع نوع السائل. تعرّف على هذه النقطة الأقل تداولًا وأثرها على الإحكام.',
    },
    zh: {
      title: '法兰密封面类型（RF与FF）及垫片的正确选择',
      excerpt:
        '法兰密封面有多种类型（如RF和FF），垫片必须与密封面及介质相匹配。了解这一常被忽视的细节及其对密封效果的影响。',
    },
  },
  'خرید-نقدی-چکی-یا-اعتباری-میلگرد': {
    en: {
      title:
        'Cash, Post-Dated Check, or Credit for Rebar Purchases: Which Is Better for Cash Flow?',
      excerpt:
        "The payment method you choose for rebar purchases directly affects your business's cash flow. We compare the advantages and risks of cash payment, post-dated checks, and credit purchases.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك مؤجل أو بالأجل لحديد التسليح: أيهما أفضل للتدفق النقدي؟',
      excerpt:
        'تؤثر طريقة الدفع في شراء حديد التسليح مباشرة على التدفق النقدي لعملك. نقارن مزايا ومخاطر الدفع النقدي والشيك المؤجل والشراء بالأجل.',
    },
    zh: {
      title: '现金、远期支票还是赊购螺纹钢？哪种方式对现金流更有利',
      excerpt:
        '螺纹钢采购的付款方式会直接影响企业现金流。我们比较现金支付、远期支票与赊购三种方式的优势与风险。',
    },
  },
  'چرا-سایز-اسمی-لوله-با-قطر-واقعی-فرق-دارد': {
    en: {
      title: "Why Does a Pipe's Nominal Size Differ from Its Actual Diameter in Millimeters?",
      excerpt:
        'A "1-inch" pipe isn\'t exactly 25.4 mm in diameter — nominal size is an industry convention, not a pure mathematical conversion. We explain this with examples.',
    },
    ar: {
      title: 'لماذا يختلف المقاس الاسمي للأنبوب عن قطره الفعلي بالمليمتر؟',
      excerpt:
        'لا يبلغ قطر الأنبوب «بوصة واحدة» بالضبط 25.4 مليمترًا؛ فالمقاس الاسمي اتفاقية صناعية، لا تحويلًا رياضيًا خالصًا. نوضح هذه النقطة بأمثلة.',
    },
    zh: {
      title: '为什么钢管的公称尺寸与实际毫米直径不同？',
      excerpt:
        '一根「1英寸」钢管的直径并非精确等于25.4毫米；公称尺寸是一种行业惯例，而非纯数学换算。我们通过实例说明这一点。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-کلاف-و-مفتول': {
    en: {
      title:
        "Invoicing & Iran's Tax System for Wire Coil and Wire Sales: Getting Grade and Type Right",
      excerpt:
        "Wire coil and wire come in plain, ribbed, and galvanized types, different grades, and either coil or straight-bar form — this variety makes getting the right product code in Iran's e-invoicing system essential.",
    },
    ar: {
      title: 'الفوترة ونظام المؤديان في بيع الملفات والأسلاك: الدقة في الدرجة والنوع',
      excerpt:
        'تُعرَض الملفات والأسلاك بأنواع ملساء ومضلعة ومجلفنة، وبدرجات مختلفة، وبشكل ملف أو قضيب مستقيم؛ هذا التنوع يجعل تسجيل رمز السلعة الصحيح في نظام المؤديان أمرًا حساسًا.',
    },
    zh: {
      title: '盘条与钢丝销售中的开票与纳税系统：精准把握等级与类型',
      excerpt:
        '盘条与钢丝分为光面、螺纹、镀锌等类型及不同等级，并以盘卷或直条形式供应；这种多样性使得在纳税系统中准确登记商品编码尤为重要。',
    },
  },
  'شیر-دستی-یا-برقی-پنوماتیک-انتخاب-عملگر': {
    en: {
      title: 'Manual, Electric, or Pneumatic Valve? An Actuator Selection Guide for Customers',
      excerpt:
        'Industrial valves can be actuated manually, electrically, or pneumatically, and each type suits different conditions. Learn the differences and how to choose the right one.',
    },
    ar: {
      title: 'صمام يدوي أم كهربائي أم بنيوماتيكي؟ دليل اختيار المشغّل للعميل',
      excerpt:
        'يمكن تشغيل الصمام الصناعي يدويًا أو كهربائيًا أو بنيوماتيكيًا (بالهواء)، ولكل مشغّل حالات تناسبه. تعرّف على الفروق ودليل الاختيار.',
    },
    zh: {
      title: '手动、电动还是气动阀门？客户执行机构选型指南',
      excerpt:
        '工业阀门可采用手动、电动或气动方式驱动，每种执行机构都适用于不同工况。了解它们的差异及选型指南。',
    },
  },
  'ورق-گالوانیزه-و-گرماژ-پوشش-روی': {
    en: {
      title: 'Galvanized Sheet: Why Zinc Coating Weight Matters More Than Thickness Alone',
      excerpt:
        "Thickness isn't the only thing that matters in galvanized sheet — the zinc coating weight determines how well it resists rust. We look at how this hidden spec affects price.",
    },
    ar: {
      title: 'الصفائح المجلفنة: لماذا يُعدّ وزن طلاء الزنك أهم من السماكة وحدها',
      excerpt:
        'في الصفائح المجلفنة، لا تُعدّ السماكة وحدها مهمة؛ فوزن طلاء الزنك هو ما يحدّد مدى مقاومة الصفيحة للصدأ. نستعرض أثر هذه الخاصية غير الظاهرة على السعر.',
    },
    zh: {
      title: '镀锌板：为什么镀锌量比厚度本身更重要',
      excerpt:
        '镀锌板不只是厚度重要；镀锌量决定了钢板的防锈耐久性。我们分析这一隐藏参数对价格的影响。',
    },
  },
  'فاکتور-و-سامانه-مودیان-برای-فروش-نبشی-و-ناودانی': {
    en: {
      title: "Invoicing & Iran's Tax System for Angle and Channel Sales: Getting the Type Right",
      excerpt:
        "Angle and channel come as hot-rolled or pressed, equal or unequal leg, light or heavy, and in many sizes — this variety makes registering the right product code in Iran's e-invoicing system critical.",
    },
    ar: {
      title: 'الفوترة ونظام المؤديان في بيع الزاوية والقناة: الدقة في النوع',
      excerpt:
        'تُعرَض الزاوية والقناة بأنواع مدرفلة وبالكبس، بأجنحة متساوية أو غير متساوية، خفيفة أو ثقيلة، وبمقاسات متعددة؛ هذا التنوع يجعل تسجيل رمز السلعة الصحيح في نظام المؤديان أمرًا حساسًا.',
    },
    zh: {
      title: '角钢与槽钢销售中的开票与纳税系统：精准把握类型',
      excerpt:
        '角钢与槽钢分为热轧与压制、等边与不等边、轻型与重型等多种规格；这种多样性使得在纳税系统中准确登记商品编码尤为关键。',
    },
  },
  'راهنمای-فینیش-سطح-استیل-برای-فروش': {
    en: {
      title: 'A Guide to Stainless Steel Surface Finishes for Sales',
      excerpt:
        'In stainless steel, surface finish (matte, polished, brushed, mirror) affects price and application just as much as grade does. Learn the finish types and how to guide customers in choosing.',
    },
    ar: {
      title: 'دليل تشطيبات سطح الستانلس ستيل للبيع',
      excerpt:
        'في الستانلس ستيل، يؤثر تشطيب السطح (مطفي، لامع، مخطط، مرآوي) على السعر والاستخدام بقدر تأثير الدرجة نفسها. تعرّف على أنواع التشطيب ودليل الاختيار للعميل.',
    },
    zh: {
      title: '不锈钢表面处理销售指南',
      excerpt:
        '不锈钢的表面处理（哑光、抛光、拉丝、镜面）对价格和用途的影响与钢级同样重要。了解各类表面处理方式及客户选型指南。',
    },
  },
  'خرید-نقدی-یا-چکی-کوپلر-و-اتصالات-سازه-ای': {
    en: {
      title:
        'Cash or Check for Rebar Couplers and Structural Connectors: Managing Project-Based Orders',
      excerpt:
        'Rebar couplers and structural connectors are usually bought for a specific project with a set delivery schedule. Learn how this project-based nature affects your choice of payment method.',
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك لوصلات حديد التسليح والوصلات الإنشائية: إدارة الطلبات المشروعية',
      excerpt:
        'عادةً ما تُشترى وصلات حديد التسليح والوصلات الإنشائية لمشروع محدد وبجدول تسليم معين. تعرّف على كيفية تأثير هذه الطبيعة المشروعية على اختيار طريقة الدفع.',
    },
    zh: {
      title: '现金还是支票购买钢筋连接器与结构配件？项目订单管理',
      excerpt:
        '钢筋连接器与结构配件通常为特定项目按交付计划采购。了解这种项目属性如何影响付款方式的选择。',
    },
  },
  'خرید-نقدی-یا-چکی-پروفیل-و-مدیریت-نقدینگی': {
    en: {
      title: 'Cash or Check for Profile Purchases: Handling High-Volume Loads',
      excerpt:
        'Profile and box sections are usually traded in high volumes, so one large purchase can tie up a lot of cash. We weigh the advantages and risks of each payment method.',
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للبروفيل: كيف نتعامل مع الأحمال الكبيرة الحجم',
      excerpt:
        'عادةً ما يُتداول البروفيل والقوطي بكميات كبيرة، لذا يمكن لعملية شراء كبيرة أن تحبس قدرًا كبيرًا من السيولة. نقيّم مزايا ومخاطر كل طريقة دفع.',
    },
    zh: {
      title: '现金还是支票购买型材？如何应对大批量货物',
      excerpt:
        '型材和方管通常以大批量交易，一次大额采购可能占用大量现金流。我们权衡每种付款方式的优势与风险。',
    },
  },
  'چطور-خبر-جهانی-قیمت-مس-به-بازار-ایران-می-رسد': {
    en: {
      title:
        'How Global Copper Price News Reaches the Iranian Market: Understanding the Lag and the Opportunity',
      excerpt:
        "When copper prices move on the London Metal Exchange, that change reaches Iran's domestic market with some delay and via the dollar exchange rate. Understanding this lag creates an opportunity for timing purchases and sales.",
    },
    ar: {
      title: 'كيف تصل أخبار أسعار النحاس العالمية إلى السوق الإيرانية؟ فهم التأخير والفرصة',
      excerpt:
        'عندما يتغيّر سعر النحاس في بورصة لندن، يصل هذا التغيير إلى السوق المحلية بتأخير طفيف وعبر مسار سعر الدولار. فهم هذا التأخير يخلق فرصة لتوقيت الشراء والبيع.',
    },
    zh: {
      title: '全球铜价资讯如何影响伊朗市场？理解滞后效应与机会',
      excerpt:
        '伦敦金属交易所铜价发生变动时，这一变化会经由美元汇率、以一定延迟传导至伊朗国内市场。理解这种滞后有助于把握采购与销售的时机。',
    },
  },
  'سایز-فلنج-و-اتصالات-و-هماهنگی-با-لوله': {
    en: {
      title: 'Flange and Fitting Size: How to Match It with Pipe and System',
      excerpt:
        "Flange and fitting size must match the pipe's nominal size and the system's pressure class. Learn the concept of nominal size, common inch-vs-metric mistakes, and how to match them correctly.",
    },
    ar: {
      title: 'مقاس الفلنجة والوصلات؛ كيف نوافقه مع الأنبوب والنظام',
      excerpt:
        'يجب أن يتوافق مقاس الفلنجة والوصلات مع المقاس الاسمي للأنبوب وفئة النظام. تعرّف على مفهوم المقاس الاسمي والأخطاء الشائعة بين البوصة والمتري وطريقة المطابقة.',
    },
    zh: {
      title: '法兰与管件尺寸：如何与钢管及系统相匹配',
      excerpt:
        '法兰与管件的尺寸必须与钢管的公称尺寸及系统压力等级相匹配。了解公称尺寸的概念、常见的英制与公制混淆错误以及正确的匹配方法。',
    },
  },
  'خرید-نقدی-یا-چکی-لوله-و-مدیریت-نقدینگی': {
    en: {
      title: 'Cash or Check for Pipe Purchases: Handling High-Value Loads',
      excerpt:
        'A pipe load — especially industrial sizes and seamless pipe — carries high value, and one large purchase ties up a lot of cash. We weigh the advantages and risks of each payment method.',
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للأنابيب: كيف نتعامل مع الأحمال العالية القيمة',
      excerpt:
        'يحمل حِمل الأنابيب، خاصةً المقاسات الصناعية والأنابيب السلسة، قيمة عالية، وعملية شراء كبيرة واحدة تحبس قدرًا كبيرًا من السيولة. نقيّم مزايا ومخاطر كل طريقة دفع.',
    },
    zh: {
      title: '现金还是支票购买钢管？如何应对高价值货物',
      excerpt:
        '钢管货物，尤其是工业规格与无缝钢管，价值较高，一次大额采购会占用大量现金流。我们权衡每种付款方式的优势与风险。',
    },
  },
  'خرید-نقدی-چکی-یا-اعتباری-تیرآهن': {
    en: {
      title: 'Cash, Check, or Credit for I-Beam Purchases: The Effect of High Unit Value',
      excerpt:
        'The value of a single I-beam is several times that of a rebar bar, so your choice of payment method has a bigger effect on cash flow. We weigh the advantages and risks of each method.',
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك أو بالأجل للكمرات وأثر القيمة العالية للوحدة',
      excerpt:
        'قيمة الكمرة الواحدة تبلغ عدة أضعاف قيمة قضيب حديد التسليح، لذا فإن قرار طريقة الدفع يترك أثرًا أكبر على السيولة. نقيّم مزايا ومخاطر كل طريقة.',
    },
    zh: {
      title: '现金、支票还是赊购工字钢？单价过高的影响',
      excerpt:
        '每根工字钢的价值是螺纹钢的数倍，因此付款方式的选择对现金流的影响更大。我们权衡每种方式的优势与风险。',
    },
  },
  'کدام-مفتول-برای-کدام-کاربرد-مش-میخ-توری': {
    en: {
      title: 'Which Wire for Which Use? A Diameter Guide for Mesh, Nails, and Fencing',
      excerpt:
        "Every wire application needs its own diameter and type — from mesh and fence wire to nail-making and rebar tie wire. Here's a guide to choosing the right diameter for each job.",
    },
    ar: {
      title: 'أي مفتول لأي استخدام؟ دليل القطر للشباك والمسامير والأسلاك الشائكة',
      excerpt:
        'كل استخدام للمفتول يحتاج قطرًا ونوعًا خاصًا به؛ من الشباك وسلك السياج إلى صناعة المسامير وربط حديد التسليح. إليك دليلًا لاختيار القطر المناسب لكل عمل.',
    },
    zh: {
      title: '哪种钢丝适合哪种用途？网片、钉子与围栏丝的直径选择指南',
      excerpt:
        '每种钢丝用途都需要专属的直径和类型——从网片、围栏丝到制钉与绑扎钢筋用丝。本文带您了解各类用途的直径选择指南。',
    },
  },
  'چک-لیست-بازرسی-تحویل-بار-میلگرد': {
    en: {
      title: 'Rebar Delivery Inspection Checklist, Step by Step',
      excerpt:
        "Most rebar shipment discrepancies are discovered after delivery — when it's already too late. A checklist covering everything from the truck's arrival to final settlement, for a proper load inspection.",
    },
    ar: {
      title: 'قائمة فحص استلام شحنة حديد التسليح، خطوة بخطوة',
      excerpt:
        'تُكتشف معظم الفروقات في شحنة حديد التسليح بعد التسليم، حين يكون الأوان قد فات. قائمة فحص من وصول الشاحنة وحتى التسوية النهائية لفحص الشحنة بشكل صحيح.',
    },
    zh: {
      title: '螺纹钢到货验收清单，逐步指南',
      excerpt:
        '大多数螺纹钢货物的差异都是在交付后才被发现，那时已为时过晚。本清单涵盖从卡车到场到最终结算的全过程，助您正确验收货物。',
    },
  },
  'سایز-شیر-صنعتی-و-هماهنگی-با-لوله': {
    en: {
      title: 'Industrial Valve Size and Matching It to Pipe in Installation',
      excerpt:
        "A valve's size must exactly match the pipe and flange's nominal size. Here's a look at the nominal size concept (DN/NPS), its relationship to actual diameter, and common matching mistakes.",
    },
    ar: {
      title: 'مقاس الصمام الصناعي ومطابقته مع الأنبوب عند التركيب',
      excerpt:
        'يجب أن يطابق مقاس الصمام تمامًا المقاس الاسمي للأنبوب والفلنجة. نتعرّف على مفهوم المقاس الاسمي (DN/NPS)، وعلاقته بالقطر الفعلي، والأخطاء الشائعة في المطابقة.',
    },
    zh: {
      title: '工业阀门尺寸及其与管道安装的匹配',
      excerpt:
        '阀门尺寸必须与管道及法兰的公称尺寸精确匹配。本文介绍公称尺寸（DN/NPS）的概念、其与实际直径的关系，以及匹配中常见的错误。',
    },
  },
  'خرید-نقدی-یا-چکی-ورق-و-مدیریت-نقدینگی': {
    en: {
      title: 'Cash or Check for Sheet Steel? Why a Heavy Coil Makes the Payment Decision Sensitive',
      excerpt:
        "Each steel coil is a large, high-value unit, so a single purchase can tie up a large share of your cash flow. Here's a look at the benefits and risks of each payment method for buying sheet.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للصفائح؛ لماذا يجعل الكويل الثقيل قرار الدفع حساسًا',
      excerpt:
        'كل كويل من الصفائح وحدة كبيرة وعالية القيمة، لذا يمكن لعملية شراء واحدة أن تُجمّد جزءًا كبيرًا من السيولة. نتعرّف على مزايا ومخاطر كل طريقة دفع لشراء الصفائح.',
    },
    zh: {
      title: '现金还是支票购买钢板？为何沉重的卷材让付款方式的决定变得敏感',
      excerpt:
        '每卷钢板都是价值高昂的大宗单位，一次采购可能占用大量流动资金。本文介绍购买钢板时各种付款方式的优势与风险。',
    },
  },
  'کاربرد-نبشی-تکی-و-جفتی-و-انتخاب-درست': {
    en: {
      title: 'Single or Double Angle? A Usage Guide for Getting the Sale Right',
      excerpt:
        "Angle steel is used in structures both singly and in pairs (double angle), and each configuration has a different application and load-bearing capacity. Here's a look at this difference and a selection guide for your customers.",
    },
    ar: {
      title: 'زاوية مفردة أم مزدوجة؟ دليل الاستخدام للبيع الصحيح',
      excerpt:
        'تُستخدم الزاوية الحديدية في المنشآت سواء مفردة أو مزدوجة (دبل)، ولكل حالة تطبيق وقدرة تحمل مختلفة. نتعرّف على هذا الفرق ودليل الاختيار للعميل.',
    },
    zh: {
      title: '单角钢还是双角钢？正确销售的用途指南',
      excerpt:
        '角钢在结构中既可单独使用，也可成对（双拼）使用，两种方式的用途和承载能力各不相同。本文介绍二者的区别及面向客户的选购指南。',
    },
  },
  'خرید-نقدی-یا-چکی-استیل-و-ارزش-بالا': {
    en: {
      title: 'Cash or Check for Stainless Steel? Why the Decision Is a Hard One',
      excerpt:
        "Stainless steel is worth several times more per kilogram than carbon steel, so every deal involves a large sum. Here's a look at how this high value affects the choice of payment method.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للستانلس ستيل؛ لماذا يكون القرار صعبًا',
      excerpt:
        'قيمة كل كيلوغرام من الستانلس ستيل تبلغ أضعاف قيمة الفولاذ الكربوني، لذا تصبح كل صفقة مبلغًا كبيرًا. نتعرّف على تأثير هذه القيمة العالية على اختيار طريقة الدفع.',
    },
    zh: {
      title: '现金还是支票购买不锈钢？为何这个决定如此艰难',
      excerpt:
        '不锈钢每公斤的价值是碳钢的数倍，因此每笔交易金额都很大。本文介绍这种高价值如何影响付款方式的选择。',
    },
  },
  'چک-لیست-تحویل-کوپلر-و-اتصالات-سازه-ای': {
    en: {
      title: 'Delivery Checklist for Rebar Couplers and Structural Connectors Before Use',
      excerpt:
        "Inspecting rebar couplers and structural connectors before use has a few critical points: matching size and type, thread quality, surface condition, and an accompanying certificate. Here's a step-by-step checklist.",
    },
    ar: {
      title: 'قائمة فحص استلام الوصلات (الكوبلر) واتصالات الإنشاءات قبل الاستخدام',
      excerpt:
        'لفحص وصلات حديد التسليح واتصالات الإنشاءات قبل الاستخدام عدة نقاط حاسمة: مطابقة المقاس والنوع، جودة اللولبة، سلامة السطح، ووجود الشهادة المرافقة. نتعرّف على قائمة فحص خطوة بخطوة.',
    },
    zh: {
      title: '钢筋连接套筒与结构连接件使用前的验收清单',
      excerpt:
        '钢筋连接套筒与结构连接件在使用前的验收有几个关键点：尺寸与型号匹配、螺纹质量、表面状况以及随附证书。本文提供逐步验收清单。',
    },
  },
  'چک-لیست-بازرسی-تحویل-بار-پروفیل-و-قوطی': {
    en: {
      title:
        'Delivery Inspection Checklist for Profile and Box Sections: From Thickness to Galvanizing Test',
      excerpt:
        "Delivery of profile and box sections has a few points of its own: checking thickness with calipers, testing the galvanized coating texture, and inspecting the condition of welded corners. Here's a step-by-step checklist.",
    },
    ar: {
      title: 'قائمة فحص استلام شحنة البروفيل والقطاعات المربعة؛ من السماكة إلى فحص الطلاء',
      excerpt:
        'لاستلام البروفيل والقطاعات المربعة عدة نقاط خاصة بها: فحص السماكة بالفرجار، اختبار نسيج الطلاء المجلفن، وفحص سلامة الزوايا الملحومة. نتعرّف على قائمة فحص خطوة بخطوة.',
    },
    zh: {
      title: '型材与方管到货验收清单：从厚度到镀锌层测试',
      excerpt:
        '型材与方管的验收有其特有的几个要点：用卡尺检查厚度、测试镀锌层纹理，以及检查焊接边角的完整性。本文提供逐步验收清单。',
    },
  },
  'خرید-نقدی-یا-چکی-فلزات-رنگی-و-ارزش-بالا': {
    en: {
      title: 'Cash or Check for Non-Ferrous Metals, and the Risk of High Value',
      excerpt:
        "The value per kilogram of copper and brass is several times that of steel, so even a seemingly small deal can amount to a large sum. Here's a look at how this high value affects the choice of payment method.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للمعادن غير الحديدية ومخاطر القيمة العالية',
      excerpt:
        'قيمة كل كيلوغرام من النحاس والنحاس الأصفر تبلغ أضعاف قيمة الفولاذ، لذا حتى الصفقة الصغيرة ظاهريًا قد تكون مبلغًا كبيرًا. نتعرّف على تأثير هذه القيمة العالية على اختيار طريقة الدفع.',
    },
    zh: {
      title: '现金还是支票购买有色金属？高价值带来的风险',
      excerpt:
        '铜和黄铜每公斤的价值是钢材的数倍，因此看似小额的交易也可能涉及一大笔钱。本文介绍这种高价值如何影响付款方式的选择。',
    },
  },
  'خرید-نقدی-یا-چکی-فلنج-و-اتصالات': {
    en: {
      title: 'Cash or Check for Flanges and Fittings? Managing Project Orders',
      excerpt:
        "Flanges and fittings are often purchased as project orders with high variety and value. Here's a look at how this affects the choice of payment method.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للفلنجات والوصلات؛ إدارة طلبات المشاريع',
      excerpt:
        'غالبًا ما تُشترى الفلنجات والوصلات ضمن طلبات مشاريع متنوعة وعالية القيمة. نتعرّف على تأثير هذه الخاصية على اختيار طريقة الدفع.',
    },
    zh: {
      title: '现金还是支票购买法兰与管件？项目订单的管理',
      excerpt:
        '法兰与管件通常以项目订单形式采购，品类多样且价值较高。本文介绍这一特点如何影响付款方式的选择。',
    },
  },
  'چک-لیست-بازرسی-تحویل-بار-لوله': {
    en: {
      title: 'Pipe Delivery Inspection Checklist: From Wall Thickness to Weld Seam Integrity',
      excerpt:
        'Pipe delivery has a few points of its own: checking wall thickness with calipers, weld seam integrity on welded pipe, and verifying the actual length of each piece — all in this checklist.',
    },
    ar: {
      title: 'قائمة فحص استلام شحنة الأنابيب؛ من سماكة الجدار إلى سلامة خط اللحام',
      excerpt:
        'لاستلام الأنابيب عدة نقاط خاصة بها: فحص سماكة الجدار بالفرجار، سلامة خط اللحام في الأنابيب الملحومة، والتحقق من الطول الفعلي لكل قطعة، في هذه القائمة.',
    },
    zh: {
      title: '钢管到货验收清单：从壁厚到焊缝质量',
      excerpt:
        '钢管验收有其特有的要点：用卡尺检查壁厚、检查焊管的焊缝质量，以及核实每根管材的实际长度——全部收录于本清单。',
    },
  },
  'خرید-نقدی-یا-چکی-کلاف-و-مفتول': {
    en: {
      title: 'Cash or Check for Wire Coils? Aligning Payment with High Tonnage',
      excerpt:
        "Wire coils trade in high tonnages and standard coil weights, so a single purchase can tie up a large amount of cash. Here's a look at the benefits and risks of each payment method.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للفتلة والمفتول؛ ضبط الدفع مع الأوزان الكبيرة',
      excerpt:
        'تُباع الفتلة بأوزان كبيرة وبأوزان قياسية للفتلة، لذا يمكن لعملية شراء واحدة أن تُجمّد سيولة كبيرة. نتعرّف على مزايا ومخاطر كل طريقة دفع.',
    },
    zh: {
      title: '现金还是支票购买盘条与钢丝？大吨位下的付款安排',
      excerpt:
        '盘条以大吨位和标准盘重进行交易，一次采购可能占用大量流动资金。本文介绍各种付款方式的优势与风险。',
    },
  },
  'چک-لیست-بازرسی-تحویل-بار-تیرآهن': {
    en: {
      title: 'I-Beam Delivery Inspection Checklist, Beyond a Simple Weigh-In',
      excerpt:
        'Unlike rebar, quality loss in I-beams usually comes from flange and web thickness, not length. Read the complete I-beam delivery checklist in this article.',
    },
    ar: {
      title: 'قائمة فحص استلام شحنة الكمرة (I-Beam)، أبعد من مجرد الوزن الإجمالي',
      excerpt:
        'على عكس حديد التسليح، عادةً ما يأتي انخفاض جودة الكمرة من سماكة الجناح والجسم، لا من الطول. اقرأ القائمة الكاملة لفحص استلام شحنة الكمرة في هذا المقال.',
    },
    zh: {
      title: '工字钢到货验收清单：不只是称重那么简单',
      excerpt:
        '与螺纹钢不同，工字钢的质量问题通常来自翼缘和腹板厚度，而非长度。本文提供完整的工字钢到货验收清单。',
    },
  },
  'خرید-نقدی-یا-چکی-شیرآلات-صنعتی': {
    en: {
      title: 'Cash or Check for Industrial Valves and Their High Per-Unit Value',
      excerpt:
        "High-class industrial valves carry a high per-unit value and are often custom, project-based orders. Here's a look at how this affects the choice of payment method.",
    },
    ar: {
      title: 'الشراء نقدًا أو بشيك للصمامات الصناعية وارتفاع قيمة الوحدة',
      excerpt:
        'الصمامات الصناعية عالية الفئة ذات قيمة عالية للوحدة، وغالبًا ما تكون بطلبات مخصصة ومشاريعية. نتعرّف على تأثير هذه الخاصية على اختيار طريقة الدفع.',
    },
    zh: {
      title: '现金还是支票购买工业阀门？单价高昂的考量',
      excerpt:
        '高等级工业阀门单价较高，且多为定制化的项目订单。本文介绍这一特点如何影响付款方式的选择。',
    },
  },
  'چک-لیست-تحویل-بار-ورق': {
    en: {
      title:
        'Sheet Steel Delivery Checklist: From Micrometer Checks to Surface and Waviness Inspection',
      excerpt:
        "Sheet steel delivery has points that don't apply to rebar or I-beams: checking thickness with a micrometer, inspecting for surface waviness and rust, and matching the analysis certificate — all in one checklist.",
    },
    ar: {
      title: 'قائمة فحص استلام شحنة الصفائح؛ من الميكرومتر إلى فحص السطح والتموّج',
      excerpt:
        'لاستلام شحنة الصفائح نقاط لا توجد في حديد التسليح أو الكمرة: فحص السماكة بالميكرومتر، فحص التموّج والصدأ على السطح، ومطابقة شهادة التحليل، كلها في قائمة واحدة.',
    },
    zh: {
      title: '钢板到货验收清单：从千分尺检测到表面与波浪度检查',
      excerpt:
        '钢板到货验收有其特有要点，是螺纹钢和工字钢所没有的：用千分尺检查厚度、检查表面波浪度和锈蚀，并核对材质分析证书——全部收录于本清单。',
    },
  },
  'مقایسه-میلگرد-کارخانه-های-مختلف-برای-فروش-مجدد': {
    en: {
      title: 'Comparing Rebar from Different Mills, from a Resale Perspective',
      excerpt:
        'The difference between rebar mills often comes down less to material quality and more to freight cost and price transparency on the commodity exchange. A look at these differences for a better resale choice.',
    },
    ar: {
      title: 'مقارنة حديد التسليح من مصانع مختلفة من منظور إعادة البيع',
      excerpt:
        'غالبًا ما يعود الفرق بين مصانع حديد التسليح إلى تكلفة الشحن وشفافية السعر في بورصة السلع، أكثر من جودة الخامة نفسها. نظرة على هذه الفروق لاختيار أفضل لإعادة البيع.',
    },
    zh: {
      title: '从转售角度比较不同厂家的螺纹钢',
      excerpt:
        '不同螺纹钢厂家之间的差异，往往更多在于运费成本和大宗商品交易所的价格透明度，而非材质本身。本文从转售角度分析这些差异，助您做出更好的选择。',
    },
  },
  'پیش-بینی-قیمت-پروفیل-در-سال-۱۴۰۵': {
    en: {
      title: 'Profile Steel Price Forecast for 1405: Three Market Scenarios',
      excerpt:
        'A price forecast for profile steel in 1405 (the Iranian calendar year), based on the exchange rate, sheet steel, energy costs, and supply and demand — with three pricing scenarios and a guide to the right time to buy.',
    },
    ar: {
      title: 'توقعات أسعار البروفيل لعام 1405؛ تحليل ثلاثة سيناريوهات للسوق',
      excerpt:
        'توقعات أسعار البروفيل للعام الإيراني 1405 استنادًا إلى سعر الصرف، والصفائح الفولاذية، والطاقة، والعرض والطلب؛ مع ثلاثة سيناريوهات سعرية ودليل لأنسب وقت للشراء.',
    },
    zh: {
      title: '1405年型材价格预测：三种市场情景分析',
      excerpt:
        '基于汇率、钢板价格、能源成本及供需关系，对伊朗历1405年型材价格进行预测，附三种价格情景及最佳采购时机指南。',
    },
  },
  'پیش-بینی-قیمت-لوله-در-سال-۱۴۰۵-سناریوهای-بازار-ایران': {
    en: {
      title: 'Pipe Price Forecast for 1405: Iran Market Scenarios',
      excerpt:
        "A scenario-based analysis of pipe prices for 1405 using Ahantime's own baseline data, exchange rate and steel factors, market risks, differences between pipe types, and a purchasing decision guide.",
    },
    ar: {
      title: 'توقعات أسعار الأنابيب لعام 1405؛ سيناريوهات السوق الإيرانية',
      excerpt:
        'تحليل سيناريوهات أسعار الأنابيب للعام 1405 بالاستناد إلى بيانات آهن‌تايم الأساسية، وعوامل سعر الصرف والفولاذ، ومخاطر السوق، والفروق بين أنواع الأنابيب، ودليل لاتخاذ قرار الشراء.',
    },
    zh: {
      title: '1405年钢管价格预测：伊朗市场情景分析',
      excerpt:
        '基于安挺自有基准数据、汇率与钢材因素、市场风险、各类钢管差异，对1405年钢管价格进行情景分析，并提供采购决策指南。',
    },
  },
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const client = new Client(url);
  await client.connect();

  let updated = 0;
  let skipped = 0;
  for (const [slug, t] of Object.entries(TRANSLATIONS)) {
    const payload = { en: t.en, ar: t.ar, zh: t.zh };
    const res = await client.query(
      `update articles
       set translations = coalesce(translations, '{}'::jsonb) || $1::jsonb
       where slug = $2`,
      [JSON.stringify(payload), slug],
    );
    if (res.rowCount) updated += res.rowCount;
    else skipped++;
  }

  const [{ rows: total }] = await Promise.all([
    client.query("select count(*)::int as n from articles where status = 'published'"),
  ]);
  const [{ rows: stillUntranslated }] = await Promise.all([
    client.query(
      "select count(*)::int as n from articles where status = 'published' and translations is null",
    ),
  ]);

  console.log(`articles: ${updated} matched+updated, ${skipped} dictionary entries matched no row`);
  console.log(
    `published articles still fully untranslated: ${stillUntranslated[0].n} of ${total[0].n}`,
  );
  if (Number(stillUntranslated[0].n) > 0) {
    console.log(
      'Rows above are ones this dictionary does not cover — published after 1405/06/18, or an environment this script has never seen. They fall back to the fa title/excerpt on every locale, which is safe; extend the dictionary above and re-run (idempotent) to cover them.',
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
