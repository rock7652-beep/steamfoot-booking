import {expect,it} from "vitest";
import {musicPurchasePeriods,musicPeriodLabel,musicBatchLabel} from "@/lib/music-purchase-periods";
const card=(id:string,terms:number[],date="2026-10-24T01:00:00Z",planId="individual")=>({id,planId,templateIds:["guitar"],musicTermSizes:terms,createdAt:date});
it("numbers two periods followed by two more as 1–2 and 3–4 regardless of input order",()=>{
 const ranges=musicPurchasePeriods([card("b",[4,4],"2026-10-24T02:00:00Z"),card("a",[4,4])]);
 expect(ranges.get("a")).toEqual({batch:1,start:1,end:2});expect(ranges.get("b")).toEqual({batch:2,start:3,end:4});
 expect(musicPeriodLabel(1,ranges.get("b")!.start)).toBe("第 3 期");
 expect(musicPeriodLabel(2,ranges.get("b")!.start)).toBe("第 4 期");
});
it("keeps different charging methods and teaching identities separate",()=>{
 const ranges=musicPurchasePeriods([card("a",[4,4]),card("other-plan",[4],undefined,"pair"),{...card("other-item",[4]),templateIds:["piano"]}]);
 expect(ranges.get("other-plan")?.start).toBe(1);expect(ranges.get("other-item")?.start).toBe(1);
});
it("retains numbering after a historical purchase is refunded or closed",()=>{
 const history={...card("a",[4,4]),closedAt:new Date(),status:"REFUNDED"};
 expect(musicPurchasePeriods([history,card("b",[4,4])]).get("b")).toEqual({batch:2,start:3,end:4});
});
it("does not guess a cumulative range when an older purchased term count is missing",()=>{
 const ranges=musicPurchasePeriods([card("a",[]),card("b",[4,4])]);
 expect(ranges.get("b")).toEqual({batch:2,start:null,end:null});
 expect(musicBatchLabel(2,null,2)).toBe("第 2 次購課・期別待確認");
 expect(musicPeriodLabel(1,null,2)).toBe("本筆第 1 期");
});
it("uses stable IDs for simultaneous purchases and leaves local period identities unchanged",()=>{
 const input=[card("b",[4]),card("a",[4,4])];const before=JSON.stringify(input);
 expect(musicPurchasePeriods(input).get("b")?.start).toBe(3);expect(JSON.stringify(input)).toBe(before);
 expect(musicBatchLabel(2,3,2)).toBe("第 2 次購課・第 3–4 期");
});
