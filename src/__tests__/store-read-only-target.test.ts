import {expect,it} from "vitest";
import {isReadOnlyStoreTarget} from "@/lib/store-read-only";
it.each(["OWNER","STAFF","PARTNER"])("%s reading another authorized store is read-only independently of cookies",role=>{
 expect(isReadOnlyStoreTarget({role,storeId:"parent"},"child")).toBe(true);
 expect(isReadOnlyStoreTarget({role,storeId:"parent"},"parent")).toBe(false);
});
it("preserves HQ authority and does not invent a concrete context",()=>{
 expect(isReadOnlyStoreTarget({role:"ADMIN",storeId:"parent"},"child")).toBe(false);
 expect(isReadOnlyStoreTarget({role:"OWNER",storeId:"parent"},null)).toBe(false);
 expect(isReadOnlyStoreTarget({role:"OWNER"},"child")).toBe(false);
});
