export type CourseSetupCounts = { coaches:number; rooms:number; templates:number; subjects?:number; plans:number; sessions:number; qualifiedCoaches:number; openDays?:number; dutyEnabled?:boolean };
export function courseSetupSteps(counts:CourseSetupCounts, music = false) {
  const provider = music ? "教師" : "教練";
  return [
    {id:"hours",label:"設定營業時間與公休",done:(counts.openDays ?? 0)>0,href:"/dashboard/courses/hours",hint:"設定每週可上課時段與公休日。"},
    {id:"room",label:"新增空間",done:counts.rooms>0,href:"/dashboard/courses?view=rooms&action=create",hint:"建立啟用的教室或上課空間，確認人數容量。"},
    {id:"course",label:music ? "建立教學項目" : "建立課程",done:(music ? counts.subjects ?? counts.templates : counts.templates)>0,href:"/dashboard/courses?view=catalog&action=create",hint:music ? "建立並上架教學項目，例如吉他。" : "建立課程內容，確認上課時間、人數上限與每人點數。"},
    {id:"plan",label:music ? "設定班型與學費" : "建立方案",done:counts.plans>0,href:"/dashboard/courses?view=plans&action=create",hint:music ? "選教學項目，設定課型、每堂學費、每期堂數、排課方式與效期。" : "選方案類型，設定售價與效期。"},
    {id:"coach",label:counts.coaches>0 ? `設定${provider}授課資格` : `新增${provider}與授課課程`,done:counts.coaches>0 && counts.qualifiedCoaches>0,href:counts.coaches>0 ? "/dashboard/teachers" : "/dashboard/teachers?action=create",hint:`啟用${provider}並勾選可教授課程${counts.dutyEnabled ? "，值班需涵蓋整堂課" : "，未另設授課時間時沿用營業時間"}。`},
    {id:"schedule",label:"排第一堂課",done:counts.sessions>0,href:"/dashboard/courses?action=schedule",hint:`選日期、課程、${provider}與空間，確認空位後建立。`},
  ].map(step=>{
    if (!step.done) return step;
    const [path,query=""]=step.href.split("?");
    const params=new URLSearchParams(query);params.delete("action");
    return {...step,href:params.size?`${path}?${params.toString()}`:path};
  });
}
export function setupReminderVisible(mode:"show"|"later"|"never", deferredLogin:string|undefined, login:string, completed:boolean) {
  return !completed && mode!=="never" && !(mode==="later"&&deferredLogin===login);
}
