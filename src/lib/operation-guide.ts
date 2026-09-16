/** First batch: time-slot booking module only. Source reviewed at 44c1f1f0.
 * Browser verification and screenshots remain pending; preview only.
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
    important: "本次備註最多 500 字，只用於這筆預約；看到儲存成功提示才算完成。",
    keywords: "備註 本次備註 註記 晚到 修改 留言",
    path: "預約管理 → 點選預約 → 本次備註",
    steps: [
      "點開要記錄的預約，找到「本次備註」；沒有內容時會顯示「尚無本次備註」。",
      "點「＋新增」或「編輯」，輸入這次預約需要提醒的事情。",
      "確認文字無誤後，點「儲存」。",
    ],
    details: [
      "最多 500 字，僅適用這次預約。例如：今天會晚到 10 分鐘。顧客長期的服務需求請與顧客服務備註區分。",
      "清空內容再儲存可移除本次備註；編輯時按「取消」會放棄這次修改。",
      "服務完成後仍可修正本次備註，不會因此改變預約狀態或結帳。修改需要預約編輯權限，並受門市與訂閱狀態限制。",
      "如果儲存失敗，請保留編輯畫面中的內容，確認錯誤後重試；成功提示出現前不要當作已儲存。",
    ],
    success: "出現「已儲存本次備註」，並顯示儲存後的文字。",
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
import type { GuideAccess, OperationGuide } from "./operation-guide-types";
export { guideCategories };
export const operationGuides: OperationGuide[] = [
  ...bookingGuides.map((guide): OperationGuide => ({ ...guide, category: "booking", modules: ["steamfoot"], permission: "booking.update", feature: null, sources: ["src/app/(dashboard)/dashboard/bookings/booking-detail-drawer.tsx"], verification: "source-reviewed" })),
  ...additionalGuides,
];
export function availableGuides(access: GuideAccess) {
  return operationGuides.filter(g => g.modules.includes(access.module) &&
    (!g.permission || access.permissions.includes(g.permission)) &&
    (!g.feature || access.features[g.feature] === true));
}
export function guideCategoryForPath(pathname: string) {
  const path = pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)/, "");
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
    const text = [g.title, g.summary, g.keywords, g.path, ...g.steps, g.important, ...g.details].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
