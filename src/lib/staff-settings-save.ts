import {z} from "zod";
export const staffSaveReceipt=z.object({expectedStoreId:z.string().min(1).max(100),expectedVersion:z.string().datetime().nullable(),requestKey:z.string().uuid()});
export const staffSettingsSaveInput=z.object({id:z.string().min(1).optional(),values:z.record(z.unknown()),...staffSaveReceipt.shape});
export const savedStaffPerson=z.object({
 id:z.string(),updatedAt:z.string(),userId:z.string(),role:z.string(),permissions:z.array(z.string()),displayName:z.string(),legalName:z.string(),roleLabel:z.string(),email:z.string(),phone:z.string().nullable(),colorCode:z.string(),status:z.string(),customerCount:z.number(),specialties:z.string(),specialtyKeys:z.array(z.enum(["body","head","foot","face"])),emergencyContact:z.object({name:z.string(),relation:z.string(),phone:z.string()}).nullable(),weeklyAvailability:z.array(z.object({dayOfWeek:z.number(),startTime:z.string(),endTime:z.string()})),scheduleExceptions:z.array(z.object({date:z.string(),label:z.string(),tone:z.enum(["leave","extra"]),startTime:z.string().nullable(),endTime:z.string().nullable(),reason:z.string().nullable()})),canEdit:z.boolean(),canResetPassword:z.boolean(),compensationMode:z.enum(["PERCENTAGE","FIXED"]).nullable(),compensationValue:z.number().nullable(),
});

export const spaStaffSettingsSaveInput=z.object({kind:z.enum(["setup","skills","weekly","compensation","exception"]),id:z.string().min(1).max(180),values:z.record(z.unknown()),...staffSaveReceipt.shape});
