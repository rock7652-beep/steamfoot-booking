export type CourseSetupCounts = { coaches:number; rooms:number; templates:number; subjects?:number; plans:number; sessions:number; qualifiedCoaches:number; openDays?:number; dutyEnabled?:boolean };
export function courseSetupSteps(counts:CourseSetupCounts, music = false) {
  const provider = music ? "教師" : "教練";
  return [
    {id:"hours",label:"設定營業時間與公休",done:(counts.openDays ?? 0)>0,href:"/dashboard/courses/hours",hint:"先設定每週可上課時段與公休日；整堂課的起訖都需落在營業時段內。"},
    {id:"room",label:"新增空間",done:counts.rooms>0,href:"/dashboard/courses?view=rooms&action=create",hint:"建立啟用的教室或上課空間，確認人數容量。"},
    {id:"course",label:music ? "建立教學項目" : "建立課程",done:(music ? counts.subjects ?? counts.templates : counts.templates)>0,href:"/dashboard/courses?view=catalog&action=create",hint:music ? "建立教學項目名稱並上架，例如吉他；課型、學費與每期堂數在下一步設定。" : "建立課程內容，確認上課時間、人數上限與每人點數。"},
    {id:"plan",label:music ? "設定班型與學費" : "建立方案",done:counts.plans>0,href:"/dashboard/courses?view=plans&action=create",hint:music ? "選教學項目，設定課型、每堂學費、每期堂數、排課方式與效期。" : "選點數、堂數或期課，再填售價與效期；方案供學員購買與預約使用。"},
    {id:"coach",label:counts.coaches>0 ? `設定${provider}授課資格` : `新增${provider}與授課課程`,done:counts.coaches>0 && counts.qualifiedCoaches>0,href:counts.coaches>0 ? "/dashboard/teachers" : "/dashboard/teachers?action=create",hint:`填姓名、啟用身分並勾選可教授課程；未另設可授課時間時沿用營業時間。${counts.dutyEnabled ? "已啟用值班聯動，需先安排涵蓋整堂課的值班。" : ""}`},
    {id:"schedule",label:"排第一堂課",done:counts.sessions>0,href:"/dashboard/courses?action=schedule",hint:`選日期、課程、${provider}與空間，先預覽確認營業、公休、授課資格、可授課時間與撞期。`},
  ];
}
export function setupReminderVisible(mode:"show"|"later"|"never", deferredLogin:string|undefined, login:string, completed:boolean) {
  return !completed && mode!=="never" && !(mode==="later"&&deferredLogin===login);
}
