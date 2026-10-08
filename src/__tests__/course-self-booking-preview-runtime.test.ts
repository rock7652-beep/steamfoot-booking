import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COURSE_SELF_BOOKING_PREVIEW_BRANCH } from "../../scripts/course-self-booking-preview-scope.mjs";
const m=vi.hoisted(()=>({construct:vi.fn(),query:vi.fn()}));
vi.mock('@prisma/client',()=>({PrismaClient:class{constructor(){m.construct('main');}$queryRaw=m.query;}}));
vi.mock('../../generated/spa-client',()=>({PrismaClient:class{constructor(){m.construct('spa');}$queryRaw=m.query;}}));
vi.mock('../../generated/course-client',()=>({PrismaClient:class{constructor(){m.construct('course');}$queryRaw=m.query;}}));
vi.mock('@/lib/audit-db-context',()=>({withAuditDatabaseContext:(client:unknown)=>client}));
const direct='postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres';
const clients=[{key:'prisma',load:async()=>(await import('@/lib/db')).prisma},{key:'spaPrisma',load:async()=>(await import('@/lib/spa-db')).spaPrisma},{key:'coursePrisma',load:async()=>(await import('@/lib/course-db')).coursePrisma}];
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();for(const [key,value] of Object.entries({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:COURSE_SELF_BOOKING_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:direct,DIRECT_URL:direct,GUIDE_UI_PREVIEW:'',WORKERS_CI_BRANCH:'',CF_PAGES_BRANCH:'',CONSULTATION_HQ_ENABLED:'',CONSULTATION_PREVIEW_INTAKE_ENABLED:''}))vi.stubEnv(key,value);for(const client of clients)vi.stubGlobal(client.key,undefined);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each(clients)('rejects wrong isolated target before reading cache or constructing $key',async({key,load})=>{
 const read=vi.fn(()=>({$queryRaw:m.query}));Object.defineProperty(globalThis,key,{get:read,configurable:true});
 vi.stubEnv('DIRECT_URL',direct.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf'));
 await expect(load()).rejects.toThrow('existing isolated database');expect(read).not.toHaveBeenCalled();expect(m.construct).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
});
it.each(clients)('uses a freshly validated $key, never a cached client from another environment',async({key,load})=>{
 const cached={$queryRaw:m.query};vi.stubGlobal(key,cached);expect(await load()).not.toBe(cached);expect(m.construct).toHaveBeenCalledOnce();expect(m.query).not.toHaveBeenCalled();
});
it('blocks all external integrations on the actual deployed Preview mode',async()=>{expect((await import('@/lib/runtime-env')).isPreviewExternalIntegrationBlocked()).toBe(true);});
