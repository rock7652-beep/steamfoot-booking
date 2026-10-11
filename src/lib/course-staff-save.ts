import {z} from "zod";
export const courseStaffReceipt=z.object({expectedStoreId:z.string().min(1).max(100),expectedVersion:z.string().datetime().nullable(),requestKey:z.string().uuid()});
export const courseStaffSaveInput=z.object({values:z.record(z.unknown()),...courseStaffReceipt.shape});
export const savedCoursePerson=z.object({
 id:z.string(),name:z.string(),kind:z.enum(["manager","coach"]),role:z.string(),canEdit:z.boolean(),
 linkedStaffId:z.string(),linkedStaffName:z.string(),financeTeacherIds:z.array(z.string()).nullable(),
 coachLoginReady:z.boolean(),coachEnabled:z.boolean(),defaultClassFee:z.string(),qualificationIds:z.array(z.string()),qualificationsConfirmed:z.boolean(),
 updatedAt:z.string(),birthday:z.string(),emergencyContactRelation:z.string(),emergencyContactName:z.string(),emergencyContactPhone:z.string(),
 assignments:z.array(z.object({id:z.string(),name:z.string(),startsAt:z.string(),endsAt:z.string(),capacity:z.number(),bookedCount:z.number()})),
 email:z.string(),contactEmail:z.string(),notificationsEnabled:z.boolean(),phone:z.string(),active:z.boolean(),memberEnabled:z.boolean(),permissions:z.array(z.string()),customerId:z.string(),
});
export const savedCourseStaff=z.object({rows:z.array(savedCoursePerson)});

export const courseStaffConflicts=z.array(z.object({id:z.string(),name:z.string(),startsAt:z.string(),endsAt:z.string().optional(),capacity:z.number(),bookedCount:z.number().optional()}));
