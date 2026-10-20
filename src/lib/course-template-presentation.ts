/** Presentation only: retain template IDs, persisted names and financial rules. */
/** Strip only the suffix generated from this sports template's own identity. */
export function sportsCourseName(name: string, templateId: string) {
  if (!/^sports_(?:item|rule)_[0-9a-f]{64}$/.test(templateId)) return name;
  const suffix = ` · ${templateId.slice(-6)}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
export type CourseTemplatePresentation = { id:string; name:string; displayName?:string; isActive?:boolean; currentTeaching?:boolean; musicSubjectId?:string|null; musicTrialMode?:string|null; musicPricePerLesson?:number|null; musicTermLessons?:number|null; musicTeacherShare?:number|null; durationMinutes?:number };
export function courseTemplateLabel(template:Pick<CourseTemplatePresentation,"name"|"displayName"|"musicSubjectId">) { return template.displayName??(template.musicSubjectId?template.name.replace(/ · [0-9a-f]{6}$/,""):template.name); }
export function presentCourseTemplates<T extends CourseTemplatePresentation>(templates:T[],plans:{name:string;isActive:boolean;templateIds:string[]}[],music:boolean):Array<T & {displayName:string;currentTeaching:boolean}> {
 return templates.map(template=>{
  const linked=plans.filter(p=>p.isActive&&p.templateIds.includes(template.id));
  const base=template.musicSubjectId?template.name.replace(/ · [0-9a-f]{6}$/,""):template.name;
  const fallback=[base,...(template.musicSubjectId&&template.musicPricePerLesson!=null?[`每堂 $${template.musicPricePerLesson}`]:[])].join("・");
  return {...template,displayName:music&&linked.length?[...new Set(linked.map(p=>p.name))].join("／"):fallback,currentTeaching:template.isActive!==false&&(!music||!template.musicSubjectId||!!template.musicTrialMode||linked.length>0)};
 });
}
