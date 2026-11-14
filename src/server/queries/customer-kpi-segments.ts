import {
  getCustomerFlowCustomers,
  type CustomerFlowSegment,
} from "@/server/queries/customer-flow-metrics";
import {
  getConversionCustomers,
  type ConversionCustomerSegment,
} from "@/server/queries/conversion-metrics";
import {
  getRetentionCustomers,
  type RetentionCustomerSegment,
} from "@/server/queries/retention-metrics";
import type { CustomerSegmentCustomer } from "@/server/queries/customer-segment-list";

export type CustomerKpiSegment =
  | CustomerFlowSegment
  | ConversionCustomerSegment
  | RetentionCustomerSegment;

export const CUSTOMER_KPI_SEGMENTS: Record<
  CustomerKpiSegment,
  { title: string; description: string }
> = {
  "monthly-customers": { title: "本月來客", description: "本月完成服務的唯一顧客。" },
  "monthly-new": { title: "本月新客", description: "首次完成服務發生在本月的顧客。" },
  "monthly-returning": { title: "本月舊客", description: "本月以前已有完成服務紀錄的顧客。" },
  "monthly-trial": { title: "本月體驗顧客", description: "本月完成體驗服務的唯一顧客。" },
  "monthly-conversion-trial": { title: "本月體驗顧客", description: "所選期間首次完成體驗且體驗前未購課的顧客，按人去重；與開卡人數及轉化率使用同一批顧客。" },
  "monthly-renewed": { title: "本月續購方案／課程顧客", description: "本月再次成功購買有效付費方案的顧客；同人多次續購只計一位，不限是否有體驗紀錄。" },
  "monthly-converted": { title: "本月體驗後開卡顧客", description: "所選期間的首次體驗顧客，於體驗後 30 天內首次購課；即使跨月也回計這批體驗，續購另計。" },
  "monthly-current-trial-converted": { title: "本月體驗開卡", description: "本月首次完成體驗，並於本月、體驗後 30 天內首次成功購買有效付費方案的顧客。" },
  "monthly-tracked-converted": { title: "過往體驗追蹤開卡", description: "過往月份首次完成體驗，於體驗後 30 天內、本月首次成功購買有效付費方案的顧客。" },
  "monthly-unconverted": { title: "本月體驗未開卡", description: "本月完成體驗，但截至目前仍未成功購買正式方案的顧客。" },
  "monthly-returned": { title: "本月回流顧客", description: "上月來客中，本月再次完成服務的顧客。" },
  "monthly-not-returned": { title: "本月未回流顧客", description: "上月來客中，本月尚未再次完成服務的顧客。" },
};

export function isCustomerKpiSegment(value: string | undefined): value is CustomerKpiSegment {
  return Boolean(value && value in CUSTOMER_KPI_SEGMENTS);
}

export async function getCustomerKpiSegmentCustomers(
  storeId: string,
  month: string,
  segment: CustomerKpiSegment,
): Promise<CustomerSegmentCustomer[]> {
  if (
    segment === "monthly-conversion-trial" ||
    segment === "monthly-renewed" ||
    segment === "monthly-converted" ||
    segment === "monthly-current-trial-converted" ||
    segment === "monthly-tracked-converted" ||
    segment === "monthly-unconverted"
  ) {
    return getConversionCustomers(storeId, month, segment as ConversionCustomerSegment);
  }
  if (segment === "monthly-returned" || segment === "monthly-not-returned") {
    return getRetentionCustomers(storeId, month, segment);
  }
  return getCustomerFlowCustomers(storeId, month, segment as CustomerFlowSegment);
}
