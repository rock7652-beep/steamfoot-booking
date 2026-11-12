import {courseDisplayName} from './course-template-presentation';

export type QualificationTemplate={id:string;name:string;displayName?:string;musicSubjectId?:string|null;subjectName?:string;subjectActive?:boolean;isActive?:boolean;currentTeaching?:boolean};
/** Price versions are implementation details of one teaching qualification. */
export function teachingQualificationGroups(templates:readonly QualificationTemplate[],groupBySubject=true){
 const groups=new Map<string,{key:string;name:string;ids:string[];active:boolean;legacy:boolean}>();
 for(const template of templates){
  const subjectId=groupBySubject?template.musicSubjectId:null;
  const key=subjectId??template.id;
  const active=subjectId?template.subjectActive!==false&&template.isActive!==false:template.isActive!==false&&template.currentTeaching!==false;
  const prior=groups.get(key);
  if(prior){prior.ids.push(template.id);prior.active ||= active;}
  else groups.set(key,{key,name:subjectId?template.subjectName??courseDisplayName(template.name):courseDisplayName(template.displayName??template.name),ids:[template.id],active,legacy:!subjectId});
 }
 return [...groups.values()];
}

export function teachingQualificationCount(templates:readonly QualificationTemplate[],selected:readonly string[],groupBySubject=true){
 return teachingQualificationGroups(templates,groupBySubject).filter(group=>group.ids.some(id=>selected.includes(id))).length;
}
