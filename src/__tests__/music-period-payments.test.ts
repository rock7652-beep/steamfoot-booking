import {expect,it} from "vitest";
import {musicPeriodReceipts} from "@/lib/music-period-payments";
it("keeps real receipt dates and splits a cross-period receipt without inventing payments",()=>{
 const receipts=[{id:"late",amount:4000,paidAt:"2026-10-23"},{id:"backdated",amount:2400,paidAt:"2026-10-01"}];
 const rows=musicPeriodReceipts([3200,3200],receipts);
 expect(rows[0].map(r=>[r.id,r.allocated,r.paidAt])).toEqual([["backdated",2400,"2026-10-01"],["late",800,"2026-10-23"]]);
 expect(rows[1].map(r=>r.allocated)).toEqual([3200]);expect(receipts[0].amount).toBe(4000);
});
it("shows no inferred receipt for zero collected and handles a zero-due period",()=>{
 expect(musicPeriodReceipts([3200,3200],[])).toEqual([[],[]]);
 expect(musicPeriodReceipts([0,100],[{id:"paid",amount:100,paidAt:"2026-10-01"}])[1][0].allocated).toBe(100);
});
