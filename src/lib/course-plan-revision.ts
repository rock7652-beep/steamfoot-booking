import {coursePlanValues} from './course-plan-save';
const snapshot=coursePlanValues.omit({id:true,musicSetup:true});
/** Compare the same validated values as the save guard, regardless of JSON key order. */
export function sameCoursePlanRevision(left:string|null,right:string|null):boolean{
 if(left===right)return true;
 if(!left||!right||left.length>80000||right.length>80000)return false;
 try{
  const a=snapshot.safeParse(JSON.parse(left)),b=snapshot.safeParse(JSON.parse(right));
  return a.success&&b.success&&JSON.stringify(a.data)===JSON.stringify(b.data);
 }catch{return false;}
}
