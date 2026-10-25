import {CourseUnassignedPlans} from "../unassigned-plans-view";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){return CourseUnassignedPlans({searchParams});}
