import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),active:vi.fn(),writeStore:vi.fn(),module:vi.fn(),permission:vi.fn(),raw:vi.fn(),exec:vi.fn(),transaction:vi.fn(),audit:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:m.raw,$transaction:m.transaction}}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.read,requireWritablePermission:m.write,checkPermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.active,resolveWriteStoreId:m.writeStore}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/server/services/operation-audit",()=>({recordOperationAudit:m.audit}));
import {loadSteamfootStoreNotices,markSteamfootStoreNotice,saveSteamfootNoticeSetting,loadSteamfootVipNoticeTarget,loadSteamfootReminderTarget} from "@/server/actions/steamfoot-store-notices";
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
it('resolves a VIP target only for an authorized current-store reader',async()=>{
 expect(await loadSteamfootVipNoticeTarget({storeId:'other',id:'digital:n'})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.permission.mockResolvedValueOnce(false);expect(await loadSteamfootVipNoticeTarget({storeId:'s',id:'digital:n'})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.raw.mockResolvedValueOnce([{id:'customer'}]);expect(await loadSteamfootVipNoticeTarget({storeId:'s',id:'digital:n'})).toMatchObject({success:true,data:{id:'customer'}});
 expect(m.raw.mock.calls[0][0].join('')).toContain('c."storeId"=n."storeId"');
});
it('resolves an incomplete reminder through its saved same-store booking',async()=>{
 expect(await loadSteamfootReminderTarget({storeId:'other',id:'digital:n'})).toMatchObject({success:false});expect(m.raw).not.toHaveBeenCalled();
 m.raw.mockResolvedValueOnce([{id:'booking'}]);expect(await loadSteamfootReminderTarget({storeId:'s',id:'digital:n'})).toMatchObject({success:true,data:{id:'booking'}});
 expect(m.raw.mock.calls[0][0].join('')).toContain('b."storeId"=n."storeId"');
});
it('serializes store-scoped paginated rows independently of the legacy setting',async()=>{
 m.raw.mockResolvedValueOnce([{id:'n',targetId:'b',kind:'MOVE',customerName:'顧客',courseName:'蒸足',coachName:'店長',startsAt:date,previousStartsAt:null,handledAt:null,createdAt:date,updatedAt:date,revision:0}]).mockResolvedValueOnce([{count:1}]);
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:true,enabled:true,count:1,canHandle:true,items:[{targetId:'b',startsAt:date.toISOString(),handledAt:null}]});
 expect(m.read).toHaveBeenCalledWith('booking.read');
 expect(m.raw.mock.calls[0][0].join('')).toContain('WHERE "storeId"=');
});
it('allows child-store reads with no handling controls',async()=>{
 m.read.mockResolvedValue({...actor,storeId:'parent'});expect(await loadSteamfootStoreNotices({storeId:'s',handled:false})).toMatchObject({success:true,canHandle:false});expect(m.permission).not.toHaveBeenCalled();
});
it('requires a writable permission and resolved write store before mutations',async()=>{
 m.write.mockRejectedValueOnce(new Error('view mode'));expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:0})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.writeStore.mockResolvedValue('other');expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:false,previous:true})).toMatchObject({success:false});expect(m.exec).not.toHaveBeenCalled();
});
it('uses store and revision predicates and records handling audit without changing bookings',async()=>{
 m.raw.mockResolvedValueOnce([{id:'s'}]).mockResolvedValueOnce([{id:'n',revision:3,handledAt:date,handledByName:'店長'}]);
 expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:2})).toMatchObject({success:true,data:{id:'n',revision:3,handledAt:date.toISOString()}});
 const sql=m.raw.mock.calls[1][0].join('');expect(sql).toContain('AND revision=');expect(sql).toContain('WHERE "storeId"=');expect(sql).not.toContain('"Booking"');expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({actorUserId:'u',storeId:'s',action:'HANDLE_NOTICE'}),tx);
});
it('rejects stale notice revisions before auditing',async()=>{
 expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:0})).toMatchObject({success:false});expect(m.audit).not.toHaveBeenCalled();
});
it('rejects stale attempts to change the retired switch after checking permission',async()=>{
 expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:false,previous:true})).toMatchObject({success:false});expect(m.write).toHaveBeenCalledWith('business_hours.manage');expect(m.exec).not.toHaveBeenCalled();
});
it('rejects malformed payloads before any store or database access',async()=>{
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false,offset:-1})).toMatchObject({success:false});expect(await markSteamfootStoreNotice({storeId:'s',id:'n',handled:true,revision:-1})).toMatchObject({success:false});expect(await saveSteamfootNoticeSetting({storeId:'s',enabled:'true',previous:false})).toMatchObject({success:false});expect(m.read).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});

it('reads only the scoped pending count for a closed bell, without snapshots or write permission checks',async()=>{
 m.raw.mockResolvedValueOnce([{count:7}]);
 expect(await loadSteamfootStoreNotices({storeId:'s',handled:false,summaryOnly:true})).toMatchObject({success:true,items:[],count:7,canHandle:false});
 expect(m.raw).toHaveBeenCalledTimes(1);expect(m.raw.mock.calls[0][0].join('')).toContain('count(*)');expect(m.permission).not.toHaveBeenCalled();
});
