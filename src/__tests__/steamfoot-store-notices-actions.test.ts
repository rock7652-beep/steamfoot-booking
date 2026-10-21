import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),active:vi.fn(),writeStore:vi.fn(),module:vi.fn(),permission:vi.fn(),raw:vi.fn(),exec:vi.fn(),transaction:vi.fn(),audit:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:m.raw,$transaction:m.transaction}}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.read,requireWritablePermission:m.write,checkPermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.active,resolveWriteStoreId:m.writeStore}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/server/services/operation-audit",()=>({recordOperationAudit:m.audit}));
import {loadSteamfootStoreNotices,markSteamfootStoreNotice,saveSteamfootNoticeSetting} from "@/server/actions/steamfoot-store-notices";
const tx={$queryRaw:m.raw,$executeRaw:m.exec};
const actor={id:"u",name:"店長",role:"OWNER",storeId:"s",staffId:"staff"};
const date=new Date('2030-01-11T02:00:00Z');
beforeEach(()=>{
 vi.resetAllMocks();m.read.mockResolvedValue(actor);m.write.mockResolvedValue(actor);m.active.mockResolvedValue('s');m.writeStore.mockResolvedValue('s');m.module.mockResolvedValue('steamfoot');m.permission.mockResolvedValue(true);m.transaction.mockImplementation(async run=>run(tx));m.raw.mockResolvedValue([]);
});
it('requires a staff read grant, current store and module before reading notices',async()=>{
 m.read.mockRejectedValueOnce(new Error('permission denied'));expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 expect(await loadSteamfootStoreNotices({storeId:'other',handled:false})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.module.mockResolvedValue('course');expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
});
it('uses default-on for missing settings and serializes safe paginated rows',async()=>{
 m.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'n',targetId:'b',kind:'MOVE',customerName:'顧客',courseName:'蒸足',coachName:'店長',startsAt:date,previousStartsAt:null,handledAt:null,createdAt:date,updatedAt:date,revision:0}]).mockResolvedValueOnce([{count:1}]);
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:true,enabled:true,count:1,canHandle:true,items:[{targetId:'b',startsAt:date.toISOString(),handledAt:null}]});
 expect(m.read).toHaveBeenCalledWith('booking.read');
 expect(m.raw.mock.calls[1][0].join('')).toContain('WHERE "storeId"=');
});
it('returns no customer snapshots when disabled',async()=>{
 m.raw.mockResolvedValueOnce([{enabled:false}]);expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:true,enabled:false,items:[],count:0,canHandle:false});expect(m.raw).toHaveBeenCalledTimes(1);
});
it('allows child-store reads with no handling controls',async()=>{
 m.read.mockResolvedValue({...actor,storeId:'parent'});expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:true,canHandle:false});expect(m.permission).not.toHaveBeenCalled();
});
it('requires a writable permission and resolved write store before mutations',async()=>{
 m.write.mockRejectedValueOnce(new Error('view mode'));expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:0})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.writeStore.mockResolvedValue('other');expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:false,previous:true})).toMatchObject({success:false});expect(m.exec).not.toHaveBeenCalled();
});
it('uses store and revision predicates and records handling audit without changing bookings',async()=>{
 m.raw.mockResolvedValueOnce([{id:'s'}]).mockResolvedValueOnce([{enabled:true}]).mockResolvedValueOnce([{id:'n',revision:3,handledAt:date,handledByName:'店長'}]);
 expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:2})).toMatchObject({success:true,data:{id:'n',revision:3,handledAt:date.toISOString()}});
 const sql=m.raw.mock.calls[2][0].join('');expect(sql).toContain('AND revision=');expect(sql).toContain('WHERE "storeId"=');expect(sql).not.toContain('"Booking"');expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({actorUserId:'u',storeId:'s',action:'HANDLE_NOTICE'}),tx);
});
it('rejects stale notice revisions and disabled-state changes before auditing',async()=>{
 expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:0})).toMatchObject({success:false});expect(m.audit).not.toHaveBeenCalled();
 m.raw.mockResolvedValueOnce([{id:'s'}]).mockResolvedValueOnce([{enabled:false}]);expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:0})).toMatchObject({success:false,error:'後台異動通知已關閉'});
});
it('disables the default-on setting with a version check and permission audit',async()=>{
 expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:false,previous:true})).toMatchObject({success:true,data:{enabled:false}});expect(m.write).toHaveBeenCalledWith('business_hours.manage');expect(m.exec).toHaveBeenCalledTimes(1);expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({before:{enabled:true},after:{enabled:false}}),tx);
});
it('preserves a newer setting and treats an already-saved retry as idempotent',async()=>{
 expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:false,previous:false})).toMatchObject({success:false});expect(m.exec).not.toHaveBeenCalled();
 expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:true,previous:false})).toMatchObject({success:true,data:{enabled:true}});expect(m.exec).not.toHaveBeenCalled();
});
it('rejects malformed payloads before any store or database access',async()=>{
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false,offset:-1})).toMatchObject({success:false});expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:-1})).toMatchObject({success:false});expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:'true',previous:false})).toMatchObject({success:false});expect(m.read).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});

it('reads only the scoped pending count for a closed bell, without snapshots or write permission checks',async()=>{
 m.raw.mockResolvedValueOnce([{enabled:true}]).mockResolvedValueOnce([{count:7}]);
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false,summaryOnly:true})).toMatchObject({success:true,items:[],count:7,canHandle:false});
 expect(m.raw).toHaveBeenCalledTimes(2);expect(m.raw.mock.calls[1][0].join('')).toContain('count(*)');expect(m.permission).not.toHaveBeenCalled();
});
