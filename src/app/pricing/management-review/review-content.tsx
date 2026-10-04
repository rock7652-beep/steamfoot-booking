"use client";

import { StaffWorkspace, type StaffWorkspacePerson } from "@/app/(dashboard)/dashboard/staff/staff-workspace";
import { CourseStaffWorkspace } from "@/app/(dashboard)/dashboard/courses/staff-workspace";
import { StaffScheduleWorkspace } from "@/app/(dashboard)/dashboard/spa-staff/workspace";
import { BusinessAnalyticsView } from "@/app/(dashboard)/dashboard/courses/business-analytics-view";
import { PerformanceTrendChart } from "@/app/(dashboard)/dashboard/reports/performance-trend-chart";
import ReportDateRange from "@/components/report-date-range";
import { RevenueMixTrend } from "@/components/revenue-mix-trend";
import type { CourseBusinessReport } from "@/server/queries/course-business-analytics";

const people: StaffWorkspacePerson[] = Array.from({ length: 24 }, (_, i) => ({
  id: `rwd-person-${i}`, userId: `rwd-user-${i}`, displayName: `驗收人員 ${i + 1}・跨店芳療與音樂教學長姓名測試`, legalName: `驗收姓名 ${i + 1}`,
  roleLabel: "芳療師", email: `long-name-staff-${i}@example.invalid`, phone: "0912345678", colorCode: "#427663", status: "ACTIVE", customerCount: 25,
  specialties: "身體芳療、頭部與肩頸舒壓", specialtyKeys: ["body", "head"], emergencyContact: { name: "驗收緊急聯絡人", relation: "家人", phone: "0912345678" },
  weeklyAvailability: [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }], scheduleExceptions: [], canEdit: true, canResetPassword: false, compensationMode: "PERCENTAGE", compensationValue: 50,
}));
const coursePeople = people.map(p => ({ id: p.id, name: p.displayName, kind: "coach" as const, email: p.email, contactEmail: p.email, phone: p.phone!, emergencyContactName: "驗收家人", emergencyContactPhone: "0912345678", emergencyContactRelation: "家人", birthday: "", assignments: [], active: true, memberEnabled: false, permissions: [], customerId: "", coachLoginReady: false, coachEnabled: true, qualificationIds: [], qualificationsConfirmed: false }));
const visitors = people.map(p => ({ id: p.id, name: p.displayName, managerId: null, visits: 3 }));
const segments = { newVisitors: visitors, oldVisitors: [], returned: visitors, notReturned: [], trial: visitors, newCard: visitors, renewal: [], converted: visitors, unconverted: [], tracked: [], visitors };
const months = Array.from({length: 6}, (_, i) => ({date: `2026-${String(i + 5).padStart(2, "0")}`, available: true, attendance: 40 + i * 5, trial: 24, newCard: 12, renewal: 8, revenue: 10000 + i * 3000 }));
const report: CourseBusinessReport = {
  pendingProfit: [], pendingFees: [], scope: {view: "store", person: "all"}, range: {startDate: "2026-10-01", endDate: "2026-10-31"},
  staff: people.map(p => ({id: p.id, displayName: p.displayName, courseCoachEnabled: true, user: {role: "PARTNER"}})),
  coverageStart: "2026-05-01", effectiveEndDate: "2026-10-04", comparison: null, monthlyTrend: months, retentionBase: 24, retentionRate: 100, retentionRange: {startDate: "2026-09-01", endDate: "2026-09-30"},
  counts: {newVisitors: 24, oldVisitors: 0, returned: 24, notReturned: 0, trial: 24, newCard: 24, renewal: 0, converted: 24, unconverted: 0, tracked: 0, visitors: 24},
  segments, eligibleTrials: 24, conversionRate: 100, sessions: 3, hours: 3, attendance: 72, fee: null, missingFees: 0, profit: null, knownProfit: 0, missingProfit: 0, netRevenue: 25000,
  trend: Array.from({length: 4}, (_, i) => ({date: `2026-10-0${i + 1}`, attendance: 18, trial: 6, newCard: 6, renewal: 0, revenue: 6250})),
};

export function ManagementReviewContent({variant}: {variant: string}) {
  if (variant === "analysis") return <div className="min-w-0 space-y-4">
    <h1 className="admin-page-title">分析</h1>
    <ReportDateRange activePreset="custom" startDate="2026-10-01" endDate="2026-10-31" />
    <BusinessAnalyticsView data={report} all />
    <PerformanceTrendChart data={months.map(m => ({month: m.date, label: m.date, trialAttendees: 24, convertedCustomers: 12, conversionRate: 50, completedServices: m.attendance, revenue: m.revenue, retailRevenue: 0}))} />
    <RevenueMixTrend points={months.map(m => ({key: m.date, label: m.date, packageRevenue: m.revenue, retailRevenue: 0, otherRevenue: 0, refunds: 0, expense: 2000, netRevenue: m.revenue, balance: m.revenue - 2000}))} />
  </div>;
  if (variant === "music" || variant === "fitness") return <CourseStaffWorkspace staff={coursePeople} maxStaff={null} templates={[]} customers={[]} canManage permissionGroups={[]} music={variant === "music"} accountKind="coach" feeEnabled={false} canEditFees={false} />;
  if (variant === "spa") return <StaffScheduleWorkspace people={people.map(p => ({id: p.id, name: p.displayName, phone: p.phone ?? undefined, editable: true, memberLinked: true, treatmentIds: ["rwd-service"], shifts: [{dayOfWeek: 1, startTime: "09:00", endTime: "18:00"}]}))} services={[{id: "rwd-service", name: "驗收長名稱服務・頭部肩頸舒壓與芳療"}]} exceptions={[]} month="2026-10" today="2026-10-04" />;
  return <StaffWorkspace people={people} today="2026-10-04" canManage showSpaCompensation createAction={() => { throw new Error("驗收頁不送出新增資料"); }} />;
}
