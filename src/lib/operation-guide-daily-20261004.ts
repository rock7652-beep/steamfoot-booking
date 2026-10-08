import type { OperationGuide } from "./operation-guide-types";

/** Source review at main 82b6f946; logged-in acceptance remains separate. */
export const dailyOperationGuides20261004: OperationGuide[] = [
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "C166",
    "category": "booking",
    "title": "運動自由選課的同行，如何新增或改用體驗／本人方案？",
    "summary": "含預約人最多 3 人；同行先用預約人方案，現場可保留名額並變更使用方式。",
    "answer": "一般待上課預約釋放原保留額度，已扣額度的紀錄則返還後核對新方案；改體驗不等於已收款。",
    "path": "運動課表 → 課次名單 → 同行列 → 變更使用方式／新增同行",
    "keywords": "運動 自由選課 同行 三人 新增同行 變更使用方式 體驗 本人方案 預約人方案 釋放 返還 額度",
    "steps": [
      "核對課次、預約人與同行列；有原本人預約且未結束、尚有名額與額度時，可新增同行，姓名選填。",
      "在同行列選變更使用方式：預約人方案、體驗或本人方案；本人方案必須選本店有效學員及適用方案。",
      "送出後核對原／新方案可用額度、同行姓名、使用方式與返還提示，再依實際到場點名。"
    ],
    "important": "僅運動自由選課，期課與音樂不適用；變更不用先取消再約，也不會新增正式顧客帳號。",
    "success": "原名額保留，使用方式及額度一致，沒有重複預約或扣點。",
    "details": [
      "預約人方案須允許共用；每人占一名額，點數依課程、堂數方案每人 1 堂。",
      "體驗功能須開啟；店家改體驗另需體驗新增權限。教練只能改本人授課同行，跨店唯讀不可寫入。",
      "已收體驗款、原方案已結清、補課券已使用或預約版本更新會阻擋，先回原紀錄核對；不能以重建購買解決。",
      "同行改體驗保留原預約狀態，收款另外處理；結果不明先查名單與異動紀錄。"
    ],
    "modules": [
      "course"
    ],
    "permission": "booking.update",
    "additionalPermissions": [
      "booking.read"
    ],
    "sources": [
      "src/components/course-companion-editor.tsx",
      "src/server/actions/course-companions.ts",
      "src/server/services/course-companions.ts",
      "src/server/services/course-booking.ts"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": "frontend_preview",
    "id": "I16",
    "category": "settings",
    "title": "如何從後台查看會員或教練／技師的唯讀前台？",
    "summary": "選店、角色與人員讀取真正前台畫面；課程會用中央會員身分與有效工作連結判斷是否可切換角色。",
    "answer": "前台預覽保持後台身分，不代登入 LINE；可檢查資料與導覽，不能代表真正登入或交易已驗收。",
    "path": "側邊選單 → 前台預覽；顧客／人員詳情 → 前台預覽",
    "keywords": "前台預覽 唯讀 會員 我的工作 教練 技師 雙身分 姓名 手機 搜尋 未開通 LINE 中央會員 CustomerIdentityLink StaffMemberLink",
    "steps": [
      "選正確門市，再選會員或工作前台；搜尋姓名／手機，最多顯示 30 筆。",
      "點正確人員，在右側畫面換日、換月或展開卡片；核對店家、人員與資料讀取時間。",
      "課程同一 LINE 身分有本店有效會員與工作連結時，可切會員／我的工作；沒有切換先查中央會員身分、有效連結及管理者權限，不另建同名會員。"
    ],
    "important": "裝置預覽的後台仍可寫入；前台預覽才是唯讀。這也不是隔離資料庫，核對時仍須保護顧客資料。",
    "success": "選店／換人即移除舊畫面，顯示正確資料，寫入動作被唯讀提示阻擋。",
    "details": [
      "會員需顧客、預約及方案查看權限；工作需店主／HQ、人員查看及有效工作資格，仍限可存取店家。",
      "EXPERIENCE 完整單店試用內含；普通付費方案另需開通 frontend_preview，HQ 有效隱藏／鎖定優先。未開通不讀人員資料。",
      "課程會員使用本店 CustomerIdentityLink 核對中央 LINE 身分，再以有效 StaffMemberLink 判斷雙身分；即使舊 Customer.userId 尚未寫入，唯一且一致的中央身分仍可預覽。",
      "若同一顧客對應多個身分、連結撤銷、工作資格停用或門市不一致，系統不會猜測或提供切換；先由有權限人員核對，不要新建同名顧客。",
      "預覽切換不修改真正前台偏好或 LINE 身分；也不替代 LINE 登入、通知送達、預約／付款實際驗收。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "customer.read",
    "additionalPermissions": [
      "booking.read",
      "wallet.read"
    ],
    "sources": [
      "src/app/(dashboard)/dashboard/frontend-preview/page.tsx",
      "src/server/services/frontend-preview.ts",
      "src/components/frontend-preview/selector.tsx",
      "src/proxy.ts"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "I17",
    "category": "settings",
    "title": "HQ 店舖封存後，資料與登入會被停用嗎？",
    "summary": "封存店預設隱藏，可用搜尋與顯示已封存找回；有未封存子店時要先處理，還原後再次顯示。",
    "answer": "封存不等於停業、取消方案或撤銷權限，原帳號、直接網址與營運資料仍保留。",
    "path": "HQ → 店舖管理 → 封存／顯示已封存／還原",
    "keywords": "總部 HQ 店舖 封存 隱藏 還原 顯示已封存 預設店 資料保留 登入",
    "steps": [
      "由 HQ ADMIN 核對正確店家，再點封存並完成行內確認；不處理中的店家不要僅憑名稱判斷。",
      "預設清單及切店選單隱藏封存店；可用名稱搜尋、展開／收合與「顯示已封存」縮小範圍。",
      "需要再顯示時搜尋正確店家後點還原，核對清單及切店選項；原資料不必搬移或重新建店。"
    ],
    "important": "限 HQ ADMIN＋staff.manage；預設店不可封存。要停止營運或撤權須走相對應設定，封存不會代辦。",
    "success": "清單可隱藏／還原，原店 ID、顧客、預約與權限沒有改變。",
    "details": [
      "封存與還原會記錄操作人、時間及前後資料；不會刪顧客、預約或收款。",
      "既有直接網址仍可能登入，封存不是阻止存取的安全設定。",
      "封存母店前須先封存或移動未封存子店；同層排序可拖拉或按上下移動，失敗會還原。",
      "一般店長應請 HQ 處理，本題不授予總部權限。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.manage",
    "sources": [
      "src/server/actions/store-archive.ts",
      "src/app/hq/dashboard/stores/page.tsx",
      "src/app/hq/dashboard/stores/organization/store-organization-manager.tsx",
      "src/server/actions/store-organization.ts"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "I18",
    "category": "settings",
    "title": "HQ 如何切店、返回總部及閱讀品牌總覽？",
    "summary": "HQ 全部分店首頁是品牌總覽；選店後依該店實際開通功能與權限工作，返回 HQ 會清除單店視角。",
    "answer": "HQ 選店不會冒用店員身分；門市資料與操作限於目前選店，總部專用工具要返回 HQ 使用。",
    "path": "HQ → 品牌總覽／店舖管理／系統工具 → 選店／返回 HQ 總部",
    "keywords": "HQ 總部 品牌總覽 側欄 切店 返回總部 實際權限 OWNER 不冒用店員 HIDDEN LOCKED 使用門市 顧客名單 服務人次 縣市 行政區 統計日期",
    "steps": [
      "在全部分店看品牌總覽、店舖管理及系統工具；需要處理門市工作時，先選正確店家。",
      "切店成功後，以該店實際訂閱、功能狀態與可用權限顯示模組；讀取、寫入與匯出都只限目前選店。",
      "需要跨店稽核、修復或其他 HQ 專用工具時，點「返回 HQ 總部」回品牌首頁並清除單店選取。",
      "閱讀品牌數字先核對截至日期，再展開縣市／行政區查看店家分布。"
    ],
    "important": "HQ 選店不是角色模擬：HIDDEN 功能不顯示、LOCKED 功能不可用；需要真實店員身分的工作仍由店員處理。",
    "success": "能辨識總部與門市視角；選店後只操作該店允許功能，返回成功後清除單店選取。",
    "details": [
      "顧客是各已服務門市名單筆數，不是跨店唯一人數；完成服務人次也不等於獨立來客。",
      "統計截至台灣前一日，更新失敗保留原數字與日期；店家分布讀取當前合格店家，地址不足顯示待補／未分類。",
      "HQ 選店後保留真實 HQ 操作者、使用者 ID 與稽核來源，再以該店 OWNER 可用能力決定門市畫面，不會假扮該店 Staff。",
      "HIDDEN 功能完全不顯示，也不掛載資料讀取；LOCKED 功能維持未開通／不可用呈現，後端仍會拒絕動作。",
      "個人名下現金簿編輯等需要真實 Staff 身分的工作不會放寬；返回 HQ 後才恢復總部稽核與跨店工具。",
      "窄畫面用選單抽屜；這些導覽不替代各店業務驗收。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.manage",
    "sources": [
      "docs/hq-navigation-continuity.md",
      "docs/hq-store-real-view-acceptance.md",
      "src/components/dashboard-layout.tsx",
      "src/lib/hq-store-view.ts",
      "src/lib/hq-store-view-context.ts",
      "src/lib/core-feature-permissions.ts",
      "src/components/hq-brand-overview.tsx",
      "src/lib/marketing-usage-server.ts"
    ]
  }
];
