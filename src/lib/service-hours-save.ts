import {z} from "zod";
import {courseDayHoursValues,courseDayHoursReceipt,savedCourseDayHours} from "./course-day-hours-save";
export const serviceHoursValues=courseDayHoursValues.extend({
 dayOfWeek:z.number().int().min(0).max(6).optional(),
 mode:z.enum(["day","copy","dates","permanent","template","weekly","slots","undo"]),
 targetDates:z.array(courseDayHoursValues.shape.date).max(62).default([]),conflictMode:z.enum(["skip","replace"]).default("skip"),includeSlotOverrides:z.boolean().default(false),
 changes:z.array(z.object({startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),action:z.enum(["enable","disable","capacity","reset"]),capacity:z.number().int().min(0).max(99).optional(),reason:z.string().max(300).optional()})).max(48).default([]),operationId:z.string().max(180).optional(),
});
export const serviceHoursSaveInput=z.object({values:serviceHoursValues}).merge(courseDayHoursReceipt);
export const savedServiceHours=savedCourseDayHours.extend({count:z.number(),skipped:z.array(z.object({date:z.string(),reason:z.string()})),operationId:z.string().nullable()});
