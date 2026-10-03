"use client";
export const isCourseTestData=(name:string)=>/驗收|測試/.test(name);
export function CourseTestDataFilter({names,checked,onChange}:{names:string[];checked:boolean;onChange:(checked:boolean)=>void}){
 if(!names.some(isCourseTestData))return null;
 return <label className="flex min-h-9 items-center gap-2 text-sm text-earth-600"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>隱藏驗收／測試資料</label>;
}
