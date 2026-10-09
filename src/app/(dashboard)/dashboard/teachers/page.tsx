import {CourseStaffPage} from "../courses/staff-page";
// CourseStaffPage enforces OWNER, staff.view and active course store.
export default async function TeachersPage({searchParams}:{searchParams:Promise<{action?:string}>}){
  const query=await searchParams;
  return <CourseStaffPage teachers initialCreate={query.action==="create"}/>;
}
