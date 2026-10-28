import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({manager:vi.fn(),managerRead:vi.fn(),customer:vi.fn(),plan:vi.fn(),transaction:vi.fn(),prepare:vi.fn(),cancel:vi.fn(),ack:vi.fn(),read:vi.fn(),pending:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:mocks.manager,courseManagerRead:mocks.managerRead}));
vi.mock("@/server/services/music-checkout-request",()=>({withCourseCheckoutRequest:(f:()=>unknown)=>f()}));
vi.mock("@/server/services/course-store-lock",()=>({lockCourseStore:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:mocks.customer}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointPlan:{findFirst:mocks.plan},$transaction:mocks.transaction}}));
vi.mock("@/server/services/course-purchase-intent",()=>({prepareCourseIntent:mocks.prepare,cancelCourseIntent:mocks.cancel,acknowledgeCourseIntent:mocks.ack,readCourseIntent:mocks.read,readPendingCourseIntent:mocks.pending}));
import {prepareCoursePurchaseIntent,getCoursePurchaseIntent,cancelCoursePurchaseIntent,acknowledgeCoursePurchaseIntent} from "@/server/actions/course-purchase-intent";
const key="f49c86b2-967f-4b0e-8b90-9a4c63169398";
const actor={storeId:"store-a",user:{id:"u",role:"OWNER",staffId:"staff-a",storeId:"store-a"}};
const base={planId:"plan",customerId:"customer",expiresDate:"2099-12-31",requestKey:key,discountKind:"AMOUNT",discountValue:0,paymentMethod:"CARD",expectedListPrice:1000};
const success={status:"PREPARED",requestKey:key,purchaseId:null};
describe("course intent actions authorization",()=>{
 beforeEach(()=>{vi.stubEnv("COURSE_PURCHASE_INTENTS_ENABLED","1");for(const f of Object.values(mocks))f.mockReset();mocks.manager.mockResolvedValue(actor);mocks.managerRead.mockResolvedValue(actor);mocks.customer.mockResolvedValue({id:"customer"});mocks.plan.mockResolvedValue({termSessionIds:[]});mocks.transaction.mockImplementation((f:(tx:unknown)=>unknown)=>f({$queryRaw:vi.fn().mockResolvedValue([{id:"customer"}])}));mocks.prepare.mockResolvedValue(success);mocks.read.mockResolvedValue(success);});
 afterEach(()=>vi.unstubAllEnvs());
 it("blocks other stores on the shared music preview before any transaction or intent read",async()=>{
  vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','release/music-production-20261023');
  expect((await prepareCoursePurchaseIntent(base)).success).toBe(false);expect((await getCoursePurchaseIntent({customerId:'customer',requestKey:key})).success).toBe(false);
  expect(mocks.transaction).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
 });
 it("lets purchase-authorized staff recover without transaction.read",async()=>{
  const result=await getCoursePurchaseIntent({customerId:"customer",requestKey:key});expect(result.success).toBe(true);
  expect(mocks.managerRead.mock.calls.map(c=>c[0]).sort()).toEqual(["customer.read","transaction.create","wallet.create"]);
 });
 it("rejects unauthorized or cross-store customer before reading an intent",async()=>{
  mocks.customer.mockResolvedValue(null);expect((await getCoursePurchaseIntent({customerId:"foreign",requestKey:key})).success).toBe(false);expect(mocks.read).not.toHaveBeenCalled();
  mocks.customer.mockResolvedValue({id:"customer"});mocks.managerRead.mockImplementation(async p=>p==="transaction.create"?{...actor,storeId:"other"}:actor);
  expect((await getCoursePurchaseIntent({customerId:"customer",requestKey:key})).success).toBe(false);expect(mocks.read).not.toHaveBeenCalled();
 });
 it("requires discount and term-booking permission before preparing",async()=>{
  mocks.plan.mockResolvedValue({termSessionIds:["lesson"]});const result=await prepareCoursePurchaseIntent({...base,discountValue:100});expect(result.success).toBe(true);
  expect(mocks.manager.mock.calls.map(c=>c[0])).toContain("transaction.discount");expect(mocks.manager.mock.calls.map(c=>c[0])).toContain("booking.create");
 });
 it("does not register if added permission is denied",async()=>{
  mocks.manager.mockImplementation(async p=>{if(p==="transaction.discount")throw new Error("denied");return actor});
  expect((await prepareCoursePurchaseIntent({...base,discountValue:100})).success).toBe(false);expect(mocks.prepare).not.toHaveBeenCalled();
 });
 it("fails closed when disabled, including cancellation and acknowledgement",async()=>{
  vi.stubEnv("COURSE_PURCHASE_INTENTS_ENABLED","0");expect((await prepareCoursePurchaseIntent(base)).success).toBe(false);
  expect((await cancelCoursePurchaseIntent({customerId:"customer",requestKey:key})).success).toBe(false);
  expect((await acknowledgeCoursePurchaseIntent({customerId:"customer",requestKey:key})).success).toBe(false);expect(mocks.transaction).not.toHaveBeenCalled();
 });
});
