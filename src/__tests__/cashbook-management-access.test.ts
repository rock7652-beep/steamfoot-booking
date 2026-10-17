import {expect,it,vi} from "vitest";
import {registerHqStoreViewContext} from "@/lib/hq-store-view-context";
const preview=vi.hoisted(()=>({enabled:true}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:(id:string)=>preview.enabled&&id==="store-lubymusic"}));
import {canManageCashbookEntry} from "@/server/cashbook-management-access";
it("allows authorized preview HQ without a staff id, never another store or production",()=>{
 const user=registerHqStoreViewContext({role:"ADMIN",staffId:null},"store-lubymusic");
 expect(canManageCashbookEntry(user,{storeId:"store-lubymusic",staffId:null})).toBe(true);
 expect(canManageCashbookEntry(user,{storeId:"other",staffId:null})).toBe(false);
 preview.enabled=false;
 expect(canManageCashbookEntry(user,{storeId:"store-lubymusic",staffId:null})).toBe(false);
 preview.enabled=true;
});
it("retains staff ownership requirements",()=>{
 expect(canManageCashbookEntry({role:"STAFF",staffId:"a"},{storeId:"store-lubymusic",staffId:"a"})).toBe(true);
 expect(canManageCashbookEntry({role:"STAFF",staffId:"a"},{storeId:"store-lubymusic",staffId:"b"})).toBe(false);
 expect(canManageCashbookEntry({role:"OWNER",staffId:null},{storeId:"store-lubymusic",staffId:null})).toBe(false);
});
