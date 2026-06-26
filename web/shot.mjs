import { chromium } from '@playwright/test';
const url = process.argv[2] || 'http://localhost:3000/';
const out = process.argv[3] || '/home/user/Iron/web/shot.png';
const width = Number(process.argv[4] || 1440);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
// scroll through to trigger IntersectionObserver reveals
await page.evaluate(async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
