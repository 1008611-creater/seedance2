import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const base = process.env.IMAGE2_VERIFY_BASE ?? 'https://image2.cauai.fun';
const expectedIndex = '94ad47559bf557751ea6d7f4dabef0eaa8d712df02bc67ce6eda8b8a3bc54120';
const version = '20261007-paired-assets-v3';
const evidence = { base, sampledAt:new Date().toISOString(), checks:[], limitations:['No generation, upload or paid request','No real account login or cloud synchronization credentials'] };
async function get(path, status=200) {
 const response=await fetch(base+path,{signal:AbortSignal.timeout(45000),redirect:'follow'});
 const bytes=Buffer.from(await response.arrayBuffer());
 evidence.checks.push({path,status:response.status,url:response.url,contentType:response.headers.get('content-type'),cache:response.headers.get('cf-cache-status'),bytes:bytes.length});
 assert.equal(response.status,status,path); return {response, bytes,text:bytes.toString('utf8')};
}
try {
 for (const path of ['/','/image2-cases','/workbench','/image2-cases?case=30001','/image2-cases?case=youmind-YOUMI-15-156c9e3a']) {
  const {text}=await get(path); assert.match(text,/<html/); assert.match(text,/<title>/);
 }
 const {bytes}=await get('/data/image2-case-library.index.json?v='+version);
 evidence.indexSha256=createHash('sha256').update(bytes).digest('hex');assert.equal(evidence.indexSha256,expectedIndex);
 const index=JSON.parse(bytes.toString('utf8')); assert.equal(index.cases.length,1620);
 evidence.publishedCases=index.cases.length;evidence.perSource=Object.fromEntries(['zerolu','youmind','evolink-commerce-25','youart-25'].map(id=>[id,index.cases.filter(x=>x.sourceId===id).length]));
 assert.deepEqual(evidence.perSource,{'zerolu':72,'youmind':128,'evolink-commerce-25':83,'youart-25':150});
 const canonicalKey='youmind-YOUMI-1-0a8d3b89';
 for(const key of ['30001',canonicalKey]) {
  const {text}=await get('/image2-cases/'+key);assert.ok(text.includes('href="'+base+'/image2-cases/'+canonicalKey+'"'));assert.match(text,/property="og:url"/);
 }
 const {text:robots}=await get('/robots.txt');assert.ok(robots.includes(base+'/sitemap.xml'));
 const {text:sitemap}=await get('/sitemap.xml');assert.ok(sitemap.includes(base+'/image2-cases/'+canonicalKey));evidence.sitemapEntries=(sitemap.match(/<loc>/g)??[]).length;
 const {text:catalog}=await get('/api/integrations/ans/catalog?limit=2');assert.equal(JSON.parse(catalog).schemaVersion,'ans.image2-catalog.v1');
 const {text:packText}=await get('/api/integrations/ans/cases/'+canonicalKey);const pack=JSON.parse(packText);assert.match(pack.prompt.original,/VR headset/);assert.equal(pack.importBehavior.executeGeneration,false);assert.equal(pack.generationPreference.verified,false);
 const {text:detailJs}=await get('/data/image2-cases/youmind-YOUMI-15-156c9e3a.js?v='+version);assert.match(detailJs,/35mm/);
 const image=await get('/image2/hero/case-30001-vr.jpg');assert.match(image.response.headers.get('content-type'),/^image\//);assert.ok(image.bytes.length>1000);
 const callback=await get('/auth/callback');assert.match(callback.text,/<html/);evidence.callbackBoundary='Missing-code callback loads; actual authentication not verified';
 await get('/api/image2/assets',503);
 evidence.result='passed';
} catch(error) {evidence.result='failed';evidence.failure=error.stack;process.exitCode=1;}
await writeFile('output/refactor-production-http.json',JSON.stringify(evidence,null,2),'utf8');
console.log(JSON.stringify(evidence,null,2));