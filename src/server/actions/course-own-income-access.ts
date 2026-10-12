"use server";
import {saveCourseWorkPermission} from "@/server/services/course-work-permission-save";
export async function saveCourseOwnIncomeAccess(input:unknown){return saveCourseWorkPermission(input);}
