// @vitest-environment node
/**
 * looksLikeLeakedReasoning — the guard between a reasoning model's scratchpad
 * and a customer's screen.
 *
 * The positive case is real: this text was rendered in the advisor's own chat
 * bubble on production, 2026-08-17, on a proforma turn. The negative cases
 * matter just as much — a guard that eats legitimate answers would replace a
 * good answer with an outage notice, which is a worse trade than the leak it
 * prevents.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseImmediateRepeat,
  looksLikeLeakedReasoning,
  stripFalseProcessClaims,
} from './answerGuard';

const LEAKED = `We need to respond to user. The user wants to proceed with a proforma for ۳ tons of ۱۶mm rebar, but the system says product not found with that exact name. We need to ask user to specify product name more precisely, using Persian name. Also we must follow style: use "تو" etc. Also we must not reveal internal tool calls.`;

describe('looksLikeLeakedReasoning', () => {
  it('catches the leak that actually shipped', () => {
    expect(looksLikeLeakedReasoning(LEAKED)).toBe(true);
  });

  it('catches a short leak that names the rules it is weighing', () => {
    // Under the eight-word bar, but the marker plus English prose is enough.
    expect(looksLikeLeakedReasoning('The user asks for a price. We must use tool.')).toBe(true);
  });

  it('leaves a normal Persian answer alone', () => {
    expect(
      looksLikeLeakedReasoning(
        'قیمت امروز میلگرد ۱۶ ذوب‌آهن اصفهان ۴۲٬۵۰۰ تومان بر کیلوگرم است. اگر بخواهی، پیش‌فاکتور را همین‌جا آماده می‌کنم.',
      ),
    ).toBe(false);
  });

  it('leaves an answer full of Latin grade codes alone', () => {
    // The exact vocabulary rule 16 tells the model to use: grades and section
    // codes in backticks. Every one of these is 1-2 letters plus digits.
    expect(
      looksLikeLeakedReasoning(
        'برای خاموت `A2` و برای اسکلت `A3` مناسب‌تر است؛ ورق `ST37` و تیرآهن `IPE14` هم موجود است. وزن بر حسب kg و ابعاد بر حسب mm اعلام می‌شود.',
      ),
    ).toBe(false);
  });

  it('leaves a markdown comparison table alone', () => {
    expect(
      looksLikeLeakedReasoning(
        '| کارخانه | قیمت هر کیلو | جمع |\n| --- | --- | --- |\n| ذوب‌آهن | ۴۲٬۵۰۰ | ۸۵٬۰۰۰٬۰۰۰ |\n| فایکو | ۴۳٬۱۰۰ | ۸۶٬۲۰۰٬۰۰۰ |',
      ),
    ).toBe(false);
  });

  it('is quiet on empty or whitespace text', () => {
    // An empty answer is handled as its own case upstream; the guard must not
    // claim a leak it cannot see.
    expect(looksLikeLeakedReasoning('')).toBe(false);
    expect(looksLikeLeakedReasoning('   \n ')).toBe(false);
  });
});

describe('collapseImmediateRepeat', () => {
  it('collapses the stutter that reached a customer', () => {
    // Reported live on 2026-08-18. Note the first copy ends «آهن‌» with a
    // trailing ZWNJ (the signature of a clause cut mid-word and restarted),
    // so the comparison has to ignore ZWNJ and the SECOND copy has to be the
    // one kept.
    expect(collapseImmediateRepeat('بگو چه گریدی از آهن‌ چه گریدی از آهن می‌خواهی')).toBe(
      'بگو چه گریدی از آهن می‌خواهی',
    );
  });

  it('collapses a whole repeated sentence and keeps the rest of the text', () => {
    const doubled =
      'قیمت امروز میلگرد ۱۶ ثبت نشده است. قیمت امروز میلگرد ۱۶ ثبت نشده است. کارشناس اعلام می‌کند.';
    expect(collapseImmediateRepeat(doubled)).toBe(
      'قیمت امروز میلگرد ۱۶ ثبت نشده است. کارشناس اعلام می‌کند.',
    );
  });

  it('never joins across a line break', () => {
    // Two list items that happen to start alike are not a stutter.
    const list = '- میلگرد ۱۴ آجدار ابهر\n- میلگرد ۱۴ آجدار ابهر';
    expect(collapseImmediateRepeat(list)).toBe(list);
  });

  it('leaves a markdown table row alone', () => {
    const row = '| ذوب‌آهن اصفهان | ۴۲٬۵۰۰ | ذوب‌آهن اصفهان | ۴۲٬۵۰۰ |';
    expect(collapseImmediateRepeat(row)).toBe(row);
  });

  it('leaves short or non-adjacent repeats alone', () => {
    // Two words is emphasis, not a stutter…
    expect(collapseImmediateRepeat('خیلی خیلی زود')).toBe('خیلی خیلی زود');
    // …and a phrase that recurs later in the sentence is ordinary Persian.
    const normal = 'میلگرد ۱۴ آجدار داریم و میلگرد ۱۴ آجدار موجود است.';
    expect(collapseImmediateRepeat(normal)).toBe(normal);
  });

  it('leaves a repeated run of bare numbers alone', () => {
    // Sizes and counts legitimately repeat; only a lettered clause counts.
    expect(collapseImmediateRepeat('۱۲ ۱۴ ۱۶ ۱۲ ۱۴ ۱۶')).toBe('۱۲ ۱۴ ۱۶ ۱۲ ۱۴ ۱۶');
  });

  it('leaves a normal answer completely untouched', () => {
    const answer =
      'قیمت امروز میلگرد ۱۶ ذوب‌آهن اصفهان ۴۲٬۵۰۰ تومان بر کیلوگرم است. اگر بخواهی، پیش‌فاکتور را همین‌جا آماده می‌کنم.';
    expect(collapseImmediateRepeat(answer)).toBe(answer);
  });

  it('handles empty and single-word text', () => {
    expect(collapseImmediateRepeat('')).toBe('');
    expect(collapseImmediateRepeat('سلام')).toBe('سلام');
  });
});

/**
 * stripFalseProcessClaims — every POSITIVE case below is a verbatim sentence
 * this advisor put in front of a real visitor (recovered from `ai_messages` on
 * production, 2026-08-18), and every NEGATIVE case is a sentence the system
 * prompt either allows or outright requires. The negatives are the point: an
 * answer that correctly says there is no online payment, or quotes the real
 * button name, or gives rule 2's «آخرین قیمت ثبت‌شده …», must come through
 * untouched.
 */
