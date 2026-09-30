export type CourseOrderKind = "subject" | "plan" | "room" | "staff";
export type CourseOrderSnapshot = {ids:string[];revision:number};
export const emptyCourseOrder:CourseOrderSnapshot={ids:[],revision:0};
export function orderCourseRows<T extends {id:string}>(rows:T[],ids:string[]):T[] {
  const ranks=new Map(ids.map((id,i)=>[id,i]));
  return [...rows].sort((a,b)=>(ranks.get(a.id)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.id)??Number.MAX_SAFE_INTEGER));
}
export function moveCourseRow(ids:string[],from:string,to:string) {
  if(from===to||!ids.includes(from)||!ids.includes(to)) return ids;
  const next=ids.filter(id=>id!==from);next.splice(ids.indexOf(to),0,from);return next;
}
