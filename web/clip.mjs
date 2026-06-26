import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.evaluate(async () => { const h=document.body.scrollHeight; for(let y=0;y<h;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,50));} window.scrollTo(0,0); });
await page.waitForTimeout(600);
await page.screenshot({ path: '/home/user/Iron/web/clip.png', clip: { x: 0, y: 270, width: 240, height: 90 } });
await browser.close();
