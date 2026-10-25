"use server";
import {readCourseCustomerPurchases} from "@/server/queries/course-customer-purchases";
export async function loadCourseCustomerPurchases(input:unknown,offset=0,range:{from?:string;to?:string}={}){
 return readCourseCustomerPurchases(input,offset,range);
}
