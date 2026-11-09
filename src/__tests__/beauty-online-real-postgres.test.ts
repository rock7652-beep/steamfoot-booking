import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';

// Opt-in: a separately-created disposable database on this exact loopback port.
// The action authentication and outbound notification delivery are substituted;
// real Prisma clients, store lock, actions, intent state, card/ledger/payment,
// command replay, cashbook and activation audit execute against PostgreSQL.
const url=process.env.QA_BEAUTY_REAL_PG;
const allowed=!!url&&process.env.BEAUTY_DATABASE_MODE==='legacy'&&process.env.DATABASE_URL===url&&process.env.DIRECT_URL===url&&(()=>{try{const u=new URL(url);return u.protocol==='postgresql:'&&u.hostname==='127.0.0.1'&&u.port==='55441'&&u.pathname==='/beauty_service_qa'&&!u.search&&!u.hash;}catch{return false;}})();
const users=vi.hoisted(()=>({member:{storeId:'svc-qa-store',userId:'svc-qa-member',customerId:'svc-qa-customer'},manager:{storeId:'svc-qa-store',userId:'svc-qa-manager',manager:true}}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/beauty/access',async(importOriginal)=>{const real=await importOriginal<typeof import('@/server/beauty/access')>();return {...real,beautyMember:vi.fn(async()=>users.member),beautyManager:vi.fn(async()=>users.manager)};});
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:vi.fn(async()=>{}),hasStoreFeature:vi.fn(async()=>true),getStoreLimitsByStoreId:vi.fn(async()=>({}))}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn(async()=>({id:users.manager.userId,role:'ADMIN'})),checkPermission:vi.fn(async()=>true),isOwner:vi.fn(()=>true)}));
vi.mock('@/lib/session',()=>({requireSession:vi.fn(async()=>({id:users.manager.userId,role:'ADMIN',staffId:null})),getCurrentUser:vi.fn(async()=>({id:users.manager.userId,role:'ADMIN',staffId:null}))}));
vi.mock('@/server/beauty/manager-notifications',()=>({notifyBeautyBookingManagers:vi.fn(),notifyBeautyPurchaseManagers:vi.fn()}));
vi.mock('@/server/services/plan-activation-notification-kick',()=>({kickPlanActivationNotifications:vi.fn()}));

import {prisma} from '@/lib/db';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyTransaction} from '@/server/beauty/access';
import {requestBeautyPlan} from '@/server/actions/beauty';
import {prepareBeautyMemberPurchaseIntent,readBeautyMemberPurchaseIntent,cancelBeautyMemberPurchaseIntent,acknowledgeBeautyMemberPurchaseIntent} from '@/server/actions/beauty-member-purchase-intent';
import {prepareBeautyOnlineConfirm,commitBeautyOnlineConfirm,acknowledgeBeautyOnlineConfirm} from '@/server/actions/beauty-online-confirm-intent';
import {assertOnlineConfirmationSettled} from '@/server/beauty/online-confirm-guard';
import {refund} from '@/server/beauty/commerce';
import {correctBeautyTransaction} from '@/server/beauty/transaction-correction';

