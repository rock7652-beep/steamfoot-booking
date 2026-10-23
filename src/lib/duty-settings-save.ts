import {z} from "zod";
export const dutySettingsSaveInput=z.object({enabled:z.boolean(),expectedEnabled:z.boolean(),expectedStoreId:z.string().min(1).max(100),requestKey:z.string().uuid()});
export const savedDutySettings=z.object({enabled:z.boolean()});
