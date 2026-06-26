import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const bad=[];
page.on('response', r => { if(r.status()>=400) bad.push(`${r.status()} ${r.url()}`); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
console.log(bad.length?bad.join('\n'):'no failed requests');
await browser.close();
