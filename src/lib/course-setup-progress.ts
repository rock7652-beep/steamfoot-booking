export type CourseSetupCounts = { coaches:number; rooms:number; templates:number; plans:number; sessions:number; qualifiedCoaches:number };
export function courseSetupSteps(counts:CourseSetupCounts) {
  return [
    {id:"coach",label:"新增教練",done:counts.coaches>0,href:"/dashboard/teachers",hint:"先填姓名，聯絡資料可稍後補。"},
    {id:"course",label:"建立課程",done:counts.templates>0,href:"/dashboard/courses?view=catalog&action=create",hint:"填名稱、班別、分鐘、人數與扣點。"},
    {id:"plan",label:"建立方案",done:counts.plans>0,href:"/dashboard/courses?view=plans&action=create",hint:"選點數、堂數或期課，再填售價與效期。"},
    {id:"schedule",label:counts.sessions>0?"排第一堂課":counts.rooms===0?"新增空間":counts.qualifiedCoaches===0?"設定授課課程":"排第一堂課",done:counts.sessions>0,href:counts.rooms===0?"/dashboard/courses?view=rooms&action=create":counts.qualifiedCoaches===0?"/dashboard/teachers":"/dashboard/courses?action=schedule",hint:counts.rooms===0?"先新增一個空間，再排課。":counts.qualifiedCoaches===0?"先到教練的授課設定，勾選可教授課程。":"選日期、教練與教室即可排課。"},
  ];
}
export function setupReminderVisible(mode:"show"|"later"|"never", deferredLogin:string|undefined, login:string, completed:boolean) {
  return !completed && mode!=="never" && !(mode==="later"&&deferredLogin===login);
}
