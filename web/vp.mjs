import { chromium } from '@playwright/test';
const url=process.argv[2], out=process.argv[3], w=Number(process.argv[4]||390), h=Number(process.argv[5]||844);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log('saved',out);
