import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.IMAGE2_VERIFY_BASE ?? 'http://127.0.0.1:3013';
const label = (process.env.IMAGE2_VERIFY_LABEL ?? 'local').replace(/[^a-z0-9-]/gi, '');
const dir = `output/acceptance-${label}`;
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge', headless: true });
const evidence = { base, sampledAt: new Date().toISOString(), pages: [], pageErrors: [], blockedWrites: [] };
const context = await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*', route => {
  if (!['GET','HEAD','OPTIONS'].includes(route.request().method())) {
    evidence.blockedWrites.push({url:route.request().url(), method:route.request().method()}); return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => evidence.pageErrors.push(error.message));
async function capture(name, url, selector) {
  console.log(`capture: ${name}`);
  if (url) await page.goto(base + url, {waitUntil:'domcontentloaded', timeout:45000});
  if (selector?.includes('完整提示词自由编辑')) await expect(page.locator(selector + ':visible').first()).toHaveValue(/35mm/, {timeout:25000});
  if (selector) { await page.locator(selector + ':visible').first().waitFor({state:'visible',timeout:25000}); await page.locator(selector + ':visible').first().scrollIntoViewIfNeeded(); }
  try { await page.waitForFunction(() => [...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&r.width>0&&e.getClientRects().length>0}).every(e=>e.complete), undefined, {timeout:20000}); } catch { /* Record unresolved states below. */ }
  await page.screenshot({path:`${dir}/${name}.png`});
  evidence.pages.push(await page.evaluate(({name})=>({name,url:location.href,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,title:document.title,
    canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    visibleImages:[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&r.width>0&&e.getClientRects().length>0}).map(e=>({src:e.currentSrc,width:e.naturalWidth,height:e.naturalHeight,complete:e.complete})),
    imageFailures:[...document.querySelectorAll('[role="status"], .case-image-retry')].map(e=>e.textContent).filter(x=>x?.includes('图片'))
  }),{name}));
}
try {
 await capture('home-1440','/','h1');
 await capture('library-1440','/image2-cases','.case-card');
 await capture('detail-1440','/image2-cases?case=30001','.case-detail');
 await capture('json-editor-1440','/image2-cases?case=youmind-YOUMI-15-156c9e3a','[aria-label="完整提示词自由编辑"]');
 await page.getByLabel('完整提示词自由编辑').fill('Visual acceptance saved plan. Keep 16:9 and 35mm.');
 await page.getByLabel('版本名称').fill('Visual acceptance version');
 await page.getByRole('button',{name:'保存命名版本',exact:true}).click();
 await capture('plans-1440','/image2-cases?view=plans','[aria-label="个人方案空间"]');
 await page.setViewportSize({width:390,height:844});
 await capture('home-390','/','h1');
 await capture('library-390','/image2-cases','.case-card');
 await capture('detail-390','/image2-cases?case=30001','[role="dialog"]');
 await page.goto(base + '/image2-cases?case=youmind-YOUMI-15-156c9e3a', {waitUntil:'domcontentloaded'});
 await expect(page.locator('[aria-label="完整提示词自由编辑"]:visible')).toHaveValue(/Visual acceptance|35mm/,{timeout:25000});
 await page.locator('button:visible').filter({hasText:/^恢复原文$/}).click();
 await expect(page.locator('[aria-label="完整提示词自由编辑"]:visible')).toHaveValue(/35mm/,{timeout:25000});
 await capture('json-editor-390',null,'[aria-label="完整提示词自由编辑"]');
 await page.getByRole('button',{name:'带入工作台 →',exact:true}).click();
 await capture('workbench-390',null,'[aria-label="从案例带入的提示词"]');
 await capture('plans-390','/image2-cases?view=plans','[aria-label="个人方案空间"]');
 await capture('standalone-390','/image2-cases/30001','h1');
 const index = await (await context.request.get(base+'/data/image2-case-library.index.json')).json();
 const textOnly = index.cases.find(x=>x.sourceId==='youart-25');
 await capture('text-only-390',`/image2-cases?case=${textOnly.detailKey}`,'[role="dialog"]');
} finally {
 await writeFile(`${dir}/evidence.json`,JSON.stringify(evidence,null,2),'utf8');
 await browser.close();
}
console.log(JSON.stringify({dir,samples:evidence.pages.length,overflows:evidence.pages.filter(x=>x.overflow).map(x=>x.name),pageErrors:evidence.pageErrors},null,2));