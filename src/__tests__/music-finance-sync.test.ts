// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {MUSIC_FINANCE_SIGNAL,isMusicSyncRoute,subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
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

it("limits automatic refresh to course, teacher and monthly pages",()=>{
 for(const route of ["/s/lubymusic/admin/dashboard/courses", "/s/lubymusic/admin/dashboard/courses/source-pilot/salary", "/s/lubymusic/admin/dashboard/teachers", "/s/lubymusic/admin/dashboard/service-fee-calculator"])expect(isMusicSyncRoute(route)).toBe(true);
 for(const route of [null,"/dashboard/revenue","/dashboard/teachers-other","/dashboard/service-fee-calculator-other"])expect(isMusicSyncRoute(route)).toBe(false);
});

it("routes typed checkout signals and retains old clients",()=>{
 const callback=vi.fn(),dispose=subscribeMusicFinanceChange(callback);
 for(const detail of ["purchase:1","receipt:2","old-uuid"])window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail}));
 expect(callback.mock.calls).toEqual([["purchase"],["receipt"],["general"]]);dispose();
});
it("deduplicates early revenue and final signals even with an intervening transaction",()=>{
 const revenue=vi.fn(),normal=vi.fn();
 const stopRevenue=subscribeMusicFinanceChange(revenue,true),stopNormal=subscribeMusicFinanceChange(normal);
 const early="music-preview:lubymusic:revenue-commit-v1";
 window.dispatchEvent(new CustomEvent(early,{detail:"purchase:a"}));
 expect(revenue).toHaveBeenCalledOnce();expect(normal).not.toHaveBeenCalled();
 window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail:"receipt:b"}));
 window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail:"purchase:a"}));
 expect(revenue.mock.calls).toEqual([["purchase"],["receipt"]]);
 expect(normal.mock.calls).toEqual([["receipt"],["purchase"]]);
 stopRevenue();stopNormal();
 window.dispatchEvent(new CustomEvent(early,{detail:"purchase:c"}));
 expect(revenue).toHaveBeenCalledTimes(2);
});
