import type {OperationGuide} from './operation-guide-types';
export const sessionAdjustmentGuide:OperationGuide={
  "id": "PLAN-SESSION-ADJUST",
  "category": "plans",
  "title": "如何補登以前上過的課，或註銷部分堂數？",
  "summary": "從方案卡右側「⋯」選補登或部分註銷，核對日期、數量與原因；補登及註銷都會扣除額度。",
  "answer": "四模組從原方案卡「⋯」選補登已上課／已服務、註銷堂數／次數；使用紀錄選原調整可更正返還，保留原歷史。",
  "path": "顧客管理 → 學員／顧客總覽 → 方案卡右側 ⋯",
  "steps": [
    "在原方案卡「⋯」選補登或部分註銷，表單留在原卡下方；蒸足也直接提供註銷堂數，不再從逐堂明細逐一註銷。共卡選實際學員。",
    "補登填實際日期，註銷不填上課日期；共用表單原因選填，核對本次數量及剩餘預覽後確認。",
    "成功後查原卡及使用紀錄；誤補登／手動註銷選原調整「更正返還」，返還原調整數量並保留歷史。"
  ],
  "important": "補登會同步扣除額度，請先核對系統是否已扣過，避免重複扣堂。已預約占用的額度不能調整。",
  "success": "原面板顯示更新後的餘額，以及實際上課日期（補登）、操作時間與操作人員；原因未填顯示未填寫。",
  "details": [
    "蒸足已沿用共用方案管理與不可變回執；補登、部分註銷及更正只處理未綁預約的原堂次，更正返還原調整數量，不再限定每次一堂。原預約日期與操作者保留，已整份註銷不能重新啟用；不更動收款、出席或薪酬。",
    "音樂／運動／美業方案格子中，補登顯示實際上課日期；註銷以灰格顯示註銷當天日期，不計為出席，更正返還後恢復空白。顧客前台不顯示內部堂數異動清單。",
    "音樂／運動補登若同一學員、同一方案當天已有扣堂紀錄，會先提醒而不扣堂；先核對原課堂，確認是另一堂才點「確認為另一堂，仍要補登」。更改日期、堂數或既有紀錄有異動時須重新核對。",
    "四模組點方案名稱或「⋯」都在同一卡操作。尚未送出可切換操作，切換會清掉該操作未送出欄位；送出中或結果待確認時禁止換卡、搜尋、翻頁或收起歷史，保留同一編輯器及原請求重試。",
    "補登與註銷不新增收款、薪資、業績或補課權益；註銷不算出席。",
    "更正以新紀錄返還，保留原紀錄；已註銷整張的方案不能以此功能重新啟用。",
    "音樂保留購買期別與首堂效期規則；來源方案、期初匯入與補課權益仍由原專用流程核對。未確認期別時不猜測分配。",
    "結果待確認時，只重試原請求；不要另外送出相同調整。"
  ],
  "keywords": "蒸足 使用明細與更正 調整堂數 補登已上課 歷史上課 日期 單堂註銷 註銷堂數 原因選填 更正返還 原面板 不跳頁 音樂 運動 美業 更多操作 使用紀錄 補登已服務 註銷次數 方案卡右側 蒸足整批 原卡切換 原請求 原調整數量",
  "modules": [
    "course",
    "beauty",
    "steamfoot"
  ],
  "permission": "wallet.adjust",
  "additionalPermissions": [
    "wallet.read",
    "customer.read"
  ],
  "feature": "plan_management",
  "sources": [
    "src/components/admin/wallet-session-correction-form.tsx",
    "src/server/actions/wallet-session-correction.ts",
    "src/server/services/wallet-session-correction.ts",
    "src/components/admin/plan-session-adjustment.tsx",
    "src/server/actions/course-session-adjustment.ts",
    "src/server/actions/beauty-session-adjustment.ts",
    "src/components/admin/plan-grid-actions.tsx",
    "src/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content.tsx",
    "src/components/admin/steam-plan-management.tsx",
    "src/server/services/steam-session-adjustment.ts"
  ],
  "verification": "source-reviewed",
  "kind": "howto"
};
