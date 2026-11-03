import type {DayRule, SlotOverrideRow} from "@/lib/business-hours-resolver";

const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
const time=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
/** Single-day exceptions change availability, never existing appointments or weekly rules. */
export function beautyOpenTimeWindows(rule:DayRule, overrides:SlotOverrideRow[]) {
  if(rule.closed)return [];
  const ranges=rule.periods.map(p=>({start:minutes(p.openTime),end:minutes(p.closeTime)}));
  for(const override of overrides.filter(o=>o.type==="enabled")) {
    const start=minutes(override.startTime);
    ranges.push({start,end:Math.min(1440,start+30)});
  }
  const merged:Array<{start:number;end:number}>=[];
  for(const range of ranges.sort((a,b)=>a.start-b.start)){
    const last=merged.at(-1);
    if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);
    else merged.push({...range});
  }
  let open=merged;
  for(const override of overrides.filter(o=>o.type==="disabled")){
    const start=minutes(override.startTime);
    const interval=rule.periods.find(p=>override.startTime>=p.openTime&&override.startTime<p.closeTime)?.slotInterval??30;
    const end=start+interval;
    open=open.flatMap(range=>end<=range.start||start>=range.end?[range]:[
      ...(range.start<start?[{start:range.start,end:start}]:[]),
      ...(end<range.end?[{start:end,end:range.end}]:[]),
    ]);
  }
  return open.map(range=>({start:time(range.start),end:time(range.end)}));
}
