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
    "summary": "選店、角色與人員，讀取真正前台畫面；預覽禁止預約、取消、點名、表單儲存與通知。",
    "answer": "前台預覽保持後台身分，不代登入 LINE；可檢查資料與導覽，不能代表真正登入或交易已驗收。",
    "path": "側邊選單 → 前台預覽；顧客／人員詳情 → 前台預覽",
    "keywords": "前台預覽 唯讀 會員 我的工作 教練 技師 雙身分 姓名 手機 搜尋 未開通 LINE",
    "steps": [
      "選正確門市，再選會員或工作前台；搜尋姓名／手機，最多顯示 30 筆。",
      "點正確人員，在右側畫面換日、換月或展開卡片；核對店家、人員與資料讀取時間。",
      "課程有效雙身分可切會員／我的工作；沒有切換先查同店有效連結及管理者權限，不另建同名會員。"
    ],
    "important": "裝置預覽的後台仍可寫入；前台預覽才是唯讀。這也不是隔離資料庫，核對時仍須保護顧客資料。",
    "success": "選店／換人即移除舊畫面，顯示正確資料，寫入動作被唯讀提示阻擋。",
    "details": [
      "會員需顧客、預約及方案查看權限；工作需店主／HQ、人員查看及有效工作資格，仍限可存取店家。",
      "EXPERIENCE 完整單店試用內含；普通付費方案另需開通 frontend_preview，HQ 有效隱藏／鎖定優先。未開通不讀人員資料。",
      "課程雙身分須有效同店 StaffMemberLink；預覽切換不修改真正前台偏好或 LINE 身分。",
      "可操作的查閱範圍與畫面依模組、角色、功能而異；預覽不替代 LINE 登入、通知送達、預約／付款實際驗收。"
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
    "summary": "封存只隱藏 HQ 店舖清單與切店選項，還原即可再顯示。",
    "answer": "封存不等於停業、取消方案或撤銷權限，原帳號、直接網址與營運資料仍保留。",
    "path": "HQ → 店舖管理 → 封存／顯示已封存／還原",
    "keywords": "總部 HQ 店舖 封存 隱藏 還原 顯示已封存 預設店 資料保留 登入",
    "steps": [
      "由 HQ ADMIN 核對正確店家，再點封存並完成行內確認；不處理中的店家不要僅憑名稱判斷。",
      "預設清單及切店選單隱藏封存店；點顯示已封存可查看完整清單。",
      "需要再顯示時點還原，核對清單及切店選項；原資料不必搬移或重新建店。"
    ],
    "important": "限 HQ ADMIN＋staff.manage；預設店不可封存。要停止營運或撤權須走相對應設定，封存不會代辦。",
    "success": "清單可隱藏／還原，原店 ID、顧客、預約與權限沒有改變。",
    "details": [
      "封存與還原會記錄操作人、時間及前後資料；不會刪顧客、預約或收款。",
      "既有直接網址仍可能登入，封存不是阻止存取的安全設定。",
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
      "src/components/store-archive-button.tsx",
      "src/app/hq/dashboard/stores/page.tsx",
      "docs/hq-store-archive.md"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "I18",
    "category": "settings",
    "title": "HQ 如何切店、返回總部及閱讀品牌總覽？",
    "summary": "HQ 全部分店首頁是品牌總覽；選定門市後改用該模組選單，返回 HQ 會清除單店視角。",
    "answer": "使用門市、顧客名單與完成服務人次是不同指標；總覽不是跨店唯一顧客人數或店內收款報表。",
    "path": "HQ → 品牌總覽／店舖管理／系統工具 → 選店／返回 HQ 總部",
    "keywords": "HQ 總部 品牌總覽 側欄 切店 返回總部 使用門市 顧客名單 服務人次 縣市 行政區 統計日期",
    "steps": [
      "在全部分店看品牌總覽、店舖管理及系統工具，需要操作門市時選正確店家。",
      "切店成功會進該店首頁，再用模組選單；平台管理頁仍保留 HQ 外框。",
      "點返回 HQ 總部回品牌首頁；閱讀數字先核對截至日期，再展開縣市／行政區看店家分布。"
    ],
    "important": "切店不授予原本沒有的存取或寫入權限；返回失敗保留目前店，不能把畫面切換當成權限變更。",
    "success": "能辨識總部與門市視角，返回成功後清除單店選取，統計口徑與日期清楚。",
    "details": [
      "顧客是各已服務門市名單筆數，不是跨店唯一人數；完成服務人次也不等於獨立來客。",
      "統計截至台灣前一日，更新失敗保留原數字與日期；店家分布讀取當前合格店家，地址不足顯示待補／未分類。",
      "測試預覽上方可能沿用正式摘要、下方顯示預覽店家，依畫面說明分開核對。",
      "iPad 直向側欄可用圖示模式與展開，窄畫面用選單抽屜；這些導覽不替代各店業務驗收。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.manage",
    "sources": [
      "docs/hq-navigation-continuity.md",
      "src/components/dashboard-layout.tsx",
      "src/components/hq-brand-overview.tsx",
      "src/lib/marketing-usage-server.ts"
    ]
  }
];
