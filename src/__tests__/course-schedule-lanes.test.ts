import {expect,it} from "vitest";
import {scheduleLanes} from "@/lib/course-schedule-lanes";
const row=(id:string,start:string,end:string,roomId="a",coachId="t")=>({id,startsAt:`2026-10-01T${start}:00+08:00`,endsAt:`2026-10-01T${end}:00+08:00`,roomId,coachId});
it("keeps a later-hour overlap beside a long class and reuses freed lanes",()=>{
 const rows=[row("long","09:00","11:00"),row("short","09:30","10:00"),row("later","10:00","10:30"),row("after","11:00","12:00")];
 const lanes=scheduleLanes(rows);
 expect(lanes.get("long")).toEqual({lane:0,count:2});
 expect(lanes.get("short")).toEqual({lane:1,count:2});
 expect(lanes.get("later")).toEqual({lane:1,count:2});
 expect(lanes.get("after")).toEqual({lane:0,count:1});
 expect(rows.map(row=>row.id)).toEqual(["long","short","later","after"]);
});
it("separates rooms but detects teacher overlap across rooms",()=>{
 const rows=[row("one","09:00","10:00"),row("two","09:00","10:00","b")];
 expect(scheduleLanes(rows).get("one")?.count).toBe(1);
 expect(scheduleLanes(rows,"coachId").get("two")?.count).toBe(2);
});
