import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const found = await page.evaluate(() => {
  const out=[];
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.position==='fixed' && s.display!=='none' && s.visibility!=='hidden') {
      const r=el.getBoundingClientRect();
      if (r.width>0&&r.height>0) out.push({cls:(el.className?.toString()||'').slice(0,55),text:(el.textContent||'').trim().slice(0,24),bg:s.backgroundColor,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
    }
  }
  return out;
});
console.log(JSON.stringify(found,null,1));
await browser.close();
