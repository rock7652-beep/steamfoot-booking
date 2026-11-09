// Localhost only: real UI + server-action SQL, synthetic authorization/audit + PGlite.
// No production credentials, application HTTP routes, migrations, or external messages.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {Prisma} from '@prisma/client';
import {PGlite} from '@electric-sql/pglite';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out=process.env.QA_OUTPUT??'/tmp/store-notices-speed';mkdirSync(out,{recursive:true});
const ordinary=process.env.QA_SOURCE==='ordinary';
const db=new PGlite(),sqlScope=new AsyncLocalStorage();
async function tagged(connection,strings,values){const started=performance.now(),query=Prisma.sql(strings,...values),sql=query.text;try{return await connection.query(sql,query.values);}finally{sqlScope.getStore()?.push({operation:sql.trim().split(/\s+/)[0],ms:performance.now()-started});}}
function client(connection){return {
 $queryRaw:async(strings,...values)=>(await tagged(connection,strings,values)).rows,
 $executeRaw:async(strings,...values)=>(await tagged(connection,strings,values)).affectedRows??0,
 $transaction:async fn=>db.transaction(tx=>fn(client(tx))),
 courseStoreNotice:{
  findFirst:async({where})=>(await connection.query('SELECT * FROM "CourseStoreNotice" WHERE id=$1 AND "storeId"=$2',[where.id,where.storeId])).rows[0]??null,
  update:async({where,data})=>(await connection.query('UPDATE "CourseStoreNotice" SET "readAt"=$2,"readById"=$3,"readByName"=$4,revision=revision+1 WHERE id=$1 RETURNING *',[where.id,data.readAt,data.readById,data.readByName])).rows[0],
 }
};}
const actor={id:'qa-user',name:'合成人員',role:'OWNER',storeId:'qa',staffId:'qa-staff'};
globalThis.__noticeSpeed={db:client(db),actor,
 transaction:async fn=>db.transaction(async connection=>{const tx=client(connection);await tx.$queryRaw`SELECT id FROM "Store" WHERE id='qa' FOR UPDATE`;return fn(tx);}),
 audit:async tx=>tx.$executeRaw`INSERT INTO "QaAudit" (at) VALUES (now())`,
 receivables:async(tx,storeId,_industry,now)=>{await tx.$queryRaw`SELECT id,"eventKey" FROM "DigitalManagerNotice" WHERE "storeId"=${storeId} AND "eventType"='OUTSTANDING_PAYMENT' AND "handledAt" IS NULL AND "publishedAt">${new Date(+now-10*86400000)} AND "publishedAt"<=${now}`;return new Map();}
};
await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES ('qa');CREATE TABLE "QaAudit"(at timestamptz);
CREATE TABLE "SteamfootStoreNotice"(id text PRIMARY KEY,"storeId" text,"bookingId" text,kind text,"customerName" text,"serviceName" text,"staffName" text,"previousStaffName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int DEFAULT 1,details jsonb DEFAULT '{}',"readAt" timestamptz,"readById" text,"readByName" text,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),"publishedAt" timestamptz DEFAULT now());
CREATE TABLE "CourseStoreNotice"(LIKE "SteamfootStoreNotice" INCLUDING ALL);ALTER TABLE "CourseStoreNotice" RENAME "bookingId" TO "subjectKey";ALTER TABLE "CourseStoreNotice" RENAME "serviceName" TO "courseName";ALTER TABLE "CourseStoreNotice" RENAME "staffName" TO "coachName";ALTER TABLE "CourseStoreNotice" RENAME "previousStaffName" TO "previousCoachName";
CREATE TABLE "DigitalManagerNotice"(id text PRIMARY KEY,"storeId" text,"eventKey" text,"eventType" text,"targetId" text,"readAt" timestamptz,"readById" text,"readByName" text,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),"publishedAt" timestamptz DEFAULT now());`);
for(const t of ['SteamfootStoreNotice','CourseStoreNotice','DigitalManagerNotice'])await db.exec(`CREATE INDEX ON "${t}"("storeId","publishedAt" DESC,id DESC);CREATE INDEX ON "${t}"("storeId","publishedAt" DESC) WHERE "readAt" IS NULL;`);
const stub='\0notice-speed:';
const mocks={
 '@/lib/db':`export const prisma=g.db;`,
 '@/lib/course-db':`export const coursePrisma=g.db;`,
 '@/lib/beauty-db':`export const beautyPrisma=g.db;`,
 '@/lib/permissions':`export const requirePermission=async()=>g.actor,requireWritablePermission=requirePermission,checkPermission=async()=>true;`,
 '@/lib/store':`export const getActiveStoreForRead=async()=>'qa',resolveWriteStoreId=getActiveStoreForRead;`,
 '@/lib/industry-module-server':`export const getStoreIndustryModule=async()=>'steamfoot';`,
 '@/lib/session':`export const getCurrentUser=async()=>g.actor;`,
 '@/lib/feature-gate':`export const hasStoreFeature=async()=>true;`,
 '@/lib/store-view-context-server':`export const resolveStoreViewContextFromCookie=async()=>null;`,
 '@/lib/store-read-only':`export const isReadOnlyStoreTarget=()=>false;`,
 '@/server/services/operation-audit':`export const recordOperationAudit=async(_input,tx)=>g.audit(tx);`,
 '@/server/services/operation-audit-outbox':`export const enqueueOperationAudit=async(_input,tx)=>g.audit(tx);`,
 '@/server/services/course-access':`export const courseManagerRead=async()=>({storeId:'qa',user:g.actor,isChildStoreView:false}),courseManager=courseManagerRead,courseTransaction=async(_store,fn)=>g.transaction(fn);`,
 '@/server/beauty/access':`export const beautyManager=async()=>({storeId:'qa',userId:g.actor.id,name:g.actor.name,manager:true}),beautyTransaction=async(_actor,fn)=>g.transaction(fn),audit=async(tx)=>g.audit(tx);`,
 '@/server/services/store-receivable-notices':`export const readReceivableNoticeState=g.receivables;`,
 'server-only':``,
 'next/navigation':`export const useRouter=()=>({refresh(){},replace(){}}),usePathname=()=>'/dashboard',useSearchParams=()=>new URLSearchParams(),unstable_rethrow=e=>{throw e};`,
 'next/link':`import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,...p}){return React.createElement('a',p,children);}`,
};
const modules={steamfoot:null,course:null,beauty:null};let courseIndividual;
async function actions(namespace){
 if(modules[namespace])return modules[namespace];
 const file=namespace==='course'?'course-digital-manager-notices':namespace+'-store-notices';
 modules[namespace]=await server.ssrLoadModule(`/src/server/actions/${file}.ts`);
 if(namespace==='course')courseIndividual=await server.ssrLoadModule('/src/server/actions/course-store-notices.ts');
 return modules[namespace];
}
async function seed(namespace,size){
 await db.exec('TRUNCATE "SteamfootStoreNotice","CourseStoreNotice","DigitalManagerNotice","QaAudit"');
 const sourceSize=Math.ceil(size/2),digitalSize=size-sourceSize,table=namespace==='steamfoot'?'SteamfootStoreNotice':'CourseStoreNotice',key=namespace==='steamfoot'?'bookingId':'subjectKey',service=namespace==='steamfoot'?'serviceName':'courseName',staff=namespace==='steamfoot'?'staffName':'coachName';
 await db.query(`INSERT INTO "${table}" (id,"storeId","${key}",kind,"customerName","${service}","${staff}","startsAt","publishedAt") SELECT 'z-'||lpad(n::text,6,'0'),'qa',$2||n,'MOVE','合成顧客'||n,'合成服務','合成人員',now(),now()-interval '1 minute' FROM generate_series(1,$1::int) n`,[sourceSize,namespace==='beauty'?'beauty:':'booking:']);
 await db.query(`INSERT INTO "DigitalManagerNotice"(id,"storeId","eventKey","eventType","targetId","publishedAt") SELECT 'd-'||lpad(n::text,6,'0'),'qa','digital-butler-lead:'||n,'DIGITAL_BUTLER_LEAD_CREATED','lead-'||n,now()-interval '1 minute' FROM generate_series(1,$1::int) n`,[digitalSize]);
 if(ordinary)await db.exec(`UPDATE "DigitalManagerNotice" SET "publishedAt"="publishedAt"-interval '1 minute'`);
 await db.exec(`ANALYZE "${table}";ANALYZE "DigitalManagerNotice"`);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=await createServer({root,configFile:false,define:{'process.env.NEXT_PUBLIC_BUILD_ENV':JSON.stringify('test')},cacheDir:'/tmp/notice-speed-vite-cache',optimizeDeps:{include:['react','react-dom','react-dom/client']},plugins:[react(),{
 name:'isolated-notice-speed',resolveId(id){if(id.startsWith(stub))return id;if(Object.hasOwn(mocks,id))return stub+id;},
 load(id){if(id.startsWith(stub))return `const g=globalThis.__noticeSpeed;${mocks[id.slice(stub.length)]}`;},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/scripts/qa/store-notices-speed-fixture.tsx"></script></body></html>'));return;}
  if(!req.url?.startsWith('/qa/'))return next();
  try{
   let raw='';for await(const chunk of req)raw+=chunk;const {namespace,size,delay,input}=JSON.parse(raw),op=req.url.slice(4);
   if(!['steamfoot','course','beauty'].includes(namespace)||![50,5000].includes(size)||![0,300].includes(delay))throw Error('Invalid synthetic scope');
   res.setHeader('Content-Type','application/json');if(op==='reset'){await seed(namespace,size);res.end(JSON.stringify({result:{success:true}}));return;}
   await sleep(delay/2);const a=await actions(namespace),started=performance.now(),spans=[];let result;await sqlScope.run(spans,async()=>{
   if(op==='read')result=await a[namespace==='course'?'loadCombinedCourseStoreNotices':namespace==='beauty'?'loadBeautyStoreNotices':'loadSteamfootStoreNotices'](input);
   else if(op==='all')result=await a[namespace==='course'?'markAllCourseStoreNotices':namespace==='beauty'?'markAllBeautyStoreNotices':'markAllSteamfootStoreNotices'](input);
   else if(op==='mark'){
    if(namespace==='course'){
     if(input.id.startsWith('digital:')){result=await a.markCourseDigitalManagerNotice({...input,id:input.id.slice(8)});if(result.success)result.data.id='digital:'+result.data.id;}
     else result=await courseIndividual.markCourseStoreNotice(input);
    }else result=await a[namespace==='beauty'?'markBeautyStoreNotice':'markSteamfootStoreNotice'](input);
   }else throw Error('Invalid operation');});
   const stats={ms:performance.now()-started,sql:spans};await sleep(delay/2);res.end(JSON.stringify({result,server:stats}));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
 });}
}],resolve:{alias:[...Object.keys(mocks).map(find=>({find,replacement:stub+find})),{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();const port=server.httpServer.address().port;let browser;const samples=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
 let cases=0;
 for(const namespace of ['steamfoot','course','beauty'])for(const size of (ordinary?[5000]:[50,5000]))for(const delay of (ordinary?[300]:[0,300]))for(const [width,height] of (ordinary?[[1366,900]]:[[1366,900],[1024,768]])){
  if(process.env.QA_LIMIT_CASES&&cases++>=Number(process.env.QA_LIMIT_CASES))continue;
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?module=${namespace}&size=${size}&delay=${delay}`);
  for(const action of ['mark','all'])for(let run=0;run<Number(process.env.QA_RUNS??6);run++){
   await page.evaluate(()=>window.__speedReset());
   await page.getByRole('button',{name:`數位店長｜門市提醒，${size} 筆未讀`}).click();
   await page.getByRole('button',{name:'全部標為已讀',exact:true}).waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelectorAll('button[aria-label^="標為已讀："]').length>0);
   const sample=await page.evaluate(async({action,size})=>{
    window.__speedCalls=[];
    const circle=document.querySelector('button[aria-label^="標為已讀："]'),bulk=[...document.querySelectorAll('button')].find(b=>b.textContent==='全部標為已讀'),bell=document.querySelector('button[title="數位店長｜門市提醒"]');
    const start=performance.now(),targetId=window.__speedTargetId;let feedback,visible,saved,latestGone,historyStarted,historyVisible,frames=0;
    return new Promise((resolve,reject)=>{
     const deadline=setTimeout(()=>reject(Error('Performance operation timed out')),12000);
     (action==='mark'?circle:bulk).click();
     function tick(){
      const now=performance.now(),calls=window.__speedCalls,write=calls.find(c=>c.operation===action),read=calls.find(c=>c.operation==='read'&&write?.end&&c.start>=write.end);
      if(feedback===undefined&&(action==='mark'?!circle.isConnected||circle.getAttribute('aria-pressed')==='true':bulk.textContent==='處理中…'))feedback=now-start;
      if(visible===undefined&&(!circle.isConnected||circle.getAttribute('aria-pressed')==='true')&&bell.getAttribute('aria-label').includes(`${action==='mark'?size-1:0} 筆未讀`))visible=now-start;
      if(latestGone===undefined&&!circle.isConnected)latestGone=now-start;
      if(saved===undefined&&write?.end&&visible!==undefined&&(action==='all'?bulk.textContent!=='處理中…':[...document.querySelectorAll('button')].some(b=>b.textContent==='復原')))saved=now-start;
      if(saved!==undefined&&latestGone!==undefined&&historyStarted===undefined){const tab=[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent==='歷史訊息');if(!tab.disabled){historyStarted=now-start;tab.click();}}
      const historical=calls.find(c=>c.operation==='read'&&c.history&&c.end&&c.ids?.includes(targetId));
      if(historyStarted!==undefined&&historical&&document.querySelector('[role=tab][aria-selected=true]')?.textContent==='歷史訊息'&&document.querySelector('button[aria-pressed=true]'))historyVisible??=now-start;
      if(historyVisible!==undefined&&calls.every(c=>c.end)){if(++frames>=2){clearTimeout(deadline);resolve({feedbackMs:feedback,visibleMs:visible,savedMs:saved,latestGoneMs:latestGone,historyConfirmedMs:historyVisible,historyTabLoadMs:historyVisible-historyStarted,reconciledMs:now-start,requests:calls});return;}}
      requestAnimationFrame(tick);
     }requestAnimationFrame(tick);
    });
   },{action,size});
   const rows=(await db.query(`SELECT (SELECT count(*) FROM "SteamfootStoreNotice" WHERE "readAt" IS NOT NULL)+(SELECT count(*) FROM "CourseStoreNotice" WHERE "readAt" IS NOT NULL)+(SELECT count(*) FROM "DigitalManagerNotice" WHERE "readAt" IS NOT NULL) AS count`)).rows[0].count;
   if(Number(rows)!==(action==='mark'?1:size))throw Error('Read state verification failed');
   if(sample.requests.length!==3||sample.requests.some(c=>!c.end))throw Error('Unexpected request count');
   samples.push({namespace,size,delay,width,height,action,run,source:ordinary?'ordinary':'digital',first:run===0,...sample});
  }
  if(errors.length)throw Error(errors.join(';'));await page.close();
  writeFileSync(path.join(out,'samples.json'),JSON.stringify(samples,null,2));console.log(JSON.stringify({completedCases:samples.length/(2*Number(process.env.QA_RUNS??6)),totalCases:ordinary?3:Math.min(24,Number(process.env.QA_LIMIT_CASES??24))}));
 }
 const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;};
 const summary=[];
 for(const key of [...new Set(samples.map(s=>JSON.stringify([s.namespace,s.size,s.delay,s.width,s.action])))]){
  const group=samples.filter(s=>JSON.stringify([s.namespace,s.size,s.delay,s.width,s.action])===key),warm=group.filter(s=>!s.first),stats={};
  for(const field of ['feedbackMs','visibleMs','savedMs','latestGoneMs','historyConfirmedMs','historyTabLoadMs','reconciledMs']){const values=warm.map(s=>s[field]).filter(v=>v!==undefined);stats[field]={first:group[0][field],median:median(values),min:Math.min(...values),max:Math.max(...values)};}
  summary.push({namespace:group[0].namespace,size:group[0].size,delay:group[0].delay,width:group[0].width,action:group[0].action,runs:group.length,stats});
 }
 const version={kind:'synthetic localhost benchmark, not live-site latency',scope:'real component and server actions; synthetic auth, audit insert, empty receivables; localhost HTTP and PGlite; added 0/300 ms per request',files:Object.fromEntries(['src/components/admin/store-notice-bell.tsx','src/server/actions/steamfoot-store-notices.ts','src/server/actions/course-digital-manager-notices.ts','src/server/actions/beauty-store-notices.ts'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
 writeFileSync(path.join(out,'summary.json'),JSON.stringify({version,samples:samples.length,summary},null,2));
}finally{await browser?.close();await server.close();await db.close();delete globalThis.__noticeSpeed;}
