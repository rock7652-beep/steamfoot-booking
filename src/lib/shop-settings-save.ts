import { z } from "zod";

export const paymentSettingsValues=z.object({
  bankName:z.string().trim().max(100).nullable(),
  bankCode:z.string().trim().max(20).nullable(),
  bankAccountNumber:z.string().trim().max(50).nullable(),
  lineOfficialId:z.string().trim().max(100).regex(/^$|^@[A-Za-z0-9._-]+$/,"請填寫 @ 開頭的官方 LINE ID").nullable(),
  lineOfficialUrl:z.string().trim().max(500).nullable(),
});
export const trialSettingsValues=z.object({
  trialEnabled:z.boolean(),trialDefaultPrice:z.number().int().min(0).max(1000000),
  trialAllowPriceEdit:z.boolean(),trialMinPrice:z.number().int().min(0).max(1000000),trialMaxPrice:z.number().int().min(0).max(1000000),
}).refine(d=>d.trialMinPrice<=d.trialDefaultPrice&&d.trialDefaultPrice<=d.trialMaxPrice,"預設體驗金額須介於最低與最高價格");
const receipt=z.object({expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid(),expectedRevision:z.string().min(1).max(10000)});
export const shopSettingsSaveInput=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("PAYMENT"),values:paymentSettingsValues}),
  z.object({kind:z.literal("TRIAL"),values:trialSettingsValues}),
]).and(receipt);
export const savedPaymentSettings=z.object({values:paymentSettingsValues,revision:z.string()});
export const savedTrialSettings=z.object({values:trialSettingsValues,revision:z.string()});
export function paymentSettingsRevision(row:unknown){return JSON.stringify(paymentSettingsValues.parse(row));}
export function trialSettingsRevision(row:unknown){return JSON.stringify(trialSettingsValues.parse(row));}
