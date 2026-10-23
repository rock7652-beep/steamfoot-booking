# 美業第一批後台密度與重複資訊調整

## 版本與範圍

- 工作支線：`preview/beauty-ui-alignment-20261021`，沿用既有隔離 worktree。
- 調整前應用：`43f207f91e62d95af1fd6128f5ff82b7442e1e92`；本輪起點 `3b994471` 僅另含既有驗收文件／測試。
- 本輪應用：`c3ed4b68fc70394fdb3fb97cd2e8677739eeb7cd`。
- Preview：`dpl_FGBLQCZ59UUvJWMadH9jc8F43XzX`，target 為 Preview（API `target=null`）。
- 後台：https://steamfoot-booking-4k4wo9bmf-rock7652-2111s-projects.vercel.app/hq/login?store=beauty-hosted-20261021 。保留既有 Vercel 存取保護，不在文件保存驗證 token。
- 僅使用 `steamfoot-preview`，未變更資料結構、業務資料、帳本、角色權限、環境變數、LINE 開關或正式站。登入本身沿用既有驗證機制；業務儲存請求在瀏覽器驗收中阻擋。

## 四項變更

| 範圍 | 最終呈現 | 共用來源與影響 |
|---|---|---|
| 收費方式 | 合併重複頁名／相同筆數；服務名稱每列一次；單次／體驗移除重複單位價格，多次方案仍保留每次價格。購買方式／共卡篩選可展開；簡單收費縮為短視窗；方案類型、名稱、狀態同列。 | `courses/member-workspace.tsx`、`courses/course-profile-forms.tsx`。美業沿用 catalog adapter；音樂／運動維持堂數／點數與原分支，未改儲存接點。 |
| 技師編輯 | 依內容高度；基本頁移除重複姓名摘要；性別與排序欄收斂；拆帳方式與數值並排，百分比才顯示基準；每週時段排列及移除按鈕收斂。 | `courses/staff-editor-fields.tsx` 與既有 `beauty/catalog-editor.tsx`；共用服務列依可用容器寬度換行，拆帳計算不變。 |
| 新增預約 | 已選顧客不再次輸入姓名／電話，預設以第一位為聯絡人，勾選另設聯絡人才展開。技師性別欄移除，底層保留 ANY 契約，指定技師收起；後台沿用時間下拉，與日期、查詢同區；規則折疊；關閉入口在上方。 | 既有 `beauty/booking-form.tsx` 與 `beauty/dashboard.tsx`。服務、老師、空間、時長、方案檢查仍使用原後端。DetailedBookingForm 亦供公開體驗使用，部分共用標籤／規則折疊呈現同步；本輪未驗 LINE 體驗登入。 |
| 人員編輯 | 新增使用既有置中 RightSheet；新增／編輯減少滿高留白、識別色縮短；輸入欄至少 44px；長 Email 可展開完整內容，避免撐高整列；新增草稿離開須確認。 | 既有 `staff/staff-workspace.tsx`、`staff-account-editor.tsx`、`courses/staff-list.tsx`。不改角色選項、權限、月度空間費或技師／人員分工。 |

所有版面調整均沿用既有元件，沒有新增美業內頁副本；窄版依元件容器寬度換行，不靠縮字取得密度。

## 驗證證據

- 相關單元／元件／資料庫測試：75 檔、625 項通過；TypeScript、指定 ESLint 通過。
- 最後 Preview 為 READY，production build 完成；建置日誌確認 `isolated_database=true migrations_skipped=true notifications_blocked=true`。
- 最後版本美業共 44 張畫面紀錄：1366×900、1024×768、768×1024，加上編輯視窗 360px 窄容器。欄位未超出視窗；窄容器另檢查內容水平捲動寬度與欄位邊界。預約／多筆時段與小視窗仍可在內容區捲動，沒有宣稱一律免捲動。
- 真實 hosted 唯讀流程：選既有顧客後不另填聯絡人，即可查到後端時段；選時間後確認按鈕可用，未送出預約。新增人員填入暫存文字後關閉，選擇繼續編輯可保留草稿，最後捨棄未儲存草稿，未建立人員。
- 同一最後版本：運動合成 OWNER 登入，方案列表／可編輯方案、人員列表完成桌機與平板核對；音樂指定 QA 登入，方案列表及唯讀詳情完成核對。兩者顯示原堂數／課程欄位，沒有被替換成美業次數／服務名稱。
- 兩組 hosted 腳本皆未發現瀏覽器 pageerror。音樂教師／人員頁因既有權限無法開啟，明確列待驗，不宣稱共用頁面全面驗收通過。
- 本輪沒有正式發布、正式資料讀寫、migration、PR 或帳號啟用／權限調整。
- 前後對照與原始截圖在本工作區 `/workspace/beauty-density-review/index.html`；下載包 `/workspace/beauty-density-review.zip`。圖檔不含登入狀態或 Vercel 驗證 token；人員名單截圖遮蔽，個別美業編輯使用既有合成資料。

## 不在本輪宣稱的驗收

- 沒有送出新預約、方案／人員儲存或帳務交易；本輪 UI／唯讀驗證不取代既有交易驗收，也不把先前版本的交易結果算成本版重驗。
- 音樂指定 QA 可登入並查看方案，教師／人員編輯受既有權限限制；未啟用停用測試帳號或變更權限來取得畫面。
- 實體 iPad／手機、店家操作習慣與簽收仍待完成。LINE 真實登入、綁定與送達維持待申請完成後另驗。
- 第二批顧客經營、分析、設定等內頁不在本輪實作；原資料與業務規則保留。
