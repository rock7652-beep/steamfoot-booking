import "server-only";
import {coursePrisma} from "@/lib/course-db";

/** Preserve legacy recurrence across month boundaries, including exceptions. */
export async function readMusicCalendarRecurrence(storeId:string,requestKeys:readonly string[]) {
  if (!requestKeys.length) return {fixed:new Set<string>(),biweekly:new Set<string>()};
  const fixed=new Set((await coursePrisma.courseSession.groupBy({
    by:["requestKey"],where:{storeId,cancelledAt:null,requestKey:{in:[...new Set(requestKeys)]}},
    _count:{id:true},having:{id:{_count:{gt:1}}},
  })).map(row=>row.requestKey));
  const biweekly=new Set<string>();
  if (!fixed.size) return {fixed,biweekly};
  const rows=await coursePrisma.courseSession.findMany({
    where:{storeId,cancelledAt:null,requestKey:{in:[...fixed]}},select:{requestKey:true,startsAt:true},orderBy:{startsAt:"asc"},
  });
  const dates=new Map<string,number[]>();
  for (const row of rows) {const values=dates.get(row.requestKey)??[];values.push(row.startsAt.getTime());dates.set(row.requestKey,values);}
  for (const [key,values] of dates) if(values.length>=2&&values.every((date,index)=>index===0||Math.round((date-values[index-1])/86400000)===14))biweekly.add(key);
  return {fixed,biweekly};
}
