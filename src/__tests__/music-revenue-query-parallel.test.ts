import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({count:vi.fn(),orders:vi.fn(),customers:vi.fn(),cards:vi.fn(),bookings:vi.fn(),tuition:vi.fn(),receipts:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePurchase:{count:m.count,findMany:m.orders},coursePointCard:{findMany:m.cards},courseBooking:{groupBy:m.bookings}}}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.customers}}}));
vi.mock("@/server/services/music-finance-scope",()=>({musicPurchaseWhere:()=>({id:{not:"legacy"}})}));
vi.mock("@/server/services/music-tuition",()=>({readMusicTuition:m.tuition,readMusicReceipts:m.receipts}));
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
beforeEach(()=>{vi.resetAllMocks();m.orders.mockResolvedValue([]);m.customers.mockResolvedValue([]);m.cards.mockResolvedValue([]);m.bookings.mockResolvedValue([]);m.tuition.mockResolvedValue(new Map());m.receipts.mockResolvedValue([]);});
it("starts page rows before count finishes with identical store and filter scope",async()=>{
 let finish!:(n:number)=>void;m.count.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const pending=getMusicRevenueTransactions("store",{from:"2026-10-01",to:"2026-10-16",status:"CONFIRMED",staff:"operator",page:"1"});
 expect(m.orders).toHaveBeenCalledOnce();
 expect(m.orders.mock.calls[0][0].where).toEqual(m.count.mock.calls[0][0].where);
 expect(m.orders.mock.calls[0][0]).toMatchObject({where:{storeId:"store",status:"CONFIRMED",confirmedBy:"operator"},skip:0,take:30});
 finish(40);expect((await pending).page).toBe(1);expect(m.orders).toHaveBeenCalledOnce();
});
it("retains last-page clamping when a page disappears",async()=>{
 m.count.mockResolvedValue(31);
 const result=await getMusicRevenueTransactions("store",{from:"2026-10-01",to:"2026-10-16",page:"9"});
 expect(result).toMatchObject({count:31,pages:2,page:2});
 expect(m.orders.mock.calls.map(([args])=>args.skip)).toEqual([30]);
});
