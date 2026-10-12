import {z} from "zod";
export const courseWorkPermissionInput=z.object({storeId:z.string().min(1).max(180),staffId:z.string().min(1).max(180),enabled:z.boolean(),previous:z.boolean(),permission:z.enum(["teacher.income.read.self","teacher.booking.leave","teacher.booking.reschedule","teacher.session.leave","teacher.session.reschedule"]).default("teacher.income.read.self")});
export const savedCourseWorkPermission=z.object({storeId:z.string(),staffId:z.string(),permission:courseWorkPermissionInput.shape.permission,enabled:z.boolean(),updatedAt:z.string().datetime()});
