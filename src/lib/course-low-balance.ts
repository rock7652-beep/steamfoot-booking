import { z } from "zod";
export const courseLowBalanceSchema = z.object({
  planId: z.string().min(1), enabled: z.boolean(),
  threshold: z.number().int().min(0).max(1000000).nullable(),
}).refine(value => !value.enabled || value.threshold !== null, {message:"請先設定提醒門檻，再開啟提醒",path:["threshold"]});
export function courseCardIsLow(input:{enabled:boolean;threshold:number|null;remaining:number;held:number;closed:boolean;expiresAt:Date},now=new Date()) {
  return input.enabled && input.threshold !== null && !input.closed && input.expiresAt>now && input.remaining-input.held<=input.threshold;
}
export function courseLowBalanceBody(name:string,remaining:number,held:number,unit:string) {
  const label=unit==="SESSION"?"堂":"點";
  return `「${name}」剩餘 ${remaining} ${label}，已預約占用 ${held} ${label}，可用 ${Math.max(0,remaining-held)} ${label}。預約占用尚未正式使用額度；同張共卡成員共用此額度，各張卡分開計算。`;
}
