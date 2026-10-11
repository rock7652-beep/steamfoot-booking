import {z} from "zod";
import {courseDayHoursReceipt} from "./course-day-hours-save";
import {courseStaffConflicts} from "./course-staff-save";
export const courseAvailabilitySaveInput=z.object({kind:z.enum(["weekly","exception"]),values:z.record(z.unknown())}).merge(courseDayHoursReceipt);
const period=z.object({openTime:z.string(),closeTime:z.string()});
export const savedCourseAvailability=z.object({revision:z.string(),inheritStoreHours:z.boolean(),weekly:z.array(z.object({dayOfWeek:z.number(),periods:z.array(period)})),exceptions:z.array(z.object({date:z.string(),type:z.string(),reason:z.string(),periods:z.array(period)})),retainedSessions:courseStaffConflicts});
