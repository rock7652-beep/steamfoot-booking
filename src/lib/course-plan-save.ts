import {courseChargeSettings} from "./course-charge-settings";
import { z } from "zod";
import { musicSubjectRuleSchema } from "@/lib/music-subject-rule";
const id=z.string().min(1).max(100);
// Current scope plus template and provider snapshots must fit when all 200 items are selected.
export const COURSE_PLAN_SNAPSHOT_MAX=80000;
export const coursePlanValues = z
      .object({
        id: id.optional(),
        chargeSettings:courseChargeSettings.nullable().default(null),
        sportsMode: z.enum(["LEGACY", "ASSIGNED", "OPEN", "SUBJECTS"]).default("LEGACY"),
        sportsSubjectId: id.nullable().default(null),
        sportsSubjectIds:z.array(id).max(200).default([]),
        sportsCost: z.number().int().min(1).max(10000).nullable().default(null),
        musicSetup: musicSubjectRuleSchema.optional(),
        name: z.string().trim().min(1).max(80),
        points: z.number().int().min(1).max(100000),
        price: z.number().int().min(0).max(10000000),
        storeCost: z.number().int().min(0).max(10000000).default(0),
        termSessionIds:z.array(id).max(52).default([]),
        customerPurchasable: z.boolean().default(true),
        allowShared: z.boolean().optional(),
        validDays: z.number().int().min(1).max(3650),
        isActive: z.boolean().default(true),
        unit: z.enum(["POINT", "SESSION"]).default("POINT"),
        musicBonusLessons:z.number().int().min(0).max(1000).default(0),
        musicTermSizes:z.array(z.number().int().min(1).max(1000)).max(100).default([]),
        musicTerms:z.number().int().min(1).max(100).nullable().default(null),
        templateIds: z.array(id).max(200).default([]),
      });

export const coursePlanReceipt=z.object({expectedStoreId:id,requestKey:z.string().uuid()});
export const coursePlanSaveInput=coursePlanValues.extend({expectedSnapshot:z.string().max(COURSE_PLAN_SNAPSHOT_MAX).optional()}).merge(coursePlanReceipt).refine(row=>!row.id||!!row.expectedSnapshot);
/** Presentation metadata captured with a confirmed save; never accepted as write authority. */
export const coursePlanCatalogTemplate=z.object({
 id,name:z.string(),category:z.string(),isActive:z.boolean(),durationMinutes:z.number().int(),
 musicSubjectId:id.nullable(),classType:z.string().nullable(),musicTeacherShare:z.number().nullable(),
 musicPricePerLesson:z.number().nullable(),musicTermLessons:z.number().nullable(),musicValidityDaysPerTerm:z.number().nullable(),
 musicTrialMode:z.string().nullable(),musicScheduleMode:z.string().nullable(),
});
export type CoursePlanCatalogTemplate=z.infer<typeof coursePlanCatalogTemplate>;
export const savedCoursePlan=coursePlanValues.omit({musicSetup:true}).extend({sportsMode:z.enum(["LEGACY","ASSIGNED","OPEN","SUBJECTS"]).optional(),sportsSubjectId:id.nullable().optional(),sportsSubjectIds:z.array(id).max(200).optional(),sportsCost:z.number().int().min(1).max(10000).nullable().optional(),id,catalogTemplates:z.array(coursePlanCatalogTemplate).max(200).optional(),lowBalanceEnabled:z.boolean(),lowBalanceThreshold:z.number().nullable()});
