// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {startSportsBackgroundSync,SPORTS_SYNC_INTERVAL} from "@/lib/sports-background-sync";
let stop: (()=>void)|undefined;
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");});
afterEach(()=>{stop?.();stop=undefined;vi.restoreAllMocks();vi.useRealTimers();});
it("updates an idle visible page without focus or reload",async()=>{
 const read=vi.fn().mockResolvedValue(true);stop=startSportsBackgroundSync(read);
 await vi.advanceTimersByTimeAsync(SPORTS_SYNC_INTERVAL);expect(read).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(SPORTS_SYNC_INTERVAL);expect(read).toHaveBeenCalledTimes(2);
});
it("coalesces focus, online and timer while a slow read is pending",async()=>{
 let resolve!:(v:boolean)=>void;const read=vi.fn(()=>new Promise<boolean>(r=>{resolve=r;}));stop=startSportsBackgroundSync(read);
 window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("online"));await vi.advanceTimersByTimeAsync(9000);expect(read).toHaveBeenCalledOnce();
 resolve(true);await vi.advanceTimersByTimeAsync(2999);expect(read).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);expect(read).toHaveBeenCalledTimes(2);
});
it("pauses in a hidden tab and resumes when visible",async()=>{
 const visible=vi.spyOn(document,"visibilityState","get");const read=vi.fn().mockResolvedValue(true);stop=startSportsBackgroundSync(read);
 visible.mockReturnValue("hidden");document.dispatchEvent(new Event("visibilitychange"));await vi.advanceTimersByTimeAsync(30_000);expect(read).not.toHaveBeenCalled();
 visible.mockReturnValue("visible");document.dispatchEvent(new Event("visibilitychange"));await vi.advanceTimersByTimeAsync(0);expect(read).toHaveBeenCalledOnce();
});
it("does not read during a write or unresolved result, resumes after unlock",async()=>{
 let locked=true;const read=vi.fn().mockResolvedValue(true);stop=startSportsBackgroundSync(read,()=>locked);
 await vi.advanceTimersByTimeAsync(6000);window.dispatchEvent(new Event("focus"));expect(read).not.toHaveBeenCalled();locked=false;await vi.advanceTimersByTimeAsync(3000);expect(read).toHaveBeenCalledOnce();
});
it("backs off failed reads and resets after recovery",async()=>{
 const read=vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);stop=startSportsBackgroundSync(read);
 await vi.advanceTimersByTimeAsync(3000);expect(read).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(5999);expect(read).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect(read).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(12000);expect(read).toHaveBeenCalledTimes(3);await vi.advanceTimersByTimeAsync(3000);expect(read).toHaveBeenCalledTimes(4);
});
it("cleanup during an in-flight read removes listeners and future work",async()=>{
 let resolve!:(v:boolean)=>void;const read=vi.fn(()=>new Promise<boolean>(r=>{resolve=r;}));stop=startSportsBackgroundSync(read);window.dispatchEvent(new Event("focus"));stop();resolve(true);
 await vi.advanceTimersByTimeAsync(60_000);window.dispatchEvent(new Event("online"));expect(read).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
