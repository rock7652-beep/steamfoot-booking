export type CourseSetupCounts = { coaches:number; rooms:number; templates:number; subjects?:number; plans:number; sessions:number; qualifiedCoaches:number; openDays?:number; dutyEnabled?:boolean; existing?:{hours?:number;rooms?:number;courses?:number;plans?:number;coaches?:number} };
export function courseSetupSteps(counts:CourseSetupCounts, music = false, sports = false) {
  const subjects = music||sports;
  const provider = music ? "教師" : "教練";
  const steps = [
    {id:"hours",label:"設定營業時間與公休",done:(counts.openDays ?? 0)>0,href:"/dashboard/courses/hours",hint:"設定每週可上課時段與公休日。"},
    {id:"room",label:"新增空間",done:counts.rooms>0,href:"/dashboard/courses?view=rooms&action=create",hint:"建立啟用的教室或上課空間，確認人數容量。"},
    {id:"course",label:subjects ? "建立教學項目" : "建立課程",done:(subjects ? counts.subjects ?? counts.templates : counts.templates)>0,href:"/dashboard/courses?view=catalog&action=create",hint:subjects ? (sports?"建立並上架運動教學項目。":"建立並上架教學項目，例如吉他。") : "建立課程內容，確認上課時間、人數上限與每人點數。"},
    {id:"plan",label:sports ? "設定收費方式" : music ? "設定班型與學費" : "建立方案",done:counts.plans>0,href:"/dashboard/courses?view=plans&action=create",hint:sports ? "選教學項目，設定點數或堂數、售價與效期。" : music ? "選教學項目，設定課型、每堂學費、每期堂數、排課方式與效期。" : "選方案類型，設定售價與效期。"},
    {id:"coach",label:counts.coaches>0 ? `設定${provider}授課資格` : `新增${provider}與授課課程`,done:counts.coaches>0 && counts.qualifiedCoaches>0,href:counts.coaches>0 ? "/dashboard/teachers" : "/dashboard/teachers?action=create",hint:`啟用${provider}並勾選可教授課程${counts.dutyEnabled ? "，值班需涵蓋整堂課" : "，未另設授課時間時沿用營業時間"}。`},
    {id:"schedule",label:"排第一堂課",done:counts.sessions>0,href:"/dashboard/courses?action=schedule",hint:`選日期、課程、${provider}與空間，確認空位後建立。`},
  ];
  if (sports) {
    const coach = steps.find(step => step.id === "coach")!;
    Object.assign(coach, {label: "新增教練", done: counts.coaches > 0, hint: "先建立啟用中的教練，下一步設定收費方式時選取可授課教練。"});
    const plan = steps.find(step => step.id === "plan")!;
    plan.done = counts.plans > 0 && counts.qualifiedCoaches > 0;
    const order = ["hours", "room", "course", "coach", "plan", "schedule"];
    steps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return steps.map(step=>{
    const existing=({hours:counts.existing?.hours??counts.openDays??0,room:counts.existing?.rooms??counts.rooms,course:counts.existing?.courses??(subjects?counts.subjects??counts.templates:counts.templates),plan:counts.existing?.plans??counts.plans,coach:counts.existing?.coaches??counts.coaches,schedule:0} as Record<string,number>)[step.id];
    const status=step.done?"done" as const:existing>0?"repair" as const:"missing" as const;
    const label=status!=="repair"?step.label:({room:"啟用上課空間",course:subjects?"上架教學項目":"上架課程",plan:sports?"啟用收費方式":music?"啟用班型與學費":"啟用方案",coach:counts.coaches>0?`補齊${provider}授課資格`:`啟用${provider}並補授課資格`,hours:"修正營業時間與公休"} as Record<string,string>)[step.id]??step.label;
    const hint=status!=="repair"?step.hint:({room:"已有空間，請啟用至少一個可上課空間。",course:subjects?"已有教學項目，請將要使用的項目上架。":"已有課程，請將要使用的課程上架。",plan:sports?"已有收費方式，請啟用要使用的收費方式。":music?"已有班型，請啟用要使用的班型與學費。":"已有方案，請啟用要使用的方案。",coach:`啟用${provider}並補齊已上架課程的授課資格${counts.dutyEnabled?"，值班需涵蓋整堂課":""}。`} as Record<string,string>)[step.id]??step.hint;
    if (sports && step.id === "coach" && status === "repair") return {...step,sports,status,label:"啟用教練",hint:"啟用至少一位教練，下一步再選取可授課教練。",href:"/dashboard/teachers"};
    if (sports && step.id === "plan" && counts.plans > 0 && counts.qualifiedCoaches === 0) return {...step,sports,status,label:"補齊收費方式的授課教練",hint:"編輯收費方式並選取啟用中的授課教練。",href:"/dashboard/courses?view=plans"};
    if (status==="missing") return {...step,sports,status};
    const [path,query=""]=step.href.split("?");
    const params=new URLSearchParams(query);params.delete("action");
    return {...step,sports,status,label,hint,href:params.size?`${path}?${params.toString()}`:path};
  });
}
export function setupReminderVisible(mode:"show"|"later"|"never", deferredLogin:string|undefined, login:string, completed:boolean) {
  return !completed && mode!=="never" && !(mode==="later"&&deferredLogin===login);
}

export type CourseSetupStep=ReturnType<typeof courseSetupSteps>[number];
/** Only guide navigation carries this marker; ordinary management links stay unchanged. */
export function courseSetupHref(step:Pick<CourseSetupStep,"id"|"href"|"done"> & {sports?:boolean}) {
  if(step.done)return step.href;
  const [path,query=""]=step.href.split("?");const params=new URLSearchParams(query);
  params.set("setupStep",step.id);
  if (step.sports) params.set("setupFlow","sports");
  return `${path}?${params}`;
}
export function currentCourseSetupStep(steps:Pick<CourseSetupStep,"id"|"href">[],pathname:string,search:string) {
  const params=new URLSearchParams(search),step=steps.find(s=>s.id===params.get("setupStep"));
  if(!step)return -1;
  const [path,query=""]=step.href.split("?");
  const target=new URLSearchParams(query);
  return pathname.endsWith(path)&&(params.get("view")??"schedule")===(target.get("view")??"schedule")?steps.indexOf(step):-1;
}
