import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { jsonLeaves, editJsonLeaf, renderPrompt, mergePromptVersions } from '../lib/image2-prompt-engine';
import { taskSearchScore } from '../lib/image2-task-search';
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3013';
const key = 'youmind-YOUMI-15-156c9e3a';
const draftKey = 'image2-prompt-workbench:v1';
const sessionKey = 'image2-account-session:v1';
test.setTimeout(60000);
const source = async () => JSON.parse(await readFile('public/data/image2-case-library.json', 'utf8')).cases.find((x: any) => x.detailKey === 'youmind-15-156c9e3a');
async function offline(page: Page) {
  await page.route('**/api/image2/proxy?**', r => r.abort());
  await page.route('**/api/image2/assets', r => r.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'}));
  await page.route('**/api/image2', r => r.request().method() === 'GET' ? r.continue() : r.abort());
}
async function account(page: Page, id: string | null) {
  await page.evaluate(({id, key}) => {
    const value = id ? JSON.stringify({accessToken:'test-'+id,user:{id}}) : null;
    if(value) localStorage.setItem(key,value); else localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));
  },{id,key:sessionKey});
}

test('JSON scalar edits preserve untouched bytes and escaped variables keep valid JSON', async () => {
  const original = (await source()).prompt;
  const leaf = jsonLeaves(original).find(l => l.path === '/image_generation_prompt/subject/description')!;
  const changed = editJsonLeaf(original, leaf.path, 'A different subject "quoted"');
  expect(changed.slice(0,leaf.start)).toBe(original.slice(0,leaf.start));
  expect(changed.endsWith(original.slice(leaf.end))).toBe(true);
  expect(JSON.parse(changed).image_generation_prompt.composition.aspect_ratio).toBe('16:9');
  expect(changed).toContain('35mm'); expect(changed).toContain('Keep facial structure');
  expect(editJsonLeaf('{"n":1,"yes":true,"empty":null}','/n','bad')).toBe('{"n":1,"yes":true,"empty":null}');
  expect(JSON.parse(renderPrompt('{"value":"{name}"}',{'{name}':'a "b"\nc'})).value).toBe('a "b"\nc');
  const a={id:'same',name:'v',prompt:'one',note:'',createdAt:'2026-10-01'};
  expect(mergePromptVersions([a],[{...a,prompt:'two'}])).toHaveLength(2);
});

test('JSON editing, undo, diff, named versions and handoff preserve the full execution prompt', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']); await offline(page);
  await page.goto(`${base}/image2-cases?case=${key}`);
  const editor=page.getByLabel('完整提示词自由编辑'); const original=(await source()).prompt;
  await expect(editor).toHaveValue(original,{timeout:20000});
  await page.getByText(/按 JSON 字段编辑/).click();
  await page.getByLabel('JSON /image_generation_prompt/subject/description',{exact:true}).fill('Woman wearing a red scarf');
  const expected=editJsonLeaf(original,'/image_generation_prompt/subject/description','Woman wearing a red scarf');
  await expect(editor).toHaveValue(expected);
  await page.getByRole('button',{name:'撤销',exact:true}).click(); await expect(editor).toHaveValue(original);
  await page.getByRole('button',{name:'重做',exact:true}).click(); await expect(editor).toHaveValue(expected);
  await page.getByLabel('版本名称').fill('Scarf plan'); await page.getByRole('button',{name:'保存命名版本'}).click();
  await editor.fill(expected+'\n'); await page.getByLabel('版本名称').fill('Second plan'); await page.getByRole('button',{name:'保存命名版本'}).click();
  await page.reload(); await expect(editor).toHaveValue(expected+'\n');
  await page.getByRole('tab',{name:/命名版本/}).click(); await expect(page.getByRole('button',{name:'恢复版本',exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'恢复版本',exact:true}).nth(1).click(); await expect(editor).toHaveValue(expected);
  await page.getByRole('tab',{name:'修改差异',exact:true}).click(); await expect(page.locator('ins')).toContainText('red scarf');
  await page.getByRole('button',{name:'复制完整稿',exact:true}).click();
  expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(expected.trim());
  await page.getByRole('button',{name:'带入工作台 →',exact:true}).click();
  await expect(page.getByLabel('案例完整提示词')).toHaveValue(expected.trim());
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('image2-case-handoff:v1')!))).toMatchObject({caseKey:key,prompt:expected.trim(),provider:'McGrox',model:'gpt-image-2.5-sunburst'});
});

