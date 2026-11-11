import {musicPlanItems} from "./music-catalog";

export const PENDING_FEE_SUBJECT = "__pending_fee_subject__";
type Fee = {sportsMode?:string;sportsSubjectId?:string|null;templateIds:string[]};
type Subject = {id:string;name:string};
type Template = Subject & {musicSubjectId?:string|null};
export type CourseFeeGroup = {id:string;name:string;subjectIds:string[];pending:boolean};

/** Catalog presentation only. Never use this grouping to authorize spending. */
export function courseFeeGroup(plan:Fee,templates:Template[],subjects:Subject[],music:boolean):CourseFeeGroup {
  const pending={id:PENDING_FEE_SUBJECT,name:"待核對科目",subjectIds:[],pending:true};
  if(!music&&plan.sportsMode==="OPEN")return pending;
  const items=music?musicPlanItems(plan.templateIds,templates,subjects):
    plan.sportsMode==="ASSIGNED"?subjects.filter(s=>s.id===plan.sportsSubjectId):
    subjects.filter(s=>plan.templateIds.some(id=>id===s.id||templates.some(t=>t.id===id&&t.musicSubjectId===s.id)));
  // A partially unresolved legacy scope must not appear to have a complete mapping.
  if(!items.length||(!music&&plan.sportsMode!=="ASSIGNED"&&plan.templateIds.some(id=>!subjects.some(s=>s.id===id||templates.some(t=>t.id===id&&t.musicSubjectId===s.id))))||
    (music&&plan.templateIds.some(id=>!templates.some(t=>t.id===id))))return pending;
  const ordered=[...items].sort((a,b)=>a.id.localeCompare(b.id));
  const ids=ordered.map(s=>s.id);
  return {id:JSON.stringify(ids),name:ordered.map(s=>s.name).join("、"),subjectIds:ids,pending:false};
}

export function courseFeeMatches(group:CourseFeeGroup,filter:string,plan:Fee) {
  if(filter==="all")return true;
  if(filter===PENDING_FEE_SUBJECT)return group.pending;
  return !group.pending&&(group.subjectIds.includes(filter)||plan.templateIds.includes(filter));
}
