"use client";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { readMemberConnection, readCustomerPanelAdvanced, readCoursePhoneConnection, readStudentMakeups } from "@/lib/customer-support-read-client";
import { CUSTOMER_PLAN_PRELOAD_TTL } from "./customer-plan-read-policy";

// OperationScope owns account/store/permission isolation; all mutations invalidate.
export const useMemberConnectionReader = () => usePanelReader("store-member-connection", readMemberConnection, "", CUSTOMER_PLAN_PRELOAD_TTL);
export const useCustomerAdvancedReader = () => usePanelReader("customer-support", readCustomerPanelAdvanced, "", CUSTOMER_PLAN_PRELOAD_TTL);
export const useCoursePhoneReader = () => usePanelReader("course-phone-connection", readCoursePhoneConnection, "", CUSTOMER_PLAN_PRELOAD_TTL);
export const useStudentMakeupsReader = () => usePanelReader("music-student-makeups", readStudentMakeups, "", CUSTOMER_PLAN_PRELOAD_TTL);
