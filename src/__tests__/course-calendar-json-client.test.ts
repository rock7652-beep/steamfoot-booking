// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {readMusicCalendar,syncSportsCalendar} from "@/lib/sports-calendar-client";
const fetcher=vi.fn();
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal("fetch",fetcher);fetcher.mockResolvedValue({ok:true,json:async()=>({success:true,data:{month:"2026-11"}})});window.history.replaceState(null,"","/hq/dashboard/courses?dataScope=legacy&scheduleView=week");});
afterEach(()=>vi.unstubAllGlobals());
it("music requests only the authorized month JSON, retaining the data scope",async()=>{
 await readMusicCalendar("2026-11-03");expect(fetcher).toHaveBeenCalledOnce();
 const [url,options]=fetcher.mock.calls[0];expect(url).toBe("/hq/dashboard/courses/calendar-read");expect(JSON.parse(options.body)).toEqual({date:"2026-11-03",profile:"MUSIC",dataScope:"legacy"});expect(options).toMatchObject({credentials:"same-origin",cache:"no-store",method:"POST"});
});
it("sports synchronization uses the JSON endpoint instead of a Server Action page response",async()=>{
 await syncSportsCalendar("2026-11-03");expect(fetcher).toHaveBeenCalledExactlyOnceWith("/hq/dashboard/courses/calendar-sync",expect.objectContaining({method:"POST",body:JSON.stringify({date:"2026-11-03"})}));
});
it("fails closed on a rejected month request",async()=>{fetcher.mockResolvedValue({ok:false});await expect(readMusicCalendar("2026-11-03")).rejects.toThrow("課表讀取失敗");});
