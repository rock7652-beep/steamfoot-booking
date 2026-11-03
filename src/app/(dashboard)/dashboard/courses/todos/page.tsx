import {CourseTodos} from "../todos-view";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string;dataScope?:string}>}){return CourseTodos({searchParams});}
