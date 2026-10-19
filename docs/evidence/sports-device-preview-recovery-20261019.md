# 運動隔離預覽：載入提示與頁面狀態同步

手機外層的平板裝置預覽原本在讀取超過 20 秒時直接報「預覽載入失敗」，稍後又恢復；從 iframe 側欄切到工單也未更新外層 page 參數，重整會回到課表。本次將慢速與失敗分開，並讓外層網址跟隨實際頁面。

- 應用提交：27eda702ed448b263249e4f4923daaaca40b19d4。
- Vercel Preview：dpl_CSbcPwFX437L1bXefcyReVUj9b7R，READY，target=null。
- 網址：https://steamfoot-booking-fgwy3d9y5-rock7652-2111s-projects.vercel.app 。分享參數與登入資料不存入版本庫。
- 專用分支：codex/sports-pr1355-acceptance-20261019；沒有變更 PR #1355 分支或 main，沒有合併。

## 修正

只由伺服器驗證的 `sportsNativePreview(storeId)` 啟用。共享元件預設仍沿用原流程，音樂及正式站未部署。

- 運動 Preview 20 秒未完成時改為「載入較慢，仍在讀取…」。登入失效、實際 error 訊號與慢速狀態分開；換 iframe 時清除舊計時器。
- iframe 合法同來源、同店家導航後，透過 Next 支援的 native history 同步 page/device，不為更新網址再次觸發 RSC 或重載 iframe。
- 初始預設頁面不自動改寫網址，重複選擇目前裝置不觸發導航；舊 frame 就緒訊息不得覆蓋新的快速前往選擇。
- popstate 明確恢復 iframe 目標。即使 src prop 仍是原課表、實際 iframe 已導航到工單，前進／後退仍載入正確頁面。
- origin/source、同店家路徑及操作紀錄權限限制保留；工單 CRUD、收付款、角色、功能授權、資料庫結構皆未修改。

## 自動驗證

35 項通過：5 項慢速／失敗／登入／計時器、10 項網址與歷史／範圍／舊訊息、8 項既有路徑 helper、2 項課表保留、10 項上一輪課表密度回歸。TypeScript、修改檔案 ESLint、git diff --check 通過。

測試中的 error event 與登入位置為元件模擬；不宣稱涵蓋所有瀏覽器網路失敗情況。

## 登入後瀏覽器驗收

既有運動驗收老闆帳號，Chromium，手機外層 390×844；內層平板 1024×768／768×1024；另驗桌面外層 1366×900。14 項檢查通過、pageerror=0：

1. 實際預覽選單→快速前往工單，網址同步，工單 document GET 僅 1 次。
2. 重整仍為工單。
3. 上一頁回到課表。
4. 下一頁回到工單。
5. iframe 側欄進工單同步外層網址。
6. 此路徑外層重整仍為工單。
7. 平板直向切換不新增 document GET。
8. 平板橫向切換不新增 document GET。
9. 瀏覽器將工單唯讀 GET 延後 21 秒：顯示等待、不顯示載入失敗。
10. 延後 GET 成功後正常恢復工單。
11. 快速切工單→課表，延後的舊請求不覆蓋最後選擇。
12. 瀏覽器 HTTP 503 fixture 的錯誤內容保持可見，不假裝成功。
13. 移除 fixture 後，明確按重新整理成功恢復。
14. 桌面外層無整頁水平溢出。

另以既有 `pr1355-staff` 專用人員登入，沒有 work_order.read 時仍顯示「沒有查看工單的權限」，沒有新增工單入口。未變更任何帳號或權限。

本機完整證據：`/workspace/sports-device-fix-acceptance-20261019/`，包含 results.json、staff.json、mobile-work-orders.png、slow-wait.png、failure-visible.png、desktop-work-orders.png、staff-denied.png 及腳本紀錄。

## 邊界

- 延遲、HTTP 503 與取消舊請求由驗收瀏覽器注入，只影響該瀏覽器唯讀請求，不是伺服器環境故障或設定變更。
- 預覽建置紀錄明載 `isolated_database=true migrations_skipped=true notifications_blocked=true`；未執行 migration、合併或部署正式／音樂站。
- 初期瀏覽器腳本有網址比對格式錯誤；也實測發現初次網址同步的額外導航，補上初始／舊 frame 訊息保護後，最終版本實測僅載入 1 次。最後結果以 final 部署與 results.json 為準。
- 尚未驗證實體手機 Safari／iPad；未重新送出工單、收款或課程交易。下一步為店家親自確認此預覽，不代表正式啟用放行。
