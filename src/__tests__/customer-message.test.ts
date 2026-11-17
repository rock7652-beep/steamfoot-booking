import { describe,it,expect } from "vitest";
import { messageSchedule,messageDraftSchema,messageRetryAllowed } from "@/lib/customer-message";
describe("customer message input and Taipei scheduling",()=>{
 const now=new Date("2026-11-17T01:00:00Z");
 it("parses Taiwan time independently of host timezone",()=>{expect(messageSchedule({timing:"scheduled",date:"2026-11-18",time:"10:15"},now).toISOString()).toBe("2026-11-18T02:15:00.000Z");});
 it("rejects past, impossible and excessively distant dates",()=>{for(const [date,time] of [["2026-11-17","08:00"],["2026-11-31","10:00"],["2027-11-18","10:00"]])expect(()=>messageSchedule({timing:"scheduled",date,time},now)).toThrow();});
 it("preserves flexible content while trimming and deduplicating selected people",()=>{expect(messageDraftSchema.parse({customerIds:["b","a","b"],body:"  今天請從側門進入\n謝謝您！  ",timing:"now"})).toMatchObject({customerIds:["a","b"],body:"今天請從側門進入\n謝謝您！"});expect(messageDraftSchema.safeParse({customerIds:[],body:"hi",timing:"now"}).success).toBe(false);expect(messageDraftSchema.safeParse({customerIds:["a"],body:"x".repeat(2001),timing:"now"}).success).toBe(false);});
 it("stops retrying before LINE's deduplication window expires",()=>{expect(messageRetryAllowed(new Date(now.getTime()-22*3600000),4,now)).toBe(true);expect(messageRetryAllowed(new Date(now.getTime()-23*3600000),1,now)).toBe(false);expect(messageRetryAllowed(null,5,now)).toBe(false);});
});
