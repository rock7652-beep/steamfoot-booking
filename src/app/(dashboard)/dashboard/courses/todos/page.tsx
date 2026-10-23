import {CourseTodos} from "../todos-view";
export default function Page({searchParams}:{searchParams:Promise<{page?:string}>}){return <CourseTodos searchParams={searchParams}/>;}
