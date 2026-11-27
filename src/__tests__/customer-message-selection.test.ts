import {it,expect} from "vitest";
import {messageSelectionKey,readMessageSelection} from "@/lib/customer-message-selection";
const now=1_800_000_000_000;
const raw=(override:Record<string,unknown>={})=>JSON.stringify({storeId:"shop-a",customerIds:["customer-a","customer-b"],createdAt:now,...override});
it("carries only exact selected IDs for the current store within fifteen minutes",()=>{
  expect(readMessageSelection(raw(),"shop-a",now)).toEqual(["customer-a","customer-b"]);
  expect(messageSelectionKey("2e3e3312-1755-41df-91c7-586efbdd0d23")).toMatch(/^customer-message-selection:/);
});
it("rejects expired, future, malformed, duplicate, oversized and other-store selections",()=>{
  for(const value of [null,"broken",raw({storeId:"shop-b"}),raw({createdAt:now-900001}),raw({createdAt:now+1}),raw({customerIds:[]}),raw({customerIds:["a","a"]}),raw({customerIds:Array.from({length:501},(_,i)=>String(i))}),raw({customerIds:[7]}),raw({customerIds:["a".repeat(101)]})])expect(()=>readMessageSelection(value,"shop-a",now)).toThrow();
  expect(()=>messageSelectionKey("../../another-key")).toThrow();
});
