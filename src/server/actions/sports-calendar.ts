"use server";
import {readCourseMonthCalendar} from "@/server/services/course-month-calendar";
/** Read only; navigation never enters a router transition or changes store context. */
export async function loadSportsCalendar(input:unknown){return readCourseMonthCalendar(input,"FITNESS");}
export async function loadMusicCalendar(input:unknown,dataScope?:string){return readCourseMonthCalendar(input,"MUSIC",dataScope);}
