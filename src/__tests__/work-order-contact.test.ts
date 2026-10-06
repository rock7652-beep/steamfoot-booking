import { expect, it } from "vitest";
import { workOrderHours, workOrderLineId } from "@/lib/work-order-contact";
import { workOrderDetails } from "@/lib/work-orders";
it("preserves lunch breaks and closed days, omits unset hours",()=>{
 const base={openTime:null,closeTime:null};
 expect(workOrderHours([{...base,dayOfWeek:1,isOpen:true,segments:[{openTime:"10:00",closeTime:"12:00"},{openTime:"14:00",closeTime:"20:00"}]},{...base,dayOfWeek:0,isOpen:false},{...base,dayOfWeek:2,isOpen:true}])).toEqual(["週一 10:00–12:00、14:00–20:00","週日 公休"]);
});
it("old expected dates do not reappear in the new work order contract",()=>{expect(workOrderDetails({item:"吉他",dueDate:"2026-10-07"})).not.toHaveProperty("dueDate");});
it("prints public LINE IDs without mistaking short-link tokens for IDs",()=>{
 expect(workOrderLineId("@music.shop", "https://lin.ee/abc")).toBe("@music.shop");
 expect(workOrderLineId(null,"https://line.me/R/ti/p/%40music.shop")).toBe("@music.shop");
 expect(workOrderLineId(null,"https://lin.ee/abc")).toBeNull();
 expect(workOrderLineId(null,"https://example.com/R/ti/p/@music.shop")).toBeNull();
});
