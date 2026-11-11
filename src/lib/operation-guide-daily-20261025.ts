import type { OperationGuide } from "./operation-guide-types";

export const dailyOperationGuides20261025: OperationGuide[] = [
  {
    id: "C177",
    category: "hours",
    title: "如何設定開放選課與指定學員？",
    summary: "開放選課與指定學員是兩個獨立排課模式；關閉其中一個不會取消既有課表、方案、帳務或候補順位。",
    answer: "到營業與預約的排課模式分別切換；儲存後重新核對兩個開關，排課畫面只會提供目前開啟的模式。",
    keywords: "關閉模式 收費表單 保留輸入 排課模式 開放選課 指定學員 自由選課 固定學員 關閉模式 恢復排課 候補 自動遞補 混合排課 同時安排固定學員 剩餘名額 純指定不限名額 混合課總容量 純指定不限名額 混合課總容量",
    path: "設定 → 營業與預約 → 排課模式",
    steps: [
  "分別核對開放選課與指定學員；兩者可以同時開啟，也可只開啟其中一項。",
  "調整需要的模式並儲存；看到已儲存後重新開啟設定，確認兩個值各自保持。",
  "回到新增排課，確認只顯示已開啟的模式；需要恢復時回設定開啟對應模式。",
  "音樂／運動的一般課可選開放選課，再勾「同時安排固定學員」；先填總名額、再指定固定學員，剩餘名額供自由選課。此選項須兩種模式同時開啟。"
],
    important: "切換不會取消舊課、重排候補、改方案額度或發通知；自行預約、請假與改期仍由各自開關及課堂規則決定。",
    success: "兩個開關顯示正確狀態，新增排課只提供已開啟的模式，既有課堂與紀錄仍保留。",
    details: [
  "模式關閉後，新增排課與相關教學項目／收費表單依最新設定顯示；切換設定時保留其他輸入。若舊頁送出被拒絕，重新核對模式，不重建資料繞過限制。",
  "關閉開放選課後不能再新增該模式課程，會員也不能新增選課或加入候補；既有課堂及候補紀錄保留，恢復開啟不會立即批次補跑候補。",
  "關閉指定學員後不能再新增該模式排課；既有固定課堂仍可查看，並依原規則處理請假、補課與更正。",
  "排課精靈會隱藏未開啟的模式，後端仍會再次檢查，不能用舊頁面繞過設定。空間租借另依租借規則。",
  "若顯示已儲存但畫面仍在同步，先重新開啟核對目前值；結果未確認前不要連續切換。",
  "混合課的固定名單與自由選課共用總名額；固定系列會延續名單，固定學員請假只釋出該名額，不會關閉整堂開放課。教師請假與停課沿用原規則。",
  "運動原固定名單按同項目指定方案點名，自由選課按通用卡與項目扣點；音樂各自核對個人方案。固定學員取消後重新自行選課是新的自由預約，不沿用原固定權益。",
  "純指定學員課不限名額；開放選課及混合課仍依課程總名額，不能因有固定學員就視為無上限。兩種模式開關與學員／交易權限仍分開核對。"
],
    modules: ["course"],
    permission: "business_hours.manage",
    feature: null,
    sources: [
  "src/components/admin/course-scheduling-mode-settings.tsx",
  "src/server/actions/course-scheduling-modes.ts",
  "src/app/(dashboard)/dashboard/courses/music-schedule-wizard.tsx",
  "src/server/services/course-booking.ts",
  "src/components/admin/course-fixed-learners-toggle.tsx",
  "src/app/(dashboard)/dashboard/courses/sports-schedule-fields.tsx",
  "src/server/actions/course.ts",
  "src/lib/sports-entitlement.ts"
],
    verification: "source-reviewed",
    kind: "howto",
  },
];
