# 美業 LINE 首次會員登記

日期：2026-10-26（Asia/Taipei）。基底：main `e4907abb`。

## 問題與結果

舒生活會員 LIFF 已成功驗證 LINE，但已有中央 Account、尚未有本店會員關聯時，exchange 回覆 `store_membership_unconfirmed`。蒸足與課程已有對應入口，美業未提供首次登記分支；configured store 的 onboarding action 也會拒絕。因此新客看到人工核對提示。

本次讓已正確設定 LINE 的美業店家提供既有的姓名／手機表單，以獨立美業服務原子建立新會員關聯，再由既有 session refresh 驗證並進入會員中心。已有有效會員直接登入。本店既有資料、身分衝突或解除關聯審核仍交由門市核對。

## 身分與交易界線

- exchange 與 action 維持伺服器驗證 LINE idToken、audience、實際店家及設定 namespace。首次登記表單本身不授予 session。
- eligibility 與 submit 核對設定、BEAUTY 模組、ACTIVE/TRIAL、LIFF 一致性；submit 重做檢查。
- primary identity transaction 使用 Serializable 與 Beauty 寫入共用的 Store row lock。User、Account、新 Customer、CustomerIdentityLink 全部成功才提交。未擴大 restricted Beauty DB role 的權限。
- 僅新增本店無對應資料的新會員；相同手機、LINE subject、既有 user membership（含其他 provider、合併歷史）及 pending/approved unlink 均阻擋新增。無手機接管或 profile 覆寫。
- 已驗證的 active 全域帳號可建立新的 CUSTOMER-context 店家關聯，保留原 User.role、姓名、手機、Account、他店 Customer。這與既有 member resolver 的權限語意一致，不授予員工權限，也未放寬 booking finalizer 的既有角色規則。
- 新 User 不設定全域登入手機；聯絡電話只存於新店家 Customer。不設定自助預約權益，不產生預約、購課、付款、好友或通知成功狀態。
- Provider 模式沿用 configured identity namespace，不借用中央 Account。
- 無 migration、環境變數或既有會員資料維護操作；原 STORE_LINE_CONFIG_JSON 保留。

## 驗證

- 9 個相關測試檔，共 181 項通過：新會員資料庫交易、exchange、onboarding action、verified resolver、liff-token authorize、course onboarding、Beauty booking identity、central member resolver、routing contract。
- 新資料庫案例以本機 PGlite 執行實際參數化 SQL／交易，涵蓋無中央帳號、跨店 active account、保留 OWNER/STAFF 原角色、手機碰撞、合併資料、跨 provider membership、unlink、停用、店家／LIFF／Provider 不符、表單顯示後資料改變，以及最後寫入失敗時完整 rollback。
- TypeScript 與修改檔 ESLint 通過。
- 共用 OnboardingForm 僅新增 server-derived 美業首次登記文案；維持既有標籤、輸入模式、按鈕 disabled、結果回頂端與 session refresh。React review：沒有新增 hook／全域請求狀態，未將 server 授權邏輯放入 client。

## Preview 與限制

隔離 fixture：`scripts/qa/beauty-first-registration-browser.mjs`。使用實際 OnboardingForm + 專案 CSS；假 LINE SDK、假 action 與 session 結果，阻擋所有其他網路。尺寸 390×844、768×1024、1366×900，每尺寸 4 情境，共 12 項：首次登記返回會員中心、booking intent 返回該店體驗頁、資料衝突、登記後 session 建立失敗。

結果：無水平溢出、無 page error；空手機不可送出；成功必須先完成兩次 session 驗證才導航；衝突／session 失敗不導航。證據在 `evidence/20261026-beauty-first-registration/`。

這是 form 與狀態機的隔離 Preview，未涵蓋整個 LIFF layout、真實 LINE OAuth、正式 DB 或通知送達。正式發布後仍須從 `https://liff.line.me/2010761154-CmcQZ9Db` 用新客帳號確認登記與再次登入；既有資料衝突不能用重新註冊或解除 LINE 綁定繞過。

銀百合／IDO 的 OA 權限與通道設定、買吉他／YoungSky 的暫緩工作均不在本次範圍。
