export type CourseSetupCounts = { coaches:number; rooms:number; templates:number; plans:number; sessions:number; qualifiedCoaches:number };
export function courseSetupSteps(counts:CourseSetupCounts) {
  return [
    {id:"course",label:"建立課程",done:counts.templates>0,href:"/dashboard/courses?view=catalog&action=create",hint:"先建立課程，下一步設定教練時即可選擇授課課程。"},
    {id:"coach",label:counts.coaches>0 ? "設定授課課程" : "新增教練與授課課程",done:counts.coaches>0 && counts.qualifiedCoaches>0,href:"/dashboard/teachers",hint:"填姓名並勾選可教授課程，一次完成教練設定。"},
    {id:"room",label:"新增空間",done:counts.rooms>0,href:"/dashboard/courses?view=rooms&action=create",hint:"建立教室或上課空間。"},
    {id:"plan",label:"建立方案",done:counts.plans>0,href:"/dashboard/courses?view=plans&action=create",hint:"選點數、堂數或期課，再填售價與效期。"},
    {id:"schedule",label:"排第一堂課",done:counts.sessions>0,href:"/dashboard/courses?action=schedule",hint:"選日期、教練與空間，儲存後到課表確認。"},

  ];
}
export function setupReminderVisible(mode:"show"|"later"|"never", deferredLogin:string|undefined, login:string, completed:boolean) {
  return !completed && mode!=="never" && !(mode==="later"&&deferredLogin===login);
}