const storeId=users.member.storeId,customerId=users.member.customerId;
const planId='svc-qa-plan';
const details={expectedStoreId:storeId,planId,lastFour:'1234',expectedName:'合成十次方案',expectedPrice:5000,expectedSessions:10,expectedRevision:0};
const newKey=()=>crypto.randomUUID();
describe.skipIf(!allowed)('real isolated beauty purchase and accounting services',()=>{
 beforeAll(async()=>{
  await prisma.user.createMany({data:[{id:users.member.userId,name:'合成會員',role:'CUSTOMER'},{id:users.manager.userId,name:'合成店長',role:'OWNER'}]});
  await prisma.store.create({data:{id:storeId,name:'合成美業店',slug:storeId,industryModule:'BEAUTY'}});
  await prisma.customer.create({data:{id:customerId,storeId,name:'合成顧客',phone:'0900000091'}});
  await prisma.shopConfig.create({data:{storeId,shopName:'合成美業店',bankName:'合成銀行',bankAccountNumber:'123456789'}});
  await beautyPrisma.beautySetting.create({data:{storeId,notifications:false}});
  await beautyPrisma.beautyPlan.create({data:{id:planId,storeId,name:details.expectedName,price:details.expectedPrice,sessions:details.expectedSessions,revision:details.expectedRevision,validDays:90,serviceIds:['svc-qa-service'],customerPurchasable:true}});
 });
 afterAll(async()=>{await Promise.all([prisma.$disconnect(),beautyPrisma.$disconnect()]);});
 it('replays a lost member response, confirms once, and blocks correction until acknowledged',async()=>{
  const requestKey=newKey(),input={...details,requestKey};
  expect(await prepareBeautyMemberPurchaseIntent(input)).toMatchObject({success:true,data:{status:'PREPARED'}});
  const [first,retry]=await Promise.all([requestBeautyPlan(input),requestBeautyPlan(input)]);
  expect(first.success&&retry.success).toBe(true);
  if(!first.success||!retry.success)throw Error('member order failed');
  expect(retry.data.id).toBe(first.data.id);
  expect(await beautyPrisma.beautyPurchase.count({where:{storeId,customerId}})).toBe(1);
  expect(await readBeautyMemberPurchaseIntent({expectedStoreId:storeId,requestKey})).toMatchObject({success:true,data:{status:'COMMITTED',purchaseId:first.data.id}});
  expect(await acknowledgeBeautyMemberPurchaseIntent({expectedStoreId:storeId,requestKey,purchaseId:first.data.id})).toMatchObject({success:true});
  const confirm={expectedStoreId:storeId,orderId:first.data.id,requestKey:newKey()};
  expect(await prepareBeautyOnlineConfirm(confirm)).toMatchObject({success:true,data:{status:'PREPARED',amount:5000}});
  const [a,b]=await Promise.all([commitBeautyOnlineConfirm(confirm),commitBeautyOnlineConfirm(confirm)]);
  expect(a.success&&b.success).toBe(true);if(!a.success||!b.success)throw Error('confirmation failed');
  expect(a.data.purchaseId).toBe(b.data.purchaseId);
  const cardId=a.data.purchaseId!;
  expect(await beautyPrisma.beautyCard.count({where:{storeId,customerId}})).toBe(1);
  expect(await beautyPrisma.beautyLedger.count({where:{storeId,cardId,kind:'GRANT'}})).toBe(1);
  const sale=await beautyPrisma.beautyPayment.findMany({where:{storeId,cardId,kind:'SALE'}});
  expect(sale).toHaveLength(1);expect(sale[0].amount).toBe(5000);
  expect(await prisma.cashbookEntry.count({where:{storeId,id:`beauty:${sale[0].id}`}})).toBe(1);
  await expect(beautyTransaction(users.manager,tx=>assertOnlineConfirmationSettled(tx,storeId,{cardId}))).rejects.toThrow('尚未完成的核帳確認');
  await expect(beautyTransaction(users.manager,tx=>refund(tx,users.manager,{requestKey:newKey(),paymentId:sale[0].id,amount:5000,method:'OTHER',reason:'合成測試'}))).rejects.toThrow('尚未完成的核帳確認');
  await expect(beautyTransaction(users.manager,tx=>correctBeautyTransaction(tx,users.manager,{requestKey:newKey(),purchaseId:sale[0].id,expectedRevision:0,reason:'合成測試',operation:'void'}))).rejects.toThrow('尚未完成的核帳確認');
  expect(await acknowledgeBeautyOnlineConfirm(confirm)).toMatchObject({success:true,data:{status:'ACKNOWLEDGED'}});
  await expect(beautyTransaction(users.manager,tx=>assertOnlineConfirmationSettled(tx,storeId,{cardId}))).resolves.toBeUndefined();
 });
 it('honours the original snapshot when confirming a legacy pending order',async()=>{
  await beautyPrisma.beautyPlan.update({where:{id:planId},data:{price:7000,revision:1}});
  const order=await beautyPrisma.beautyPurchase.create({data:{storeId,customerId,planId,lastFour:'5678',snapshot:{id:planId,name:'舊方案快照',sessions:5,price:2300,validDays:90,serviceIds:['svc-qa-service'],revision:0,allowShared:false,active:true}}});
  const input={expectedStoreId:storeId,orderId:order.id,requestKey:newKey()};
  expect(await prepareBeautyOnlineConfirm(input)).toMatchObject({success:true,data:{amount:2300}});
  const result=await commitBeautyOnlineConfirm(input);expect(result.success).toBe(true);if(!result.success)throw Error('legacy confirm failed');
  const card=await beautyPrisma.beautyCard.findUniqueOrThrow({where:{id:result.data.purchaseId!}});
  expect(card).toMatchObject({name:'舊方案快照',sessions:5,paid:2300});
  expect(await acknowledgeBeautyOnlineConfirm(input)).toMatchObject({success:true});
 });
 it('rejects a changed plan and a request arriving after cancellation',async()=>{
  const changed={...details,requestKey:newKey()};
  expect(await prepareBeautyMemberPurchaseIntent(changed)).toMatchObject({success:true});
  const before=await beautyPrisma.beautyPurchase.count({where:{storeId,customerId}});
  expect(await requestBeautyPlan(changed)).toMatchObject({success:false,error:expect.stringContaining('變更')});
  expect(await cancelBeautyMemberPurchaseIntent({expectedStoreId:storeId,requestKey:changed.requestKey})).toMatchObject({success:true,data:{status:'CANCELLED'}});
  expect(await requestBeautyPlan(changed)).toMatchObject({success:false,error:expect.stringContaining('取消')});
  expect(await beautyPrisma.beautyPurchase.count({where:{storeId,customerId}})).toBe(before);
 });
});
