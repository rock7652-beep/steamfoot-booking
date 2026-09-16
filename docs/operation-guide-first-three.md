# 操作指南首三題：規則核對與驗收紀錄

日期：2026-09-16。依據：main 44c1f1f0。只限時段模組，不套用到 SPA／課程。

## 交付與界線

已新增 A01／A02／A03 共用內容與預約管理頁「？操作說明」，預約詳情內也提供相同入口，以便編輯備註時查看。包含搜尋、問題列表、三步驟、完成確認、完整注意事項。桌機右側面板、手機底部抽屜，使用原生 dialog 保留原頁元件。Escape 在教學面板內停止傳播，避免連帶關閉預約詳情。

只在 VERCEL_ENV=preview 開啟；本機開發可設定 OPERATION_GUIDE_PREVIEW=true。正式環境不顯示。未修改 server actions、資料模型、預約／扣堂／通知規則。這輪尚未新增全站指南頁或擴充其餘 12 題。

## 規則證據

| 題目 | 已核對的實作 | 教學重點 |
|---|---|---|
| A01 改時間 | bookings/booking-detail-drawer.tsx 的 handleReschedule、ActionFooter；reschedule-modal.tsx；server/actions/booking.ts 的 updateBooking | 開放日期、時段、容量；已完成／取消不能直接修改；成功顯示已改期；此 action 無直接改期通知呼叫 |
| A02 取消預約 | booking-detail-drawer.tsx 的 handleCancel；server/actions/booking.ts 的 cancelBooking | 原生確認框；釋放 RESERVED 堂數與補課券；不自動退費；顧客端 12 小時限制不寫成後台限制；此 action 無直接取消通知呼叫 |
| A03 本次預約備註 | booking-note-editor.tsx；server/actions/booking-note.ts；server/actions/booking-drawer.ts 的 canEditBookingNote | 實際欄名「本次備註」；500 字；清空可移除；需要 booking.update；完成後可改；不改狀態或結帳 |

完整來源均在 src/app/(dashboard)/dashboard/bookings 或 src/server/actions。文章來源在 src/lib/operation-guide.ts。

## 待實際驗收與截圖（不能標成通過）

- 自動審核拒絕推送 codex/help-inventory-20260916 到 rock7652-beep/steamfoot-booking，要求使用者明確同意新增程式與文件的提交目的地。未改用其他管道繞過，未建立遠端 PR 或部署此版本。

- 目前瀏覽器沒有已登入的測試後台。需使用隔離測試門市與測試資料；確認資料庫隔離與通知設定後，才執行改期／取消／儲存。
- 375px、390px、1440px：開啟、搜尋、三題切換、完整說明、關閉、Escape、焦點回復、捲動及背景不誤操作。
- 編輯中的本次備註：開關說明後內容與原畫面位置不遺失。
- A01 實際截圖：預約詳情與「改時間」位置、改期日期／時段選擇、成功後新時間。
- A02 實際截圖：取消入口與確認框、已取消狀態；另核对測試堂數／補課券及既有收款未被改動。
- A03 實際截圖：新增／編輯入口、輸入與儲存、重新開啟後內容；涵蓋清空與儲存失敗。
- 唯讀跨店、一般員工／無 booking.update、訂閱不可寫時，指南不能解鎖操作。
- 截圖只使用測試姓名與資料；不得將模擬截圖標為實際後台證據。

## 核對時發現的既有差異

cancelBooking 使用 requireSession + assertStaffBookingWritable + assertStoreAccess，沒有與 updateBooking 相同的 requireWritablePermission("booking.update")。因此教學沒有宣稱兩者權限檢查完全一致；員工取消權限需另外實測與評估。本次不改既有權限行為。

## 擴充門檻

首三題實際畫面、隔離操作與權限驗收通過後，再接 A04–A10、B04、B05、B10、D03、D05，累計 15 題。未驗收前維持草稿，不合併正式站。

## 本機檢查

- operation-guide、booking-note、booking-note-state、booking-reschedule-ui-wiring：4 檔、18 項通過。
- 修改檔案 ESLint 通過；完整 TypeScript noEmit 檢查通過。
- 新增互動測試涵蓋同義詞搜尋、文章返回、展開取消後果、關閉保留原頁草稿、重新開啟回到列表、Escape 不傳給底下抽屜。
- jsdom 模擬 dialog 開關只驗 React 狀態，不能代替瀏覽器原生焦點、手機排版或實際資料寫入驗收。
- Prisma client 在本機產生，沒有執行 migrate、seed 或連線修改資料庫。
