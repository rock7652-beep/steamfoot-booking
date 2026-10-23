import {CourseUnassignedPlans} from "../unassigned-plans-view";
export default function Page({searchParams}:{searchParams:Promise<{page?:string}>}){return <CourseUnassignedPlans searchParams={searchParams}/>;}
