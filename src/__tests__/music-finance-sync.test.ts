// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {MUSIC_FINANCE_SIGNAL,subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
beforeEach(()=>{localStorage.clear();vi.stubGlobal("BroadcastChannel",undefined);});
afterEach(()=>vi.unstubAllGlobals());
it("deduplicates signals and removes listeners",()=>{
 const refresh=vi.fn();const dispose=subscribeMusicFinanceChange(refresh);
 window.dispatchEvent(new StorageEvent("storage",{key:MUSIC_FINANCE_SIGNAL,newValue:"a"}));
 window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail:"a"}));
 expect(refresh).toHaveBeenCalledOnce();
 window.dispatchEvent(new StorageEvent("storage",{key:"another-store",newValue:"b"}));expect(refresh).toHaveBeenCalledOnce();
 dispose();window.dispatchEvent(new StorageEvent("storage",{key:MUSIC_FINANCE_SIGNAL,newValue:"b"}));expect(refresh).toHaveBeenCalledOnce();
});
it("catches up when a suspended tab resumes",()=>{
 const refresh=vi.fn();const dispose=subscribeMusicFinanceChange(refresh);
 localStorage.setItem(MUSIC_FINANCE_SIGNAL,"new-token");window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"));
 expect(refresh).toHaveBeenCalledOnce();dispose();
});
