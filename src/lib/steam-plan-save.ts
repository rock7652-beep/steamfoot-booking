import {z} from "zod";
import {createPlanSchema,updatePlanSchema} from "@/lib/validators/plan";
const receipt=z.object({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid()});
export const steamPlanSaveInput=z.discriminatedUnion("operation",[
  z.object({operation:z.literal("CREATE"),values:createPlanSchema}),
  z.object({operation:z.literal("UPDATE"),id:z.string().min(1).max(100),values:updatePlanSchema.extend({expectedUpdatedAt:z.string().datetime()})}),
]).and(receipt);
export const savedSteamPlan=z.object({
  id:z.string(),storeId:z.string(),name:z.string(),category:z.enum(["TRIAL","SINGLE","PACKAGE"]),price:z.number(),sessionCount:z.number(),validityDays:z.number().nullable(),description:z.string().nullable(),sortOrder:z.number(),isActive:z.boolean(),publicVisible:z.boolean(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),_count:z.object({wallets:z.number()}),
});
