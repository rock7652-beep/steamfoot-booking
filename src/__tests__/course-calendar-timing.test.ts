import {afterEach,expect,it,vi} from "vitest";
import {calendarAccessPhase,calendarCount,calendarPhase,calendarSyncPhase,traceCourseCalendar} from "@/server/services/course-calendar-timing";

afterEach(()=>vi.restoreAllMocks());
type Trace={operation:string;ok:boolean;spans:Array<{name:string;startMs:number;durationMs:number|null;ok:boolean|null}>;counts:Record<string,number>;dropped:number};
const records=(log:{mock:{calls:unknown[][]}}):Trace[]=>log.mock.calls.filter(row=>row[0]==="[COURSE_CALENDAR_PHASE_PERF]").map(row=>JSON.parse(row[1] as string) as Trace);

it("isolates concurrent requests and reports fixed labels without logging input/output values",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const result={success:true,customer:"private customer",password:"private password"};
  const pending=traceCourseCalendar("sports_sync",async()=>{
    calendarCount("series",3);
    return calendarPhase("series",async()=>{await gate;return result;});
  });
  await traceCourseCalendar("month_fitness",async()=>{
    calendarCount("sessions",2);
    await calendarPhase("sessions",async()=>[]);
    return calendarSyncPhase("presentation",()=>({success:true}));
  });
  release();expect(await pending).toBe(result);
  const rows=records(log);
  expect(rows.map(row=>row.operation)).toEqual(["month_fitness","sports_sync"]);
  expect(rows[0].counts).toEqual({sessions:2});expect(rows[1].counts).toEqual({series:3});
  expect(rows[0].spans.map((s:{name:string})=>s.name)).toEqual(["sessions","presentation"]);
  expect(rows[1].spans.map((s:{name:string})=>s.name)).toEqual(["series"]);
  expect(JSON.stringify(rows)).not.toMatch(/private customer|private password/);
  for(const row of rows)for(const span of row.spans){expect(span.ok).toBe(true);expect(span.startMs).toBeGreaterThanOrEqual(0);expect(span.durationMs).toBeGreaterThanOrEqual(0);}
});

it("keeps exact rejections and failed results while redacting error messages",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const error=new Error("private SQL parameters");
  await expect(traceCourseCalendar("sports_sync",()=>calendarPhase("production_readiness",async()=>{throw error;}))).rejects.toBe(error);
  expect(records(log)[0]).toMatchObject({ok:false,spans:[{name:"production_readiness",ok:false}]});
  const result={success:false,error:"private customer data"};
  expect(await traceCourseCalendar("month_music",async()=>result)).toBe(result);
  expect(records(log)[1].ok).toBe(false);
  expect(JSON.stringify(records(log))).not.toMatch(/private SQL|private customer/);
});

it("bounds spans and ignores unrecognized labels/counts even through runtime casts",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  await traceCourseCalendar("private identity" as "sports_sync",async()=>{
    await calendarAccessPhase("private phone",async()=>1);
    await calendarAccessPhase("permission.session",async()=>1);
    calendarCount("private identity" as "sessions",12);
    calendarCount("sessions",Number.NaN);calendarCount("customers",-1);
    for(let i=0;i<100;i++)await calendarPhase("missing_batch",async()=>[]);
  });
  const [row]=records(log);expect(row.operation).toBe("unknown");
  expect(row.spans).toHaveLength(96);expect(row.dropped).toBe(5);expect(row.counts).toEqual({});
  expect(row.spans[0].name).toBe("access.permission.session");
  expect(JSON.stringify(row)).not.toMatch(/private identity|private phone/);
});

it("leaves untraced calls unchanged and prevents logger failures from masking results/errors",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{throw new Error("logger unavailable");});
  expect(await calendarPhase("sessions",async()=>42)).toBe(42);
  calendarCount("sessions",1);expect(log).not.toHaveBeenCalled();
  expect(await traceCourseCalendar("month_fitness",async()=>42)).toBe(42);
  const error=new Error("original error");
  await expect(traceCourseCalendar("sports_sync",async()=>{throw error;})).rejects.toBe(error);
});

it("distinguishes unfinished parallel spans from failed work when a batch rejects early",async()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  let release!:(value:number)=>void;
  const gate=new Promise<number>(resolve=>{release=resolve;});
  const error=new Error("denied");
  let pending!:Promise<number>;
  await expect(traceCourseCalendar("month_fitness",()=>{
    pending=calendarPhase("rentals",()=>gate);
    return Promise.all([calendarPhase("sessions",async()=>{throw error;}),pending]);
  })).rejects.toBe(error);
  const [row]=records(log);
  expect(row.spans.find(s=>s.name==="sessions")).toMatchObject({ok:false});
  expect(row.spans.find(s=>s.name==="rentals")).toMatchObject({ok:null,durationMs:null});
  release(1);expect(await pending).toBe(1);
});
