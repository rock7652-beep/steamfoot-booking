import {describe,it,expect} from "vitest";
import {compensationAmount,compensationRules} from "@/lib/course-compensation";
describe("teacher compensation agreements",()=>{
 it("pays a class once regardless of pupils or duration",()=>{expect(compensationAmount({mode:"CLASS",value:600},90,Array(8).fill({paid:1000,totalUnits:10,usedUnits:1}))).toBe(600);});
 it("uses scheduled minutes for hourly pay",()=>{expect(compensationAmount({mode:"HOUR",value:600},90,[])).toBe(900);});
 it("shares actual receipts allocated to consumed sessions",()=>{expect(compensationAmount({mode:"SHARE",value:50},60,[{paid:1000,totalUnits:10,usedUnits:1}])).toBe(50);});
 it("allocates points and sums different pupils' actual receipts",()=>{expect(compensationAmount({mode:"SHARE",value:50},60,[{paid:1000,totalUnits:10,usedUnits:2},{paid:800,totalUnits:10,usedUnits:2}])).toBe(180);});
 it("does not turn missing paid basis into a made-up rate",()=>{expect(()=>compensationAmount({mode:"SHARE",value:50},60,[{paid:1000,totalUnits:0,usedUnits:1}])).toThrow();});
 it("accepts multiple distinct course options and rejects invalid rates",()=>{expect(compensationRules.safeParse([{mode:"CLASS",value:600},{mode:"SHARE",value:50}]).success).toBe(true);for(const rules of [[{mode:"SHARE",value:101}],[{mode:"CLASS",value:-1}],[{mode:"CLASS",value:1.001}],[{mode:"CLASS",value:1},{mode:"CLASS",value:2}]])expect(compensationRules.safeParse(rules).success).toBe(false);});
});
