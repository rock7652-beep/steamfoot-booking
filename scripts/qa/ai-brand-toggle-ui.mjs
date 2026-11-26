// Real shared UI -> existing Brand core -> local PostgreSQL engine. No external service.
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBrandToggleFixture} from './ai-brand-toggle-fixture.mjs';
import {loadLocalBrandCore,openLocalBrandWorkspace} from './ai-brand-local-browser.mjs';
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'brand-toggle-')),out=process.env.AI_LOCAL_REPORT_DIR??path.join(root,'artifacts/ai-digital-butler/brand-toggle');mkdirSync(out,{recursive:true});
const f=await createBrandToggleFixture(),report={kind:'local shared workspace -> real Brand management core -> PostgreSQL engine with read-only-captured columns, RLS, ACL and both triggers; not cloud/HTTP/session acceptance',schema:await f.verifySchema(),baseline:f.baseline,cases:[],sizes:[],errors:[],failures:[]};
let sequence=Promise.resolve(),loseResponse=false,holdNext=false,signalCommit,releaseResponse,browser;
const queued=work=>{const pending=sequence.then(work);sequence=pending.catch(()=>{});return pending;};
const assert=(ok,name)=>{if(!ok)throw Error(name);};
try{
 const {brandManagement,brandManagementError}=await loadLocalBrandCore(root,temp);
 const env={AI_BRAND_PREVIEW_WRITE_OPERATIONS:'setting',AI_BRAND_PREVIEW_WRITE_UNTIL:f.end};
 const controller=()=>brandManagement({database:f.database,actor:f.actor,assertPreview:()=>{},secret:'offline-brand-toggle-only-identity-secret',env});
 await f.prepare();
 const snapshot=()=>queued(()=>f.runtime(()=>controller().snapshot()));
 const action=input=>queued(async()=>{try{const result=await f.runtime(()=>controller().saveSetting(input));if(loseResponse){loseResponse=false;throw Error('LOCAL_LOST_COMMIT_RESPONSE');}return result;}catch(e){if(e.message==='LOCAL_LOST_COMMIT_RESPONSE')throw e;return brandManagementError(e);}}).then(async result=>{if(holdNext){holdNext=false;signalCommit();await new Promise(resolve=>{releaseResponse=resolve;});}return result;});
 const opened=await openLocalBrandWorkspace({root,temp,snapshot,action:(name,input)=>{if(name!=='saveBrandSetting')throw Error('Out-of-scope action');return action(input);},onPageError:e=>report.errors.push(e.message)});browser=opened.browser;const page=opened.page;
 const on=()=>page.getByRole('button',{name:'開啟測試',exact:true}),off=()=>page.getByRole('button',{name:'關閉測試',exact:true});await on().waitFor();assert(await on().isDisabled(),'global stop did not disable UI');report.cases.push('global-stop-disables-enable');
 await queued(()=>f.db.exec('UPDATE "AiButlerControl" SET stopped=false'));await page.reload();await on().waitFor();
 async function checkState(enabled){const s=await snapshot();assert(s.setting.enabled===enabled,'database toggle mismatch');await(enabled?off():on()).waitFor();await page.getByText(new RegExp('品牌開關：'+(enabled?'開啟':'關閉'))).waitFor();return s;}
 for(const [width,height]of[[1920,1080],[1366,900],[1024,768],[768,1024],[390,844],[360,800]]){
  await page.setViewportSize({width,height});await on().click();await checkState(true);await page.reload();await checkState(true);await off().click();await checkState(false);await page.reload();await checkState(false);
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,touch:[...document.querySelectorAll('button,select')].filter(x=>x.getBoundingClientRect().height>0).every(x=>x.getBoundingClientRect().height>=44)}));assert(!state.overflow&&state.touch,'RWD failed');await page.screenshot({path:path.join(out,'toggle-'+width+'.png'),fullPage:true});report.sizes.push({width,height,enable:true,disable:true,reload:true,...state});
 }
 report.cases.push('six-width-open-close-database-and-reload');
 // A newer authoritative revision must update the mounted switch without remounting.
 let s=await snapshot();await queued(()=>f.runtime(()=>controller().saveSetting({setting:{...s.setting,enabled:true},revision:s.revision})));await page.evaluate(()=>window.refreshToggle());await checkState(true);await off().click();await checkState(false);report.cases.push('newer-authoritative-props-update-mounted-switch');
 let committed;const commitObserved=new Promise(resolve=>{committed=resolve;});signalCommit=committed;holdNext=true;await on().click();await commitObserved;
 s=await snapshot();await queued(()=>f.runtime(()=>controller().saveSetting({setting:{...s.setting,enabled:false},revision:s.revision})));await page.evaluate(()=>window.refreshToggle());releaseResponse();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='開啟測試'&&!b.disabled));await checkState(false);report.cases.push('late-action-cannot-overwrite-newer-authoritative-revision');
 s=await snapshot();const stale=await page.evaluate(input=>window.backendToggle(input),{setting:{...s.setting,enabled:true},revision:s.revision-1});assert(stale.success===false&&stale.error.includes('設定已更新，本次未儲存'),'stale conflict feedback unclear');await checkState(false);report.cases.push('stale-toggle-has-clear-conflict-feedback');


 await queued(()=>f.db.exec(`CREATE FUNCTION local_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LOCAL_AUDIT_APPEND_FAULT'; END $$;CREATE TRIGGER zz_local_audit_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION local_audit_fault();`));
 const beforeFailure=await queued(async()=>({setting:(await f.db.query('SELECT * FROM "AiBrandSetting"')).rows,audit:(await f.db.query('SELECT * FROM "AuditLog"')).rows}));await on().click();await page.getByRole('alert').waitFor();await checkState(false);
 const afterFailure=await queued(async()=>({setting:(await f.db.query('SELECT * FROM "AiBrandSetting"')).rows,audit:(await f.db.query('SELECT * FROM "AuditLog"')).rows}));assert(JSON.stringify(beforeFailure)===JSON.stringify(afterFailure),'partial mutation after audit failure');await page.screenshot({path:path.join(out,'audit-failure.png'),fullPage:true});report.cases.push('real-audit-trigger-failure-rolls-back-setting-and-audit');await queued(()=>f.db.exec('DROP TRIGGER zz_local_audit_fault ON "AuditLog";DROP FUNCTION local_audit_fault();'));
 await queued(()=>f.db.exec(`REVOKE EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) FROM ${f.role}`));await on().click();await page.getByRole('alert').filter({hasText:'安全稽核尚未就緒'}).waitFor();await checkState(false);report.cases.push('missing-helper-clear-error-no-write');await queued(()=>f.db.exec(`GRANT EXECUTE ON FUNCTION public.redact_audit_json(jsonb,integer) TO ${f.role}`));
 loseResponse=true;await on().click();await page.getByRole('alert').filter({hasText:'連線中斷'}).waitFor();assert((await snapshot()).setting.enabled,'lost response did not commit in rehearsal');await page.reload();await checkState(true);report.cases.push('lost-commit-response-reload-reconciles-authoritative-state');
 await queued(()=>f.db.exec('UPDATE "AiButlerControl" SET stopped=true'));await page.reload();await checkState(true);await off().click();await checkState(false);assert(await on().isDisabled(),'stop missing after emergency off');report.cases.push('emergency-stop-still-allows-disable');
 const ledger=await queued(async()=>({audits:(await f.db.query('SELECT "actorUserId","actorRoleSnapshot","loginRecordId","storeId","beforeJson","afterJson" FROM "AuditLog" ORDER BY "createdAt",id')).rows,stores:(await f.db.query('SELECT * FROM "AiButlerSetting" ORDER BY "storeId"')).rows,requests:(await f.db.query('SELECT count(*)::int n FROM "AiBrandRequest"')).rows[0].n}));assert(ledger.audits.every(a=>a.beforeJson.settingRevision+1===a.afterJson.state.settingRevision&&a.beforeJson.enabled!==a.afterJson.state.enabled&&a.actorUserId===f.uid&&a.actorRoleSnapshot==='ADMIN'&&a.loginRecordId==='local-brand-login'&&a.storeId===null),'audit scope/link mismatch');assert(JSON.stringify(ledger.stores)===JSON.stringify(f.initialStores),'Store altered');assert(ledger.requests===0,'provider request created');report.audit=ledger.audits;report.fourStoresUnchanged=true;report.mockRequests=0;report.openAiRequests=0;assert(report.errors.length===0,'browser error');
}catch(e){report.failures.push(e.message.split('\n')[0]);process.exitCode=1;}finally{await sequence;await browser?.close();await f.db.close();rmSync(temp,{recursive:true,force:true});writeFileSync(path.join(out,'local-toggle.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.cases,sizes:report.sizes.length,failures:report.failures}));}
