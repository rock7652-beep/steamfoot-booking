import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),feature:vi.fn(),core:vi.fn(),beauty:vi.fn(),customers:vi.fn(),messages:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.actor}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.core,customer:{findMany:m.customers},messageLog:{findMany:m.messages}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.beauty}}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn()}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:vi.fn()}));
import {listBeautyNotificationLogs} from '@/server/beauty/reminder-center';
const core=new PGlite(),beauty=new PGlite();
const query=(db:PGlite)=>async(first:TemplateStringsArray|{text:string;values:unknown[]},...values:unknown[])=>{
const sql=Array.isArray(first)?first.reduce((s,t,i)=>s+(i?'$'+i:'')+t,''):(first as {text:string}).text;
const args=Array.isArray(first)?values:(first as {values:unknown[]}).values;
return (await db.query(sql,args.map(v=>v instanceof Date?v.toISOString():v))).rows;
};
beforeAll(async()=>{await core.exec(`CREATE TABLE "Customer" (id text,"storeId" text,name text); CREATE TABLE "MessageTemplate" (id text,"storeId" text,name text); CREATE TABLE "MessageLog" (id text,"storeId" text,"customerId" text,"templateId" text,status text,"renderedBody" text,"errorMessage" text,"sentAt" timestamptz,"createdAt" timestamptz); CREATE TABLE "ManagerNotificationLog" (id text,"storeId" text,"recipientName" text,type text,status text,"renderedBody" text,"errorMessage" text,"sentAt" timestamptz,"createdAt" timestamptz);`);await beauty.exec(`CREATE TABLE "BeautyEvent" (id text,"storeId" text,kind text,status text,body text,"customerId" text,"createdAt" timestamptz,"userId" text);CREATE TABLE "BeautyTechnician" (id text,"storeId" text,"userId" text,name text);`);});
afterAll(async()=>{await core.close();await beauty.close();});
beforeEach(async()=>{vi.resetAllMocks();m.actor.mockResolvedValue({storeId:'store'});m.core.mockImplementation(query(core));m.beauty.mockImplementation(query(beauty));m.customers.mockResolvedValue([{id:'c',name:'測試顧客'}]);m.messages.mockResolvedValue([{id:'beauty:failed',errorMessage:'尚未綁定'}]);await core.exec(`TRUNCATE "ManagerNotificationLog","MessageLog","MessageTemplate","Customer"; INSERT INTO "Customer" VALUES ('c','store','測試顧客');INSERT INTO "ManagerNotificationLog" VALUES ('manager','store','店長','SAME_DAY_BOOKING_CREATED','SKIPPED','店務通知',NULL,NULL,'2026-10-22T01:00Z'),('foreign','other','外店店長','SECRET','SENT','不可見',NULL,NULL,'2026-10-22T01:00Z')`);await beauty.exec(`TRUNCATE "BeautyEvent","BeautyTechnician";INSERT INTO "BeautyEvent" (id,"storeId",kind,status,body,"customerId","createdAt") VALUES ('ok','store','BOOKED','SKIPPED','預約成立','c','2026-10-22T02:00Z'),('failed','store','REMINDER','FAILED','服務提醒','c','2026-10-21T16:00Z'),('audit','store','BOOKED','AUDIT','內部稽核','c','2026-10-22T03:00Z'),('foreign','other','BOOKED','SENT','不可見','c','2026-10-22T04:00Z');`);});
it('combines scoped existing manager logs and Beauty service events without requiring shared identity tables on Beauty connection',async()=>{const data=await listBeautyNotificationLogs({});expect(data.rows.map(r=>r.id)).toEqual(['event:ok','manager:manager','event:failed']);expect(data.rows[2].error).toBe('尚未綁定');expect(m.messages).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store',id:{in:['beauty:ok','beauty:failed']}}}));});
it('filters recipient/audience/status/type/date in the shared center without including audit rows',async()=>{const data=await listBeautyNotificationLogs({audience:'customer',status:'FAILED',type:'REMINDER',date:'2026-10-22',search:'測試'});expect(data.rows.map(r=>r.id)).toEqual(['event:failed']);});
it('uses bound search text and does not expand store visibility',async()=>{expect((await listBeautyNotificationLogs({search:"' OR true --"})).rows).toEqual([]);});
it('paginates a combined stream without duplicate/omitted rows',async()=>{await beauty.exec(`INSERT INTO "BeautyEvent" (id,"storeId",kind,status,body,"customerId","createdAt") SELECT 'extra-'||i,'store','BOOKED','SKIPPED','通知','c','2026-10-22T05:00Z'::timestamptz + i*interval '1 minute' FROM generate_series(1,35) i`);const a=await listBeautyNotificationLogs({}),b=await listBeautyNotificationLogs({page:'2'});expect(a.hasMore).toBe(true);expect(a.rows).toHaveLength(30);expect(b.rows).toHaveLength(8);expect(new Set([...a.rows,...b.rows].map(r=>r.id)).size).toBe(38);});
it('checks current permission/module and entitlement before any data read',async()=>{m.actor.mockRejectedValue(new Error('技師沒有後台設定權限'));await expect(listBeautyNotificationLogs({})).rejects.toThrow('沒有後台設定權限');expect(m.core).not.toHaveBeenCalled();expect(m.beauty).not.toHaveBeenCalled();});
it('rejects disabled LINE entitlement without reading events or customer names',async()=>{m.feature.mockRejectedValue(new Error('功能未開通'));await expect(listBeautyNotificationLogs({})).rejects.toThrow('未開通');expect(m.customers).not.toHaveBeenCalled();expect(m.beauty).not.toHaveBeenCalled();});

it('shows Beauty plan/care receipts from the shared MessageLog without a fake service event',async()=>{await core.exec(`INSERT INTO "MessageTemplate" VALUES ('tpl','store','美業方案到期提醒');INSERT INTO "MessageLog" VALUES ('beauty-care:one','store','c','tpl','SENT','方案到期',NULL,'2026-10-22T06:00Z','2026-10-22T05:00Z')`);const data=await listBeautyNotificationLogs({type:'美業方案到期提醒'});expect(data.rows).toHaveLength(1);expect(data.rows[0]).toMatchObject({type:'美業方案到期提醒',status:'SENT',audience:'customer'});});

it('separates technician notifications and safely displays skipped reasons without internal JSON',async()=>{
 await beauty.exec(`INSERT INTO "BeautyTechnician" VALUES ('tech','store','user','本店技師'),('foreign','other','user','外店技師');INSERT INTO "BeautyEvent" (id,"storeId",kind,status,body,"customerId","createdAt","userId") VALUES ('tech-notice','store','TECH_DIGEST','SKIPPED','技師須完成本店唯一會員與 LINE 綁定',NULL,'2026-10-22T07:00Z','user');`);
 const data=await listBeautyNotificationLogs({audience:'personnel'});
 expect(data.rows).toHaveLength(1);expect(data.rows[0]).toMatchObject({recipient:'本店技師',audience:'personnel',type:'TECH_DIGEST',body:'明日班表摘要',error:'技師須完成本店唯一會員與 LINE 綁定'});
});
