/** User-facing course names never include generated six-digit disambiguation suffixes.
 * Keep persisted snapshots and internal IDs intact, including older template versions.
 */
export function courseDisplayName(name: string) {
  return name.replace(/(?: · [0-9a-f]{6})+$/i, "");
}
/** Compatibility for existing sports callers; display does not depend on the current template ID. */
export const sportsCourseName: (name: string, templateId: string) => string = courseDisplayName;
export type CourseTemplatePresentation = { id:string; name:string; displayName?:string; isActive?:boolean; currentTeaching?:boolean; musicSubjectId?:string|null; musicTrialMode?:string|null; musicPricePerLesson?:number|null; musicTermLessons?:number|null; musicTeacherShare?:number|null; durationMinutes?:number };
export function courseTemplateLabel(template:Pick<CourseTemplatePresentation,"name"|"displayName"|"musicSubjectId">) { return courseDisplayName(template.displayName??template.name); }
export function presentCourseTemplates<T extends CourseTemplatePresentation>(templates:T[],plans:{name:string;isActive:boolean;templateIds:string[]}[],music:boolean):Array<T & {displayName:string;currentTeaching:boolean}> {
 return templates.map(template=>{
  const linked=plans.filter(p=>p.isActive&&p.templateIds.includes(template.id));
  const base=courseDisplayName(template.name);
  const fallback=[base,...(template.musicSubjectId&&template.musicPricePerLesson!=null?[`每堂 $${template.musicPricePerLesson}`]:[])].join("・");
  return {...template,displayName:music&&linked.length?[...new Set(linked.map(p=>p.name))].join("／"):fallback,currentTeaching:template.isActive!==false&&(!music||!template.musicSubjectId||!!template.musicTrialMode||linked.length>0)};
 });
}
