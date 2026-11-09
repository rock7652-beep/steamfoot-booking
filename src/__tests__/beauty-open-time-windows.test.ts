import {expect,it} from "vitest";
import {beautyOpenTimeWindows} from "@/lib/beauty/open-time-windows";
import type {DayRule,SlotOverrideRow} from "@/lib/business-hours-resolver";
const rule:DayRule={status:"open",closed:false,reason:null,openTime:"09:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6,source:"weekly",periods:[{openTime:"09:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6}]};
const override=(startTime:string,type:string):SlotOverrideRow=>({date:new Date("2040-01-01"),startTime,type,capacity:null,reason:null});
it("splits the available service window when a middle slot closes",()=>{
 expect(beautyOpenTimeWindows(rule,[override("10:00","disabled")])).toEqual([{start:"09:00",end:"10:00"},{start:"10:30",end:"18:00"}]);
});
it("merges adjacent temporary slots and caps the day at midnight",()=>{
 expect(beautyOpenTimeWindows(rule,[override("18:00","enabled"),override("18:30","enabled"),override("23:30","enabled")])).toEqual([{start:"09:00",end:"19:00"},{start:"23:30",end:"24:00"}]);
});
it("does not bridge a closed gap between temporary slots",()=>{
 expect(beautyOpenTimeWindows(rule,[override("19:00","enabled"),override("20:00","enabled")])).toEqual([{start:"09:00",end:"18:00"},{start:"19:00",end:"19:30"},{start:"20:00",end:"20:30"}]);
});
it("does not reopen a closed or training day",()=>{
 expect(beautyOpenTimeWindows({...rule,closed:true,status:"training"},[override("19:00","enabled")])).toEqual([]);
});
it("reopening restores the original window without mutating weekly settings",()=>{
 expect(beautyOpenTimeWindows(rule,[])).toEqual([{start:"09:00",end:"18:00"}]);
 expect(rule.periods[0].closeTime).toBe("18:00");
});
