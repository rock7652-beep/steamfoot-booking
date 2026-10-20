import type { OperationGuide } from "./operation-guide-types";

export const customerConsumptionGuides: OperationGuide[] = [{
  id: "CG01", category: "customers", title: "如何找出期間內消耗最多或最少的顧客？",
  summary: "在顧客經營的期間消耗統計，依日期、收費方式與數值條件篩選，再排序及匯出名單。",
  answer: "選期間與收費方式後，依消耗次數、堂／格／點或金額排序；找最少的人可選由少到多，再填前 N 名。促銷由店家自行安排。",
  path: "顧客經營 → 期間消耗統計",
  keywords: "期間消耗統計 顧客篩選 收費方式 次數 堂數 格數 點數 扣錢 曠課 最多 最少 排名 前N名 CSV 匯出 促銷名單",
  steps: [
    "開啟期間消耗統計，選本月、上月、近 30／90 天或自訂日期，再指定收費方式；預設包含曠課／請假扣除。",
    "在排序下拉選單直接選統計項目與多到少／少到多。需要限縮名單時按「篩選」，用下拉選單選項目並填最低／最高值，必要時新增條件或設定前 N 名，再按「套用篩選」回清單。",
    "核對符合人數與名單，點顧客查看既有資料及紀錄，或展開目前方案餘額。有顧客匯出權限且已開通資料匯出時，可下載目前篩選名單。",
  ],
  important: "同一筆服務的消耗次數只算一次；購買方案只列實付，不增加消耗次數。消耗金額與實付金額可能對應同一筆服務，不能相加。",
  success: "名單符合所選期間、收費方式及全部數值條件；匯出保留期間、條件、排序與目前餘額標示。",
  details: [
    "服務消耗依服務日期計算，實付依收款日期、扣除期間退款；取消或作廢紀錄不計。無服務日期的紙本補登不推定為當期消耗。",
    "包含零消耗顧客；指定收費方式時只列有該方式方案或期間紀錄的顧客。不同單位分開顯示，不同收費方式每點或每格的價值也可能不同。",
    "目前餘額是查詢當下剩餘，不是期間末餘額，也尚未扣掉預約占用；共卡不可跨人加總。單次匯出最多一萬人，超過時請縮小條件。",
    "入口及查詢需顧客、預約、方案與交易查看權限，並沿用店家開通及員工可視範圍。活動、來店禮與聯繫由店家自行處理。",
  ],
  modules: ["steamfoot", "course"], permission: "customer.read", additionalPermissions: ["booking.read", "wallet.read", "transaction.read"],
  feature: "customer_care", kind: "howto", verification: "source-reviewed",
  sources: ["src/app/(dashboard)/dashboard/growth/consumption/page.tsx", "src/server/queries/customer-consumption.ts", "src/server/queries/customer-consumption-sql.ts", "src/app/api/export/customer-consumption-summary/route.ts"],
}];
