import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import {courseCalendarRead} from '@/server/services/course-calendar-read-scope';
import {readCourseSessionDetail} from './course-session-detail';

type TermSession={requestKey:string;templateId:string;requestIndex:number;template:{classType:string|null;musicTermLessons:number|null}};
function groupTerm(session:TermSession|undefined|null){
 const lessons=session?.template.classType==='GROUP'?session.template.musicTermLessons:null;
 if(!session||!lessons)return;
 const start=Math.floor(session.requestIndex/lessons)*lessons;
 return {requestKey:session.requestKey,templateId:session.templateId,requestIndex:{gte:start,lt:start+lessons}};
}
type Term=NonNullable<ReturnType<typeof groupTerm>>;
const termKey=(term:Term)=>JSON.stringify([term.requestKey,term.templateId,term.requestIndex.gte,term.requestIndex.lt]);
const seriesKey=(row:{requestKey:string;templateId:string})=>JSON.stringify([row.requestKey,row.templateId]);

/** Count the whole period, including lessons outside the visible calendar.
 * Only an already-authorized, exact calendar scope shares this live read.
 * Ordinary detail reads retain the original scalar count and cancellation rules. */
export async function readCourseGroupTermCount(storeId:string,sessionId:string,session:TermSession|undefined|null):Promise<number>{
 const term=groupTerm(session);
 if(!term)return 0;
 const calendar=courseCalendarRead(coursePrisma,storeId,sessionId);
 if(!calendar)return coursePrisma.courseSession.count({where:{storeId,cancelledAt:null,...term}});
 const counts=await calendar.once('roster-group-term-counts',async()=>{
  const sessions=await Promise.all(calendar.sessionIds.map(id=>readCourseSessionDetail(storeId,id)));
  const terms=new Map<string,Term>();
  for(const row of sessions){const target=groupTerm(row);if(target)terms.set(termKey(target),target);}
  const result=new Map([...terms.keys()].map(key=>[key,0]));
  if(!terms.size)return result;
  const rows=await coursePrisma.courseSession.findMany({
   where:{storeId,cancelledAt:null,OR:[...terms.values()]},
   select:{requestKey:true,templateId:true,requestIndex:true},
  });
  const bySeries=new Map<string,Term[]>();
  for(const target of terms.values()){
   const key=seriesKey(target),ranges=bySeries.get(key)??[];
   ranges.push(target);bySeries.set(key,ranges);
  }
  for(const row of rows)for(const target of bySeries.get(seriesKey(row))??[]){
   if(row.requestIndex>=target.requestIndex.gte&&row.requestIndex<target.requestIndex.lt){
    const key=termKey(target);result.set(key,result.get(key)!+1);
   }
  }
  return result;
 });
 return counts.get(termKey(term))??0;
}
