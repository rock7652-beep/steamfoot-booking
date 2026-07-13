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
  "monthly-converted": { title: "本月開卡顧客", description: "體驗完成當天成功開卡的顧客。" },
  "monthly-unconverted": { title: "本月體驗未開卡", description: "本月完成體驗但未於當天開卡的顧客。" },
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
  if (segment === "monthly-converted" || segment === "monthly-unconverted") {
    return getConversionCustomers(storeId, month, segment as ConversionCustomerSegment);
  }
  if (segment === "monthly-returned" || segment === "monthly-not-returned") {
    return getRetentionCustomers(storeId, month, segment);
  }
  return getCustomerFlowCustomers(storeId, month, segment as CustomerFlowSegment);
}
