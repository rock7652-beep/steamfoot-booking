import { expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const m = vi.hoisted(() => ({ customer: vi.fn(), transactions: vi.fn(), cashbook: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  customer: { findFirst: m.customer },
  shopConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  transaction: { findMany: m.transactions },
  cashbookEntry: { findMany: m.cashbook },
} }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store" }) }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(), requireStaffSession: vi.fn() }));

import { getCustomerDrawerDetailForUser } from "@/server/queries/customer";

it("shows the newest linked cashbook income in the customer drawer", async () => {
  m.permission.mockResolvedValue(true);
  m.customer.mockResolvedValue({
    id: "customer-1", storeId: "store", name: "黃彥陸", mergedIntoCustomerId: null,
    user: null, planWallets: [], _count: { planWallets: 0, bookings: 0, sponsoredCustomers: 0 },
  });
  m.transactions.mockResolvedValue([]);
  m.cashbook.mockResolvedValue([{ id: "cash-1", entryDate: new Date("2026-09-22T00:00:00Z"), createdAt: new Date("2026-09-22T14:33:00Z"), category: "三寶", amount: 100, paymentMethod: "CASH" }]);

  const result = await getCustomerDrawerDetailForUser({ role: "OWNER", staffId: "staff" } as never, "customer-1", "store");

  expect(result.recentConsumption).toEqual([{ id: "cashbook:cash-1", date: new Date("2026-09-22T00:00:00Z"), label: "三寶", amount: 100, payment: "現金" }]);
  expect(m.cashbook).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", customerId: "customer-1", type: "INCOME" }, take: 5 }));
});

it("returns plain wallet prices without changing the original Decimal or hiding wallet history", async () => {
  m.permission.mockResolvedValue(false);
  const wallet = { id: "wallet", purchasedPrice: new Prisma.Decimal(5000), remainingSessions: 3, status: "ACTIVE", expiryDate: new Date("2027-01-01") };
  m.customer.mockResolvedValue({id:"customer-1",storeId:"store",mergedIntoCustomerId:null,user:null,planWallets:[wallet]});
  const result = await getCustomerDrawerDetailForUser({role:"OWNER",staffId:"staff"} as never,"customer-1","store");
  expect(result.planWallets[0]).toMatchObject({id:"wallet",purchasedPrice:5000,remainingSessions:3,status:"ACTIVE",expiryDate:wallet.expiryDate});
  expect(Object.getPrototypeOf(result.planWallets[0])).toBe(Object.prototype);
  expect(Prisma.Decimal.isDecimal(wallet.purchasedPrice)).toBe(true);
});

it('includes a complete dated grid in the prefetched customer response',async()=>{
 m.permission.mockResolvedValue(true);m.transactions.mockResolvedValue([]);m.cashbook.mockResolvedValue([]);
 m.customer.mockResolvedValue({id:'customer',storeId:'store',mergedIntoCustomerId:null,user:null,planWallets:[{id:'wallet',purchasedPrice:new Prisma.Decimal(3000),totalSessions:2,remainingSessions:1,sessions:[{id:'used',status:'COMPLETED',completedAt:new Date('2026-11-02T02:00Z'),voidedAt:null,booking:null},{id:'free',status:'AVAILABLE',completedAt:null,voidedAt:null,booking:null}]}]});
 const result=await getCustomerDrawerDetailForUser({role:'OWNER',staffId:'staff'} as never,'customer','store');
 expect(result.planWallets[0].usageProgress).toMatchObject({available:true,total:2,completed:[{date:'2026-11-02T02:00:00.000Z'}]});
});

it('uses the purchase receipt date and never guesses it from wallet issuance or start dates',async()=>{
 m.permission.mockResolvedValue(true);m.transactions.mockResolvedValue([]);m.cashbook.mockResolvedValue([]);
 const purchasedAt=new Date('2026-01-05T04:00Z');
 m.customer.mockResolvedValue({id:'customer',storeId:'store',mergedIntoCustomerId:null,user:null,planWallets:[{id:'wallet',createdAt:new Date('2026-11-01'),startDate:new Date('2026-02-01'),purchasedPrice:new Prisma.Decimal(3000),totalSessions:2,remainingSessions:2,sessions:[],transactions:[{createdAt:purchasedAt}]}]});
 const result=await getCustomerDrawerDetailForUser({role:'OWNER',staffId:'staff'} as never,'customer','store');
 expect(result.planWallets[0].purchasedAt).toEqual(purchasedAt);
 expect(m.customer.mock.calls.at(-1)?.[0].include.planWallets.include.transactions).toMatchObject({take:1,where:{transactionType:'PACKAGE_PURCHASE',status:'SUCCESS'},orderBy:{createdAt:'asc'}});
 m.customer.mockResolvedValue({id:'customer',storeId:'store',mergedIntoCustomerId:null,user:null,planWallets:[{id:'wallet',createdAt:new Date('2026-11-01'),purchasedPrice:new Prisma.Decimal(3000),totalSessions:2,remainingSessions:2,sessions:[],transactions:[]}]});
 expect((await getCustomerDrawerDetailForUser({role:'OWNER',staffId:'staff'} as never,'customer','store')).planWallets[0].purchasedAt).toBeNull();
});
