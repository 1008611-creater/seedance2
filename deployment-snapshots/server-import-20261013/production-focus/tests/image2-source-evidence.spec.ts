import { test, expect } from '@playwright/test';
import { readFile, mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { taskSearchScore } from '../lib/image2-task-search';
const base=process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3013';
const library=async()=>JSON.parse(await readFile('public/data/image2-case-library.json','utf8'));
test.setTimeout(90000);

test('four-source evidence survives published details and ANS packs',async({request})=>{
 const all=(await library()).cases;
 for(const [title,terms] of [['Sketch Portrait Breaking Paper','CC0-1.0'],['E-commerce Main Image - Soft Studio Portrait With Pink Device','CC-BY-4.0']]) {
  const item=all.find((x:any)=>x.sourceId==='youart-25'&&x.title===title);
  expect(item.sourceRights.upstreamStatedTerms).toBe(terms); expect(item.imageStatus).toBe('text-only'); expect(item.imageRoles).toEqual([]);
  const index=JSON.parse(await readFile('public/data/image2-case-library.index.json','utf8'));
  const published=index.cases.find((x:any)=>x.id===item.id);
  const pack=await (await request.get(`${base}/api/integrations/ans/cases/${published.detailKey}`)).json();
  expect(pack.provenance.sourceRights).toEqual(item.sourceRights); expect(pack.provenance.sourceFile).toBe(item.sourceFile);
  expect(pack.provenance.sourceSnapshotHash).toBe(item.sourceSnapshotHash); expect(pack.prompt.original).toBe(item.prompt);
  expect(pack.provenance.sourceRights.rightsNotice).toContain('not a statement that the author licensed');
 }
 const color=all.find((x:any)=>x.sourceId==='zerolu'&&x.title==='Personal Color Analysis Diagram');
 expect(color.author).toContain('AngryTomtweets'); expect(color.sourceRecord.links).toHaveLength(2); expect(color.referenceRequired).toBe(true);
 for(const title of ['Polo Shirt Color Comparison Analysis','Hairstyle Comparison Analysis']) expect(all.find((x:any)=>x.sourceId==='zerolu'&&x.title===title).promptProvenance).toBe('upstream-reconstruction');
 for(const source of ['zerolu','youmind','evolink-commerce-25','youart-25']) {
  const rows=all.filter((x:any)=>x.sourceId===source&&x.sourceFile);
  expect(rows.length).toBeGreaterThan(50); expect(rows.every((x:any)=>x.sourceSnapshotHash&&x.upstreamRevision&&x.collectedAt&&x.modelEvidence?.tested===false)).toBe(true);
 }
 const chair=all.find((x:any)=>x.title==='Marketplace Listing Image Set · Solid Wood Dining Chair');
 const bottle=all.find((x:any)=>x.title==='Marketplace Listing Image Set · Sport Water Bottle');
 expect(chair.imageRoles.filter((x:any)=>x.role==='reference')).toHaveLength(1); expect(chair.imageRoles.filter((x:any)=>x.role==='output')).toHaveLength(7);
 expect(bottle.imageRoles.filter((x:any)=>x.role==='reference')).toHaveLength(1); expect(bottle.imageRoles.filter((x:any)=>x.role==='output')).toHaveLength(6);
 expect(chair.imageRoles.every((x:any)=>!bottle.imageRoles.some((y:any)=>y.url===x.url))).toBe(true);
});

test('repeated sync and changed source prompt retain public identity and unrelated data',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'image2-source-test-'));
 try {
  await mkdir(path.join(root,'tools'),{recursive:true}); await mkdir(path.join(root,'public/data'),{recursive:true});
  await cp('tools/sync-image2-source-adapters.mjs',path.join(root,'tools/sync-image2-source-adapters.mjs'));
  await cp('tools/lib',path.join(root,'tools/lib'),{recursive:true}); await cp('data/image2-sources',path.join(root,'data/image2-sources'),{recursive:true});
  await cp('public/data/image2-case-library.json',path.join(root,'public/data/image2-case-library.json'));
  const run=()=>JSON.parse(execFileSync(process.execPath,[path.join(root,'tools/sync-image2-source-adapters.mjs'),'--write'],{encoding:'utf8',maxBuffer:4e6}).split('\n数据文件')[0]);
  expect(run().importedAtPreserved).toBe(true);
  const before=JSON.parse(await readFile(path.join(root,'public/data/image2-case-library.json'),'utf8'));
  const item=before.cases.find((x:any)=>x.sourceId==='zerolu'&&x.title==='Personal Color Analysis Diagram');
  const sourcePath=path.join(root,'data/image2-sources',item.sourceId,item.sourceFile);
  const raw=await readFile(sourcePath,'utf8'); expect(raw).toContain(item.prompt);
  await writeFile(sourcePath,raw.replace(item.prompt,item.prompt+'\nPreserve the brand palette.'),'utf8');
  const changed=run(); expect(changed.perSource.zerolu.added).toBe(0); expect(changed.duplicateIds).toBe(0);
  const after=JSON.parse(await readFile(path.join(root,'public/data/image2-case-library.json'),'utf8'));
  const updated=after.cases.find((x:any)=>x.id===item.id);
  for(const field of ['id','detailKey','caseCode','stableKey']) expect(updated[field]).toBe(item[field]);
  expect(updated.prompt).toBe(item.prompt+'\nPreserve the brand palette.');
  expect(after.cases.filter((x:any)=>!['zerolu','youmind','evolink-commerce-25','youart-25'].includes(x.sourceId))).toEqual(before.cases.filter((x:any)=>!['zerolu','youmind','evolink-commerce-25','youart-25'].includes(x.sourceId)));
 } finally {await rm(root,{recursive:true,force:true});}
});

test('representative task queries retrieve intended cases in the first ten matches',async()=>{
 const rows=JSON.parse(await readFile('public/data/image2-case-library.index.json','utf8')).cases;
 const evaluation=[
 ['帮我做一张护肤品电商主图',/skincare|cosmetic|beauty/i],['咖啡海报',/coffee/i],['香水广告',/perfume|fragrance/i],
 ['VR 头显',/vr headset/i],['美甲',/nail/i],['水彩人像',/watercolo[u]?r/i],['线稿插画',/line.art/i],
 ['商品包装',/packag/i],['服装详情页',/fashion|apparel|dress|t.shirt/i],['参考照片人像',/portrait/i]
 ] as const;
 expect(taskSearchScore('YouTube thumbnail design','美甲')).toBeNull();
 const evidence=[];
 for(const [query,expected] of evaluation) {
  const matches=rows.map((x:any)=>({item:x,score:taskSearchScore([x.title,x.promptPreview,x.category,...(x.styleLabels??[])].join(' '),query,x.title+' '+x.category)})).filter((x:any)=>x.score!==null).sort((a:any,b:any)=>b.score-a.score).slice(0,10);
  evidence.push({query,results:matches.map((x:any)=>x.item.title)});
  expect(matches.some((x:any)=>expected.test(x.item.title+' '+x.item.promptPreview)),query).toBe(true);
 }
 await writeFile('output/refactor-search-evaluation.json',JSON.stringify(evidence,null,2),'utf8');
});