test('switching account immediately preserves last edit under original owner and resets undo',async({page})=>{
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  const editor=page.getByLabel('完整提示词自由编辑'); await expect(editor).toHaveValue(/35mm/,{timeout:20000});
  await account(page,'A-immediate'); await expect(editor).toHaveValue(/35mm/);
  await editor.fill('A last unsaved edit'); await account(page,'B-immediate');
  await expect(editor).toHaveValue(/35mm/); await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
  await editor.fill('B own edit'); await page.getByRole('button',{name:'撤销',exact:true}).click(); await expect(editor).not.toHaveValue('A last unsaved edit');
  await account(page,'A-immediate'); await expect(editor).toHaveValue('A last unsaved edit');
  const stored=await page.evaluate(k=>({a:localStorage.getItem(k+':account:A-immediate'),b:localStorage.getItem(k+':account:B-immediate')}),draftKey);
  expect(stored.a).toContain('A last unsaved edit'); expect(stored.b??'').not.toContain('A last unsaved edit');
});

test('full backup retains sixty generation records, versions, notes and collections; failure rolls back',async({page})=>{
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`); await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue(/35mm/,{timeout:20000});
  await page.getByLabel('完整提示词自由编辑').fill('Backup complete prompt'); await page.getByLabel('版本名称').fill('Saved backup plan'); await page.getByRole('button',{name:'保存命名版本'}).click();
  await page.evaluate(({key})=>{
    localStorage.setItem('image2-generation-history:v1',JSON.stringify(Array.from({length:60},(_,i)=>({id:'record-'+i,caseId:771915219,caseKey:key,caseTitle:'Backup case',prompt:'Execution '+i,createdAt:new Date(1700000000000+i*1000).toISOString(),images:[]}))));
    localStorage.setItem('image2-case-assets:v1',JSON.stringify({activeCollectionId:null,collections:[{id:'brand',name:'Brand project',caseKeys:[key],createdAt:'2026-10-01',updatedAt:'2026-10-01'}],notes:{[key]:{caseKey:key,note:'Brand note',updatedAt:'2026-10-01'}}}));
  },{key});
  await page.goto(`${base}/image2-cases?view=plans`);
  const download=page.waitForEvent('download'); await page.getByRole('button',{name:'导出完整备份'}).click();
  const saved=await download; const backup=JSON.parse(await readFile((await saved.path())!,'utf8'));
  expect(backup.generationHistory).toHaveLength(60); expect(backup.snapshot.promptDrafts[key].versions).toHaveLength(1); expect(backup.snapshot.notes[key].note).toBe('Brand note');
  await page.evaluate(()=>{for(const k of ['image2-generation-history:v1','image2-case-assets:v1','image2-prompt-workbench:v1'])localStorage.removeItem(k)});
  await page.reload(); await expect(page.getByRole('heading',{name:'我的方案',exact:true})).toBeVisible();
  await page.getByLabel('恢复完整备份').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByRole('region',{name:'个人方案空间'})).toContainText('备份已合并恢复');
  await page.reload(); await expect(page.getByRole('region',{name:'个人方案空间'})).toContainText('实际生成记录 · 60');
  const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))));
  await page.getByLabel('恢复完整备份').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,owner:'another-user'}))});
  await expect(page.getByRole('region',{name:'个人方案空间'})).toContainText('所属账号与当前账号不一致');
  expect(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))))).toBe(before);
  const modified=structuredClone(backup); modified.snapshot.favoriteCaseKeys=['failure-only'];
  await page.evaluate(()=>{const set=Storage.prototype.setItem; let failed=false; Storage.prototype.setItem=function(k,v){if(k==='image2-prompt-workbench:v1'&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return set.call(this,k,v)}});
  await page.getByLabel('恢复完整备份').setInputFiles({name:'quota.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(modified))});
  await expect(page.getByRole('region',{name:'个人方案空间'})).toContainText('quota');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('image2-generation-history:v1')!))).toHaveLength(60);
  expect(await page.evaluate(()=>localStorage.getItem('image2-case-favorites:v1') ?? '')).not.toContain('failure-only');
});

test('image retry changes request URL and recovers a real raster while retaining the prompt',async({page})=>{
  const seen:string[]=[]; const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVuoAAAAASUVORK5CYII=','base64');
  await page.route('**/api/image2/proxy?**',r=>{seen.push(r.request().url()); return r.request().url().includes('&retry=')?r.fulfill({status:200,contentType:'image/png',body:png}):r.fulfill({status:504,body:'timeout'})});
  await page.goto(`${base}/image2-cases?case=${key}`); await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue(/35mm/,{timeout:20000});
  const detail=page.locator('.case-detail'); const retry=detail.getByRole('button',{name:'重新加载图片',exact:true}).first(); await expect(retry).toBeVisible(); await retry.click();
  await expect.poll(()=>detail.locator('.case-image-shell img').first().evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
  expect(seen.some(s=>s.includes('&retry='))).toBe(true); await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue(/35mm/);
});

test('task retrieval aliases and URL search survive refresh and browser history',async({page})=>{
  expect(taskSearchScore('skincare product photography','帮我做一张护肤品电商主图')).not.toBeNull();
  expect(taskSearchScore('coffee poster','咖啡海报')).not.toBeNull();
  expect(taskSearchScore('watercolor portrait','咖啡海报')).toBeNull();
  await offline(page); await page.goto(`${base}/image2-cases`);
  const search=page.getByLabel('搜索案例'); await expect(page.locator('.case-card').first()).toBeVisible({timeout:20000});
  await search.fill('VR'); await expect(page).toHaveURL(/q=VR/); await expect(page.locator('.case-card').first()).toBeVisible();
  await page.reload(); await expect(search).toHaveValue('VR');
  await search.fill('咖啡海报'); await expect(page).toHaveURL(/q=/); await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('咖啡海报');
  await page.goBack(); await expect(search).toHaveValue('VR'); await page.goForward(); await expect(search).toHaveValue('咖啡海报');
});
test('real parallel tabs preserve both competing drafts without creating self-conflicts', async ({page,context}) => {
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  const editor=page.getByLabel('完整提示词自由编辑'); await expect(editor).toHaveValue(/35mm/,{timeout:20000});
  await editor.fill('Shared starting draft');
  await expect.poll(()=>page.evaluate(({draftKey,key})=>JSON.parse(localStorage.getItem(draftKey)??'{}')[key]?.prompt,{draftKey,key})).toBe('Shared starting draft');
  const second=await context.newPage(); await offline(second); await second.goto(`${base}/image2-cases?case=${key}`);
  const other=second.getByLabel('完整提示词自由编辑'); await expect(other).toHaveValue('Shared starting draft');
  await Promise.all([editor.fill('Parallel first complete prompt'),other.fill('Parallel second complete prompt')]);
  await expect(editor).toHaveValue('Parallel first complete prompt');
  await expect(other).toHaveValue('Parallel second complete prompt');
  await expect.poll(()=>page.evaluate(({draftKey,key})=>{
    const draft=JSON.parse(localStorage.getItem(draftKey)??'{}')[key]; return [draft?.prompt,...(draft?.versions??[]).map((v:any)=>v.prompt)];
  },{draftKey,key}),{timeout:15000}).toEqual(expect.arrayContaining(['Parallel first complete prompt','Parallel second complete prompt']));
  await page.getByLabel('版本名称').fill('First tab saved'); await page.getByRole('button',{name:'保存命名版本'}).click();
  await second.getByLabel('版本名称').fill('Second tab saved'); await second.getByRole('button',{name:'保存命名版本'}).click();
  await page.reload(); await page.getByRole('tab',{name:/命名版本/}).click();
  const saved=await page.evaluate(({draftKey,key})=>JSON.parse(localStorage.getItem(draftKey)??'{}')[key].versions,{draftKey,key});
  expect(saved.map((v:any)=>v.name)).toEqual(expect.arrayContaining(['First tab saved','Second tab saved']));
  expect(saved.map((v:any)=>v.prompt)).toEqual(expect.arrayContaining(['Parallel first complete prompt','Parallel second complete prompt']));
  await second.close();
});
test('named saves merge only the active owner versions and never import anonymous versions', async ({page}) => {
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  const editor=page.getByLabel('完整提示词自由编辑'); await expect(editor).toHaveValue(/35mm/,{timeout:20000});
  await editor.fill('Anonymous complete plan'); await page.getByLabel('版本名称').fill('Anonymous version');
  await page.getByRole('button',{name:'保存命名版本',exact:true}).click();
  await account(page,'named-owner'); await expect(editor).toHaveValue(/35mm/);
  await editor.fill('Account complete plan'); await page.getByLabel('版本名称').fill('Account version');
  await page.getByRole('button',{name:'保存命名版本',exact:true}).click();
  const stored=await page.evaluate(({key,draftKey})=>({
    anon:JSON.parse(localStorage.getItem(draftKey)??'{}')[key],
    own:JSON.parse(localStorage.getItem(draftKey+':account:named-owner')??'{}')[key]
  }),{key,draftKey});
  expect(stored.own.versions.map((v:any)=>v.name)).toEqual(['Account version']);
  expect(stored.anon.versions.map((v:any)=>v.name)).toEqual(['Anonymous version']);
  await account(page,null); await expect(editor).toHaveValue('Anonymous complete plan');
  await page.getByRole('tab',{name:/命名版本/}).click(); await expect(page.getByRole('button',{name:'恢复版本',exact:true})).toHaveCount(1);
});
test('top workbench entry carries the current complete plan for anonymous users', async ({page}) => {
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  const editor=page.getByLabel('完整提示词自由编辑'); await expect(editor).toHaveValue(/35mm/,{timeout:20000});
  await editor.fill('Anonymous full plan: keep 35mm, 16:9 and product identity.');
  await page.getByRole('button',{name:'带入当前方案',exact:true}).click();
  await expect(page).toHaveURL(/workbench\?from=case/);
  await expect(page.getByLabel('案例完整提示词')).toHaveValue('Anonymous full plan: keep 35mm, 16:9 and product identity.');
});
test('restore original waits for the lazy source prompt and preserves the complete JSON', async ({ page }) => {
  await offline(page);
  let releaseSource!: () => void;
  const held = new Promise<void>(resolve => { releaseSource = resolve; });
  await page.route('**/data/image2-cases/' + key + '.js?**', async route => { await held; await route.continue(); });
  await page.goto(`${base}/image2-cases?case=${key}`);
  const editor = page.getByLabel('完整提示词自由编辑');
  await expect(editor).toBeVisible({timeout:20000});
  await expect(page.getByRole('button', {name:'恢复原文',exact:true})).toBeDisabled();
  releaseSource();
  await expect(editor).toHaveValue(/35mm/,{timeout:20000});
  await expect(page.getByRole('button', {name:'恢复原文',exact:true})).toBeEnabled();
  const original = await editor.inputValue();
  await editor.fill('temporary edit');
  await page.getByRole('button', {name:'恢复原文',exact:true}).click();
  await expect(editor).toHaveValue(original);
  expect(original.length).toBeGreaterThan(2900);
});
test('stale concurrent storage snapshots retain both complete draft heads', async ({ page, context }) => {
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  const editor = page.getByLabel('完整提示词自由编辑');
  await expect(editor).toHaveValue(/35mm/, { timeout: 20000 });
  await editor.fill('Race shared baseline');
  await expect.poll(() => page.evaluate(({ draftKey, key }) => JSON.parse(localStorage.getItem(draftKey) ?? '{}')[key]?.prompt, { draftKey, key })).toBe('Race shared baseline');
  const second = await context.newPage(); await offline(second); await second.goto(`${base}/image2-cases?case=${key}`);
  const other = second.getByLabel('完整提示词自由编辑'); await expect(other).toHaveValue('Race shared baseline');
  for (const tab of [page, second]) await tab.evaluate(({ draftKey, key }) => {
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === draftKey && JSON.parse(value)[key]?.prompt?.startsWith('Race complete') && !(window as any).__heldDraft) {
        (window as any).__heldDraft = value; return;
      }
      return nativeSet.call(this, name, value);
    };
  }, { draftKey, key });
  await Promise.all([editor.fill('Race complete first prompt'), other.fill('Race complete second prompt')]);
  for (const tab of [page, second]) await expect.poll(() => tab.evaluate(() => Boolean((window as any).__heldDraft))).toBe(true);
  const firstWrite = await page.evaluate(() => (window as any).__heldDraft as string);
  const secondWrite = await second.evaluate(() => (window as any).__heldDraft as string);
  expect(JSON.parse(firstWrite)[key].versions ?? []).toHaveLength(0);
  expect(JSON.parse(secondWrite)[key].versions ?? []).toHaveLength(0);
  // A separate same-origin tab applies both stale read-modify-write snapshots in one task.
  // The first head is certainly overwritten before either editor can process storage events.
  const observer = await context.newPage(); await observer.goto(`${base}/robots.txt`);
  await observer.evaluate(({ draftKey, firstWrite, secondWrite }) => {
    localStorage.setItem(draftKey, firstWrite); localStorage.setItem(draftKey, secondWrite);
  }, { draftKey, firstWrite, secondWrite });
  await expect.poll(() => observer.evaluate(({ draftKey, key }) => {
    const draft = JSON.parse(localStorage.getItem(draftKey) ?? '{}')[key];
    return [draft?.prompt, ...(draft?.versions ?? []).map((row: any) => row.prompt)];
  }, { draftKey, key }), { timeout: 15000 }).toEqual(expect.arrayContaining(['Race complete first prompt', 'Race complete second prompt']));
  await expect(editor).toHaveValue('Race complete first prompt');
  await expect(other).toHaveValue('Race complete second prompt');
  await observer.close(); await second.close();
});
test('desktop history dialog traps keyboard focus and restores its trigger', async ({ page }) => {
  await offline(page); await page.goto(`${base}/image2-cases?case=${key}`);
  await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue(/35mm/, { timeout: 20000 });
  const trigger = page.getByRole('button', { name: /^生成历史/ });
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.locator('.case-history-modal-panel');
  const close = dialog.getByRole('button', { name: '关闭生成历史', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.getByLabel('搜索案例').evaluate((element: HTMLInputElement) => element.focus());
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile detail and nested image preview retain focus and return to the case card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await offline(page);
  await page.goto(`${base}/image2-cases?q=VR`);
  const card = page.locator('.case-card').filter({ hasText: /VR headset/i }).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.focus(); await page.keyboard.press('Enter');
  const detail = page.locator('.case-mobile-detail-panel');
  const close = detail.getByRole('button', { name: '关闭案例详情', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await detail.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  const image = detail.locator('button.case-detail-cover');
  await expect.poll(() => image.locator('img').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await image.focus(); await page.keyboard.press('Enter');
  const preview = page.locator('.case-image-preview-panel');
  const previewClose = preview.getByRole('button', { name: '关闭高清大图', exact: true });
  await expect(previewClose).toBeFocused();
  await page.keyboard.press('Tab'); await expect(previewClose).toBeFocused();
  await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
  await expect(image).toBeFocused();
  await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter'); await expect(close).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(detail).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.getByLabel('搜索案例').focus(); await expect(page.getByLabel('搜索案例')).toBeFocused();
});