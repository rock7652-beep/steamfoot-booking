import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AuditChanges } from "@/components/audit-changes";
import { auditActionLabel, auditChanges, auditSummary, auditValue, auditSnapshotTarget } from "@/lib/audit-presentation";

describe("human-readable audit presentation", () => {
  it("explains actual actions, including old logs without summaries", () => {
    expect(auditSummary({action:"SERVICE_NOTE_UPDATED",targetType:"Customer"})).toBe("修改顧客服務備註 · 顧客資料");
    expect(auditSummary({action:"ADJUST_CHECKOUT_METHOD",targetType:"Booking",summary:"Booking ADJUST_CHECKOUT_METHOD"})).toContain("調整結帳方式");
    expect(auditActionLabel("HQ_VIEW_STORE")).toBe("申請切換店家檢視");
    expect(auditActionLabel("HQ_VIEW_ALL_STORES")).toContain("申請");
  });
  it("combines the action with the recognizable record without technical names or repeated context", () => {
    expect(auditSummary({action:"CANCEL",targetType:"SpaBooking",summary:"取消服務預約"},"服務預約 · 吳小姐 · 全身芳療 · 2026-10-07 10:00（目前資料）")).toBe("取消服務預約：吳小姐 · 全身芳療 · 2026-10-07 10:00（目前資料）");
    expect(auditSummary({action:"UPDATE",targetType:"Customer"},"顧客資料 · 小華")).toBe("修改顧客資料：小華");
    expect(auditSummary({action:"INVENTORY_WRITE",targetType:"InventoryOrder",summary:"建立銷貨單"},"進銷貨單 · 銷貨 · 小華 · 2026-10-07")).toBe("建立銷貨單：銷貨 · 小華 · 2026-10-07");
    expect(auditSummary({action:"HQ_VIEW_STORE",targetType:"StoreView",summary:"切換總部店家檢視請求「蒸足店」"},"店家檢視 · 蒸足店（目前資料）")).toBe("切換總部店家檢視請求「蒸足店」");
    expect(auditSummary({action:"UPDATE",targetType:"Customer"},"顧客資料 · 舊紀錄未保存辨識內容，或資料已移除")).toBe("修改顧客資料（資料未記錄）");
  });
  it("shows before and after with real labels, amounts and state meanings", () => {
    expect(auditChanges({usedSessions:10,paymentMethod:"CASH",role:"STAFF"},{usedSessions:8,paymentMethod:"TRANSFER",role:"MANAGER"})).toEqual([
      {label:"已使用堂數",before:"10",after:"8"}, {label:"付款方式",before:"現金",after:"轉帳"}, {label:"人員身分",before:"門市人員",after:"店長"},
    ]);
    expect(auditValue("amount",1500)).toBe("NT$ 1,500");
    expect(auditValue("paymentMethod","CARD")).toBe("刷卡");
    expect(auditValue("bookingKind","CARD")).toBe("方案扣點");
  });
  it("does not expose IDs, unknown enum keys, field keys or nested JSON", () => {
    const html = renderToStaticMarkup(createElement(AuditChanges,{ before:{customerId:"foreign-secret-id",futureField:{detailCode:"RAW_ENUM"}},after:{customerId:"other-secret-id",futureField:{detailCode:"NEW_ENUM"},status:"FUTURE_STATUS"} }));
    for (const raw of ["foreign-secret-id","other-secret-id","futureField","detailCode","RAW_ENUM","NEW_ENUM","FUTURE_STATUS"]) expect(html).not.toContain(raw);
    expect(html).toContain("舊紀錄未保存名稱");
    expect(html).toContain("部分異動內容未保存");
  });
  it("uses authorized names and permission explanations", () => {
    expect(auditValue("customerId","x",{"customerId:x":"小華（目前姓名）"})).toBe("小華（目前姓名）");
    expect(auditValue("permissions",["audit.read","future.permission"],{"permission:audit.read":"查看操作紀錄"})).toBe("查看操作紀錄、1 項權限未保存中文說明");
    expect(auditValue("granted",["future.a","future.b"])).toBe("2 項權限未保存中文說明");
    expect(auditValue("permissions",{"audit.read":true},{"permission:audit.read":"查看操作紀錄"})).toBe("查看操作紀錄：允許");
    expect(auditValue("viewedStoreId","__all__")).toBe("總部全部店家");
  });
  it("keeps snapshots and does not invent missing history", () => {
    expect(auditSnapshotTarget({targetType:"CourseBooking",action:"CREATE",afterJson:{customerName:"小華"}})).toContain("小華");
    expect(auditSnapshotTarget({targetType:"Booking",action:"CREATE"})).toBeNull();
    expect(renderToStaticMarkup(createElement(AuditChanges,{before:null,after:null}))).toContain("未保存異動內容");
    expect(auditChanges({status:"ACTIVE"},{status:"ACTIVE"})).toEqual([]);
  });
  it("shows only added and removed permissions and does not invent a missing baseline", () => {
    const references={"permission:customer.read":"查看顧客","permission:audit.read":"查看操作紀錄","permission:report.export":"匯出報表"};
    expect(auditChanges({permissions:["customer.read","audit.read"]},{permissions:["customer.read","report.export"]},references)).toEqual([
      {label:"新增權限",before:"",after:"匯出報表"},
      {label:"取消權限",before:"",after:"查看操作紀錄"},
    ]);
    expect(auditChanges({granted:["audit.read"],denied:["report.export"]},{granted:["report.export"],denied:["audit.read"]},references)).toHaveLength(2);
    expect(auditChanges({permissions:{"audit.read":true,"report.export":false}},{permissions:{"audit.read":false,"report.export":true}},references)).toHaveLength(2);
    expect(auditChanges([],{granted:["audit.read"],storeId:"own"},references)).toEqual([{label:"",before:"",after:"未保存異動內容"}]);
    expect(auditSummary({action:"UPDATE",targetType:"StaffPermission"},"人員權限 · 黃店長（目前資料）")).toBe("調整黃店長的權限（目前姓名）");
    const html=renderToStaticMarkup(createElement(AuditChanges,{before:{permissions:["customer.read","audit.read"]},after:{permissions:["customer.read","report.export"]},references}));
    expect(html).not.toContain("查看顧客");
    expect(html).toContain("新增權限");
    expect(html).not.toContain("異動前");
  });
  it("redacts nested credentials and handles unknown summaries without code fallback", () => {
    expect(auditValue("lines",[{name:"商品 A",password:"private"}])).not.toContain("private");
    expect(auditSummary({action:"FUTURE_ACTION",targetType:"FutureTarget",summary:"FutureTarget FUTURE_ACTION"})).not.toMatch(/FUTURE_ACTION|FutureTarget/);
    expect(auditSummary({action:"UPDATE",targetType:"Customer",summary:"修改顧客 11111111-2222-3333-4444-555555555555 FUTURE_ENUM"})).not.toMatch(/11111111|FUTURE_ENUM/);
  });
});
