# 課程既有會員登入核對補齊

2026-11-10；接續本機基準 `6275fc9e`。使用者授權「好 先補上」涵蓋本機修正與驗證；未發布、未上傳、未修改正式會員或授權資料，未寄送通知。

## 問題與範圍

銀百合個案的唯讀查核顯示：通知關係已確認、唯一 Messaging owner 存在且有效，但沒有 Login Account 或 Login membership link。手機重綁紀錄只有 OA_PHONE_REBIND，沒有登入授權。紅色警示截圖早於後續通知重綁；尚未取得本次真機登入結果，不宣稱正式個案已恢復。

中央 LINE Login 課程 onboarding 對既有資料原先直接返回 identity_review_required，沒有接上現成的登入確認申請；現有後台批准服務也僅允許蒸足。

## 修正後路徑

1. Server action 驗證 token、audience、門市與模組。
2. 新會員及已驗證會員維持原流程。既有中央 Login 課程會員先嘗試有效的精確登入授權；無授權則建立既有確認碼佇列，不建立重複 User／Customer／方案。
3. 顧客看到確認碼及查核編號；門市沿用本店會員與 LINE 面板，核對本人和同碼。
4. 批准服務新增允許 course，並查驗相符課程 LIFF 設定；仍核對 customer.update、店／會員／手機／候選指紋／有效申請與 owner，建立一次性授權。
5. 顧客再次提交時消耗授權，接回原會員；session 仍由既有 token 驗證流程建立。通知 subject 不複製為 Login subject。

獨立 Provider、其他模組、跨店、重複電話、owner 衝突、停權、過期未核對申請維持隔離／阻擋。已有中央 Account 但 exchange 先判定 membership conflict 的入口維持原審核阻擋，本次未放寬 exchange。不新增資料表或 migration。

## 驗證

- `npx vitest run`：course-line-onboarding、liff-login-recovery、liff-onboarding-action、liff-approved-store-login、liff-login-rebind、liff-exchange-route、member-connection-login-status、store-member-connection、store-liff-context 共 9 檔 **189 項通過**。
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`：通過。
- 變更的三個服務／action 與三個測試檔 ESLint：通過。
- 後台指南兩檔檢查 7 項通過；指南與 browser 腳本 ESLint 通過。合計 11 檔、196 項測試通過。
- `node scripts/qa/course-login-recovery-browser.mjs`：1440、768、390、360 寬度通過。使用真實 OnboardingForm 與 StoreMemberConnectionPanel，驗證提交確認碼、後台指定申請批准、刷新再提交及登入導向；未發生頁面水平溢位或 browser error。
- 畫面證據 `/tmp/course-login-recovery-ui/pending-390.png`，其他尺寸與結果在同目錄。瀏覽器使用合成資料，攔截所有網路／後端並模擬結果；不是 LINE 真機、資料庫交易或正式門市完整驗收。
- 後台操作指南 F04 同步補充中央 Login 課程會員核對；無新增前台操作指南。

## 交付限制

本機修正與既有課表 UI 分開提交；本次 patch 可單獨檢視。未推送分支或建立 hosted Preview，避免未證明隔離的自動 build／migration 副作用。正式發布與個案身分核對仍待各自授權及真實流程驗收，不直接用手機或後台通知已連結代替登入證據。
