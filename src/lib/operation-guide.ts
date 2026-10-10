/** First batch: time-slot booking module only. Source reviewed at 44c1f1f0.
 * The guide is released; article interaction verification remains separate.
 */
export const bookingGuides = [
  {
    id: "A01",
    title: "顧客想改時間，怎麼處理？",
    summary: "調整原預約的日期與時段，不必重新新增。",
    important: "已完成或已取消的預約不能直接改時間。改好後，請另與顧客確認新時間。",
    keywords: "改期 改時間 換時間 更改日期",
    path: "預約管理 → 點選預約 → 改時間",
    steps: [
      "在預約管理選日期，點開要調整的預約，核對顧客與原時間。",
      "點「改時間」，選新的日期與可用時段。",
      "核對新的日期與時段，點「確認」。",
    ],
    details: [
      "新時段必須開放、尚未過時，而且剩餘容量足夠容納這筆預約的人數。公休或尚未設定營業時間的日期不能改入。",
      "已完成或已取消的預約不能直接改時間。跨店查看模式不能操作，請由該店處理；修改也受帳號權限與訂閱狀態限制。",
      "這個操作調整原預約，不必另外新增一筆。成功後舊時段釋出容量，新時段占用容量。",
      "目前這個後台改時間流程沒有直接發送改期通知，請另與顧客確認新時間。",
    ],
    success: "出現「已改期」，原預約顯示新的日期與時段。",
  },
  {
    id: "A02",
    title: "顧客不來了，怎麼取消預約？",
    summary: "確認取消方式，以及堂數與款項如何處理。",
    important: "取消預約不等於退費，已收款項需要另外核對處理。",
    keywords: "取消 刪除 退堂 退費 補課",
    path: "預約管理 → 點選預約 → 取消預約",
    steps: [
      "點開預約，核對顧客、日期、時間與目前狀態。",
      "點「取消預約」，再次確認要取消的是這筆預約。",
      "在確認視窗確認取消。",
    ],
    details: [
      "已完成的預約不能直接取消；已取消的預約不用再取消。畫面上的操作會依預約狀態顯示。",
      "取消會釋放該筆預約保留的堂數；補課預約會退回使用的補課券。這不表示延長原方案或補課券的效期。",
      "顧客自行取消受開課前 12 小時限制；此題說明的是店家後台操作。跨店查看模式請由該店處理。",
      "目前這個後台取消流程沒有直接發送取消通知，請另與顧客確認。",
    ],
    success: "出現「已取消預約」，該筆預約狀態為已取消。",
  },
  {
    id: "A03",
    title: "這次預約有事情要交代，怎麼記錄？",
    summary: "新增或修改本次備註，保留這次服務的提醒。",
    important: "本次備註最多 500 字，只用於這筆預約；需完成儲存並核對文字，草稿不算完成。",
    keywords: "備註 本次備註 註記 晚到 修改 留言 原列編輯 全文 標籤 草稿 取消 資料已有更新",
    path: "預約管理 → 當日清單 → 該列本次備註鉛筆；預約明細 → 本次備註",
    steps: ["在當日清單核對顧客與預約，點該列本次備註鉛筆，原地展開編輯；也可從原預約明細編輯。", "輸入本次提醒後點「儲存」；有未儲存內容時，取消或 Escape 會先詢問是否捨棄。", "成功後核對原列文字；摘要截斷時點標籤與備註區查看全文，完成後關閉返回原清單。"],
    details: ["本次備註最多 500 字，僅適用這次預約；長期提醒請在顧客資料維護。原列鉛筆不會開啟整筆預約明細。", "清空並儲存可移除備註；Enter 用於換行，不能代替儲存。未儲存草稿只暫存在目前帳號、門市與瀏覽器的範圍，不代表已寫入。", "蒸足完成後仍可修正備註；需預約編輯權限並受門市及訂閱狀態限制，不能照搬到 SPA 已完成預約。", "失敗時保留內容並核對錯誤；遇資料已更新時先看目前備註，確認需保留自己的輸入後再儲存，不直接覆蓋。"],
    success: "原列編輯成功後收合並顯示新文字；預約明細流程會出現「已儲存本次備註」提示。",
  },
] as const;

export type GuideContext = "booking-list" | "booking-detail" | "general";

