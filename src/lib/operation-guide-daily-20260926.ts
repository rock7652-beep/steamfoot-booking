import type { OperationGuide } from "./operation-guide-types";

/** Source review at b0afa71d. No logged-in operation acceptance is implied. */
export const dailyOperationGuides20260926: OperationGuide[] = [
  {
    id: "C142", category: "money", title: "確認收入後，如何手動通知人員到 LINE 查看？",
    summary: "先開放本人查詢、確認目前月結版本，再核對名單及訊息預覽後手動發送。",
    answer: "確認月結不會自動通知；由店長展開「通知人員」另外處理。",
    path: "每月收入結算 → 通知人員", keywords: "LINE 月結通知 通知人員 更新名單 訊息預覽 可重試 未完成綁定 需核對 已通知",
    steps: ["確認已開放本人收入查詢，且本月金額為已確認、沒有新異動。", "展開通知人員，查看名單與訊息預覽，核對可通知、已通知及需綁定人數。", "核對後點「發送 LINE 通知」；完成後看各人狀態，連線中斷先按「更新名單」再決定是否重試。"],
    important: "LINE 只提醒登入查看，不代表款項已入帳；隔離預覽顯示「預覽模式，不會發送」時不能送出真實通知。",
    details: ["僅店長且具報表查看權限、月結及 LINE 提醒功能、可寫訂閱狀態可操作；另受每月提醒額度限制。", "人員須在本次已確認月結內、在職且完成本店帳號與可用 LINE 綁定。查詢開關關閉或版本已變動時，先處理提示，不直接重送。", "同一確認版本已通知者不再發送；可重試者沿用原通知，處理中先等候。顯示需核對、帳號綁定變更或超過安全重試期限時不能自行強制重送。", "首次嘗試滿 23 小時即不再安全重送；重新確認的版本另行核對名單，不為了重送而製造新版本。"],
    success: "能核對每位通知狀態；已通知不等於對方已閱讀或完成簽收。",
    modules: ["course"], permission: "report.read", feature: "service_fee_calculator", kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-notifications.tsx", "src/server/actions/course-monthly-notification.ts", "src/server/services/course-monthly-notification.ts", "src/lib/course-monthly-notification.ts"],
  },
  {
    id: "E13", category: "money", title: "蒸足月結的服務收入與空間租金，為什麼分開顯示？",
    summary: "服務收入按已完成服務核對，租金按完整租期顯示，不互相扣抵。",
    answer: "從營運的月結管理入口選月份，分開核對每位人員的服務收入與租金約定。",
    path: "營運 → 月結管理 → 選月份", keywords: "蒸足 月結管理 服務收入 空間租金 租期 本期 不扣抵 舊版月結",
    steps: ["由有月結功能及報表權限的店長／總部管理員，從營運點「月結管理」。", "選月份，核對人員、本月服務收入及空間租金約定，再展開明細查日期、顧客、服務人員與方案。", "待核對項目先查原因；需要原本店舖月結時，使用底部「舊版店舖月結與紀錄」。"],
    important: "租金與服務收入不相減，也不合計成應付；這張表不代表已收租金或已付人員收入。",
    details: ["服務收入沿用已完成服務與收益歸屬規則，方案依實收與堂數核對；不是把當月收款交易直接當服務收入。", "例如半年租期每月 5,000 元，同一期內各月份都顯示該期 30,000 元，不是每月新增一筆 30,000 元應收。", "尚未建立租期會提示待設定，系統不猜測舊每月租金的起始日；人員停用也不等於取消既有租金約定。", "歸店家或未指定人員的服務另列；新月結不自動收付款或發送通知，跨店檢視不可修改租金。"],
    success: "收入可對回服務，租金可對回完整租期，不重複累加同一期金額。",
    modules: ["steamfoot"], permission: "report.read", feature: "service_fee_calculator", kind: "explanation", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/revenue/page.tsx", "src/app/(dashboard)/dashboard/service-fee-calculator/steamfoot-monthly.tsx", "src/server/queries/steamfoot-monthly.ts", "src/server/queries/staff-settlement.ts", "src/lib/steamfoot-rent.ts"],
  },
  {
    id: "E14", category: "staff", title: "空間租金如何設定、調整或停止收取？",
    summary: "在人員管理設定租期及每月金額；已開始的租期保留，新約定從下一個完整租期生效。",
    answer: "租金設定只保存約定，不會自動收款、記一筆支出或從服務收入扣除。",
    path: "人員管理 → 人員 → 空間租金設定", keywords: "空間租金 租期 每期月數 每月租金 停止收租 下一個完整租期 1 3 6 12 個月",
    steps: ["核對本店人員，開啟空間租金設定，查看既有約定紀錄。", "首次填租期起始月、每期 1／3／6／12 個月及每月正整數金額，再點「儲存租金約定」。", "調整時依畫面選下一個完整租期的起始月；停止收租則取消勾選「收取空間租金」，核對生效月後儲存。"],
    important: "不能回寫已開始租期的單價；停用人員不會自動停止租約。停止收租也須接在完整租期邊界。",
    details: ["首次可填歷史起始月份；已有約定則不能任意從當月中途生效。約定按所選週期持續，舊紀錄保留。", "限蒸足模組、店長／總部管理員及人員管理權限，跨店唯讀不可寫入；一般店長不能管理店主人員或總部管理員的租金。", "若提示設定已更新，重新整理核對新紀錄，不覆蓋別人的變更。舊 monthlySpaceFee 與舊版租金紀錄不會由此改寫。"],
    success: "看到已儲存提示及新的約定紀錄，月結依適用租期顯示金額。",
    modules: ["steamfoot"], permission: "staff.manage", feature: null, kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/staff/[id]/rent/page.tsx", "src/app/(dashboard)/dashboard/staff/[id]/rent/rent-form.tsx", "src/server/actions/steamfoot-rent.ts", "src/lib/steamfoot-rent.ts"],
  },
];
