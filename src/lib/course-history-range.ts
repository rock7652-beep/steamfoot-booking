import { z } from "zod";
import { dayRange, parseTaipeiDateTime } from "@/lib/date-utils";
export function courseHistoryRange(input: unknown) {
  const date=z.string().refine(v=>!v || !!parseTaipeiDateTime(v,"00:00"),"日期格式錯誤");
  const value=z.object({from:date.optional(),to:date.optional()}).parse(input);
  if(value.from && value.to && value.from>value.to)throw new Error("開始日期不可晚於結束日期");
  return {...(value.from ? {gte:dayRange(value.from).start}:{}),...(value.to ? {lte:dayRange(value.to).end}:{})};
}