describe('stripFalseProcessClaims — the claims that reached a customer', () => {
  it('drops «قبل از پرداخت» and keeps the true warning next to it', () => {
    expect(
      stripFalseProcessClaims(
        '⚠️ **نکته مهم:** قیمت نهایی محصولات فولادی بسته به شرایط بازار و تاریخ تحویل (تهران) ممکن است تغییر کند. قبل از پرداخت، قیمت‌ها را دوباره چک کنید.',
      ),
    ).toBe(
      '⚠️ **نکته مهم:** قیمت نهایی محصولات فولادی بسته به شرایط بازار و تاریخ تحویل (تهران) ممکن است تغییر کند.',
    );
  });

  it('drops «پرداخت … انجام خواهد شد», markdown wrapper and all', () => {
    expect(
      stripFalseProcessClaims('*نکته: پرداخت و ارسال فاکتور پس از تأیید نهایی انجام خواهد شد.*'),
    ).toBe('');
  });

  it('drops «به ثبت رسیده است» and keeps the summary under it', () => {
    const answer =
      'درخواست تو برای پیش‌فاکتور ۲۰ شاخه میلگرد ۱۴ آجدار A3 ابهر با طول ۱۲ متر به ثبت رسیده است.\n**خلاصهٔ کارت پیش‌فاکتور:**\n- **وزن کل:** ۲۹۰.۳۷ کیلوگرم';
    expect(stripFalseProcessClaims(answer)).toBe(
      '**خلاصهٔ کارت پیش‌فاکتور:**\n- **وزن کل:** ۲۹۰.۳۷ کیلوگرم',
    );
  });

  it('drops the credential warning and keeps the true login step', () => {
    expect(
      stripFalseProcessClaims(
        'برای تأیید نهایی، فقط باید وارد حساب کاربری شوید. نام کاربری یا رمز عبور را در اینجا ننویسید — کارت مربوطه در پایین پیام تو نمایش داده شده است.',
      ),
    ).toBe('برای تأیید نهایی، فقط باید وارد حساب کاربری شوید.');
  });

  it('drops «ثبت شد», the tracking code it invented, and the later reference to it', () => {
    const answer =
      'درخواست شما ثبت شد. شمارهٔ پیگیری: **PF-14050525-0002-J8CG8H**\n\nمحصول: میلگرد آجدار ۱۴ ابهر، تناژ ۵ تن\n\nکارشناس فروش با شمارهٔ پیگیری بالا تماس خواهد گرفت.';
    expect(stripFalseProcessClaims(answer)).toBe('محصول: میلگرد آجدار ۱۴ ابهر، تناژ ۵ تن');
  });

  it('drops a payment step even when it hands the call to the expert', () => {
    // The کارشناس exemption below must not launder a payment step.
    expect(stripFalseProcessClaims('بعد از پرداخت، کارشناس فروش با تو تماس می‌گیرد.')).toBe('');
  });

  it('drops invented bank details', () => {
    expect(
      stripFalseProcessClaims('مبلغ را به شماره کارت ۶۰۳۷-۹۹۷۵ واریز کن تا سفارش نهایی شود.'),
    ).toBe('');
  });
});

