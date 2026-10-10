import { z } from "zod";
import { musicSubjectRuleSchema } from "@/lib/music-subject-rule";
const id=z.string().min(1).max(100);
export const coursePlanValues = z
      .object({
        id: id.optional(),
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
export const coursePlanSaveInput=coursePlanValues.extend({expectedSnapshot:z.string().max(30000).optional()}).merge(coursePlanReceipt).refine(row=>!row.id||!!row.expectedSnapshot);
export const savedCoursePlan=coursePlanValues.omit({musicSetup:true}).extend({id,lowBalanceEnabled:z.boolean(),lowBalanceThreshold:z.number().nullable()});
