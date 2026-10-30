import type { OperationGuide } from './operation-guide-types';

export const dailyOperationGuides20261028: OperationGuide[] = [{
  id: 'FIN01', category: 'money', title: '營收、現金帳、月結與匯出現在在哪裡？',
  summary: '各模組統一由營運五個分頁進入，權限與計算規則仍分開；舊工具網址會轉到對應分頁。',
  answer: '營運依序為營收明細、收入分類、現金帳、月結管理、報表匯出；先核對門市與期間，再選要處理的工作。',
  path: '營運 → 營收明細／收入分類／現金帳／月結管理／報表匯出',
  keywords: '營運 五分頁 營收明細 收入分類 現金帳 月結管理 報表匯出 更多工具 舊網址 HQ 總部 門市 期間 篩選 現金差異',
  steps: ['核對目前門市，選營運分頁；體驗收款在營收明細用交易類型切換，現金或非現金收支到現金帳。', '月結管理核對月份、人員及原確認版本；教師／教練／技師費用集中此處，月結確認與付款登錄分開。蒸足保留服務收入與租金。', '報表匯出選收入總覽或資料匯出；下載前核對畫面一行摘要中的門市、期間、類型、狀態與日期口徑，錯誤依原提示處理。'],
  important: '共用導覽不統一各模組金額規則；月結確認不付款、不發通知。總部須選定門市，切店後先關閉舊表單重新核對。',
  success: '在正確門市與期間找到原工具；未重複收款、付款或新增已連動的現金帳目。',
  details: ['舊現金帳、月結、收入總覽、資料匯出與系統對帳網址保留查詢條件轉接，不必重建帳目；不再從更多工具或獨立費用區找入口。', '各分頁分別檢查功能與權限；只有報表或月結權限不需要先取得交易讀取權限才能進原功能。唯讀店家視角不提供異動及資料匯出，看不到入口不等於資料被刪除。', '日期、月份及適用篩選會保留；交易清單與現金帳的同名條件分開，清除後不應回復舊條件。月份與實際入帳日、購買日、服務日仍須對照畫面統計說明。', '點錢、交班及現金差異從頂欄現金抽屜處理；實點差額與結帳後帳務異動分列，不能修改歷史快照讓數字看似相等。', '美業收入分類僅顯示收款分配，人員費用改到月結管理，不能把成本重複算成營收。總部確認、付款、更正及通知仍各有權限、門市與版本檢查。'],
  modules: ['steamfoot', 'course', 'beauty'], permission: 'report.read', feature: null, kind: 'howto', verification: 'source-reviewed',
  sources: ['src/lib/operations-navigation.ts', 'src/lib/operations-navigation-server.ts', 'src/app/(dashboard)/dashboard/revenue/_components/operations-area.tsx', 'src/app/(dashboard)/dashboard/revenue/_components/operations-tabs.tsx', 'src/lib/monthly-store-guard.ts', 'src/lib/course-monthly-access.ts', 'src/components/operations/receipt-summary.tsx'],
}];