describe('stripFalseProcessClaims — what must survive', () => {
  it('keeps the answer that says there is no online payment', () => {
    // The locked product fact, and the FAQ on /ai says it in these words.
    const truths = [
      'در آهن‌تایم پرداخت آنلاین وجود ندارد؛ فروش با پیش‌فاکتور و تماس کارشناس نهایی می‌شود.',
      'پرداخت آنلاین نداریم.',
      'هیچ مرحلهٔ پرداختی در این گفتگو پیش نمی‌آید.',
      'برای ورود رمز عبور لازم نیست؛ یک کد پیامکی برایت می‌آید.',
    ];
    for (const t of truths) expect(stripFalseProcessClaims(t)).toBe(t);
  });

  it('keeps rule 4-پ’s settlement sentence', () => {
    const t =
      'اگر پیش‌فاکتور رسمی می‌خواهی، درخواست را ثبت می‌کنم تا کارشناس با قیمت لحظه و شرایط تسویه/حمل تماس بگیرد.';
    expect(stripFalseProcessClaims(t)).toBe(t);
  });

  it('keeps the two real button names and the tap that files the request', () => {
    const t =
      'برای ثبت نهایی وارد حساب کاربری شو؛ بعد از ورود دکمهٔ «تأیید و ثبت درخواست» فعال می‌شود و می‌توانی آن را بزنی. با زدن آن دکمه، درخواستت ثبت خواهد شد.';
    expect(stripFalseProcessClaims(t)).toBe(t);
  });

  it('keeps rule 2’s price sentences, which are the ثبت‌شده false positive', () => {
    const truths = [
      'آخرین قیمت ثبت‌شده: ۴۲٬۵۰۰ تومان در تاریخ ۱۴۰۵/۰۵/۲۴؛ قیمت به‌روز را کارشناس تأیید می‌کند.',
      'قیمت‌های روز برای میلگرد ۱۶ از کارخانه‌های مختلف در سیستم ثبت شده، اما قیمت فعلی موجود نیست.',
      'قیمت میلگرد ۱۴ ذوب‌آهن در سیستم امروز ثبت نشده است.',
      'برای ثبت درخواست پیش‌فاکتور، لطفاً شهر تحویل را بگو.',
    ];
    for (const t of truths) expect(stripFalseProcessClaims(t)).toBe(t);
  });

  it('keeps the guide’s product-traceability fact', () => {
    // «کد رهگیری» here is a mill's authenticity code, not an order number —
    // this exact answer is in production and must not lose a bullet.
    const t = '- ✅ **کد رهگیری یکتا** — قابل استعلام و پیگیری';
    expect(stripFalseProcessClaims(t)).toBe(t);
  });

  it('keeps ordinary answers, including a price table and a weight', () => {
    const answers = [
      'قیمت امروز میلگرد ۱۶ ذوب‌آهن اصفهان ۴۲٬۵۰۰ تومان بر کیلوگرم است. اگر بخواهی، پیش‌فاکتور را همین‌جا آماده می‌کنم.',
      'میلگرد ۱۴ آجدار A3 ابهر – ۲۰ شاخه (۱۲ متری)\nوزن کل: **۲۹۰.۳۷ کیلوگرم**',
      '| کارخانه | قیمت هر کیلو |\n| --- | --- |\n| ذوب‌آهن | ۴۲٬۵۰۰ |',
      'در راهنمای آهن‌تایم به تفاوت گرید A2 و A3 پرداخته شده است.',
    ];
    for (const a of answers) expect(stripFalseProcessClaims(a)).toBe(a);
  });

  it('is quiet on empty text', () => {
    expect(stripFalseProcessClaims('')).toBe('');
    expect(stripFalseProcessClaims('   \n ')).toBe('   \n ');
  });
});

describe('stripFalseProcessClaims — the near misses', () => {
  it('does not read a word merely ENDING in «نه» as a denial of payment', () => {
    // «هزینه» / «ماهانه» end in «نه»; without a word boundary on the denial
    // markers these read as «no payment» and the claim walks straight through.
    expect(stripFalseProcessClaims('هزینه پرداخت را ماهانه واریز کن.')).toBe('');
    expect(stripFalseProcessClaims('ماهانه پرداخت کن تا تخفیف بگیری.')).toBe('');
  });

  it('separates the filing NOUN from the filing CLAIM', () => {
    // «ثبت شدنِ درخواست» is a noun phrase about a future event…
    const noun = 'برای ثبت شدن درخواست، دکمهٔ زیر پیام را بزن.';
    expect(stripFalseProcessClaims(noun)).toBe(noun);
    // …«ثبت شدند» is a claim that it already happened.
    expect(stripFalseProcessClaims('هر دو درخواست تو ثبت شدند.')).toBe('');
  });

  it('keeps a سفارش sentence whose only verb is future', () => {
    const t = 'با زدن دکمه، سفارش تو ثبت خواهد شد و کارشناس تماس می‌گیرد.';
    expect(stripFalseProcessClaims(t)).toBe(t);
  });
});