export function searchBookingGuides(query: string, bookingStatus?: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const guides = bookingStatus === "COMPLETED" || bookingStatus === "CANCELLED"
    ? [bookingGuides[2], bookingGuides[0], bookingGuides[1]]
    : bookingGuides;
  return guides.filter((guide) => {
    const text = `${guide.title} ${guide.summary} ${guide.keywords} ${guide.path}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

import { additionalGuides, guideCategories } from "./operation-guide-catalog";
import { courseOperationGuides } from "./course-operation-guides";
import { courseBasicOperationGuides } from "./course-basic-operation-guides";
import { dailyOperationGuides20260925 } from "./operation-guide-daily-20260925";
import { dailyOperationGuides20260926 } from "./operation-guide-daily-20260926";
import { dailyOperationGuides20260927 } from "./operation-guide-daily-20260927";
import { dailyOperationGuides20260928 } from "./operation-guide-daily-20260928";
import { dailyOperationGuides20260929 } from "./operation-guide-daily-20260929";
import { dailyOperationGuides20260930 } from "./operation-guide-daily-20260930";
import { dailyOperationGuides20261001 } from "./operation-guide-daily-20261001";
import { dailyOperationGuides20261003 } from "./operation-guide-daily-20261003";
import { dailyOperationGuides20261004 } from "./operation-guide-daily-20261004";
import { dailyOperationGuides20261006 } from "./operation-guide-daily-20261006";
import { dailyOperationGuides20261007 } from "./operation-guide-daily-20261007";
import { dailyOperationGuides20261009 } from "./operation-guide-daily-20261009";
import { dailyOperationGuides20261010 } from "./operation-guide-daily-20261010";
import type { GuideAccess, OperationGuide } from "./operation-guide-types";
export { guideCategories };
const catalogGuides: OperationGuide[] = [
  ...bookingGuides.map((guide): OperationGuide => ({ ...guide, kind: "howto", answer: guide.summary, category: "booking", modules: ["steamfoot"], permission: "booking.update", feature: null, sources: guide.id === "A03" ? ["src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx", "src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx", "src/components/admin/inline-roster-note.tsx", "src/server/actions/booking-note.ts"] : ["src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx", "src/server/actions/booking.ts"], verification: "source-reviewed" })),
  ...additionalGuides,
  ...courseOperationGuides,
  ...courseBasicOperationGuides,
  ...dailyOperationGuides20260925,
  ...dailyOperationGuides20260926,
  ...dailyOperationGuides20260927,
  ...dailyOperationGuides20260928,
  ...dailyOperationGuides20260929,
  ...dailyOperationGuides20260930,
  ...dailyOperationGuides20261001,
  ...dailyOperationGuides20261003,
  ...dailyOperationGuides20261004,
  ...dailyOperationGuides20261006,
  ...dailyOperationGuides20261007,
  ...dailyOperationGuides20261009,
  ...dailyOperationGuides20261010,
];

/** Historical frontend articles remain archived; backend search never returns them. */
export const retiredFrontendGuideIds = ["C09", "J17", "J19", "J20", "J21", "C101", "C125", "C136"] as const;
export const retiredFrontendOperationGuides = catalogGuides.filter(g => retiredFrontendGuideIds.some(id => id === g.id));
export const operationGuides = catalogGuides.filter(g => !retiredFrontendGuideIds.some(id => id === g.id));
import { courseDisplayText } from "./course-display-text";
export function availableGuides(access: GuideAccess) {
  const sharingRestricted = access.module === "course" && access.sharedCardState !== undefined && access.sharedCardState !== "ENABLED";
  return operationGuides.filter(g => g.modules.includes(access.module) &&
    (!g.permission || access.permissions.includes(g.permission)) &&
    (!g.additionalPermissions || g.additionalPermissions.every(p => access.permissions.includes(p))) &&
    (!g.feature || access.features[g.feature] === true) &&
    !(sharingRestricted && ["C101", "C118"].includes(g.id)))
    .map(g => sharingRestricted && g.id === "C111" ? {...g,
      keywords: g.keywords.replace(" 允許共卡", ""),
      steps: [g.steps[0], "選適用課程及「顧客可購買／僅後台指派」；固定期課需連結與堂數相同的未開始課次。", g.steps[2]],
      details: [g.details[0], "堂數卡不使用課程點數，固定期課另受指定課次限制；修改其他欄位會保留既有使用授權。"],
    } : g).map(g => access.module === "course" && access.music ? {...g,
      title: courseDisplayText(g.title, true), summary: courseDisplayText(g.summary, true),
      answer: courseDisplayText(g.answer, true), path: courseDisplayText(g.path, true),
      keywords: courseDisplayText(g.keywords, true), important: courseDisplayText(g.important, true),
      success: courseDisplayText(g.success, true), steps: g.steps.map(s => courseDisplayText(s, true)),
      details: g.details.map(s => courseDisplayText(s, true)),
    } : g);
}
export function guideCategoryForPath(pathname: string) {
  const [path, query = ""] = pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)/, "").split("?");
  if (path === "/dashboard/courses/hours") return "hours";
  if (path === "/dashboard/courses/reminders") return "care";
  if (path === "/dashboard/courses") {
    const categories: Record<string, string> = {schedule:"booking",catalog:"booking",rooms:"booking",customers:"customers",plans:"plans",analytics:"analysis",settings:"settings"};
    return categories[new URLSearchParams(query).get("view") ?? "schedule"] ?? null;
  }
  if (path === "/dashboard/guide") return null;
  if (/^\/dashboard\/customers\/[^/]+\/health(?:\/|$)/.test(path)) return "health";
  if (path.startsWith("/dashboard/growth")) return "customers";
  return guideCategories.flatMap(c => c.routes.map(route => ({ category: c.id, route })))
    .filter(({route}) => path === route || (route !== "/dashboard" && path.startsWith(route + "/")))
    .sort((a,b) => b.route.length - a.route.length)[0]?.category ?? null;
}
export function findOperationGuides(query: string, access: GuideAccess) {
  const terms = query.trim().toLocaleLowerCase().split(/[\s、，,]+/).filter(Boolean);
  return availableGuides(access).filter(g => {
    const text = [g.title, g.summary, g.answer, g.keywords, g.path, ...g.steps, g.important, ...g.details].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

/** Settings is an overview of several functions, so recommend across categories. */
export function relatedOperationGuides(pathname: string, access: GuideAccess) {
  const path = pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)/, "").replace(/\/$/, "");
  const guides = availableGuides(access);
  if (access.module === "course" && guideCategoryForPath(path) === "settings") {
    return guides.filter(g => ["hours", "care", "money"].includes(g.category));
  }
  if (path === "/dashboard/settings") {
    const ids = ["B01", "F01", "I02", "I03", "N01", "I09"];
    return ids.flatMap(id => guides.filter(g => g.id === id));
  }
  const category = access.module === "spa" && path === "/dashboard/plans" ? "spa" : guideCategoryForPath(path);
  return guides.filter(g => g.category === category);
}
