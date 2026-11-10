# 同科目方案資格與舊卡核對：驗證紀錄

業務來源：[同科目方案規格](../course-subject-entitlement-20261110.md)。基準 main `f74815a7`，本機分支 `feat/course-subject-entitlement-20261110`。本紀錄不是正式發布或正式顧客資料確認。

## 實作範圍

- 已有科目快照的方案不再綁定 OPEN／ASSIGNED 加入方式。A1／A2／A3 依科目合計，B／C 排除；單位、老師、效期、已保留額度與來源限制仍檢查。
- 名單、後台選卡、排課收費選單、前台資格與實際預約使用相同科目證據。舊模板別名從同店資料讀取，不接受前端宣稱科目資格。
- 已有有效綁卡沿用來源；未綁卡沿用既有先買先用。實扣與更正仍使用既有交易、單卡帳本與防重送流程。
- 方案商品選適用科目，兩種選課模式共用；選課開關、體驗報價與名額規則分開保留。共用美業表單維持原本 adapter 契約，音樂不套用運動規則。
- 舊 OPEN 卡保留餘額與歷史，新增使用前明示科目待核對。學員的課卡詳情可展開核對；要求原有權限及 OWNER／ADMIN、同店可管理成員、明確確認、版本核對、序列化交易、店鎖及同交易 AuditLog。只修改卡的科目快照，不修改商品、訂單、購買時間、餘額、效期或帳本；不同科目／用量的既有預約會阻擋。
- 使用現有 ASSIGNED 欄位表達已核對的科目／扣抵快照。未新增 migration；沒有讀取名稱猜科目、批次回填或正式權益變更。

## 已取得證據

- 資格、合計與排課模式單元測試；服務與 action 的未授權、換店、非成員、過期版本、原始來源卡、不同科目預約與重送測試。
- `sports-card-modes.pg.test.ts` 使用 Docker 本機 PostgreSQL 的明確 `steamfoot_test` 資料庫，每輪建立隨機 schema 並清除；本檔 12 項及同行／候補 PostgreSQL 檔 14 項，共 26 項通過。包括兩種模式同科目實扣、B 科目不扣、舊無科目卡阻擋、重複點名只一筆扣抵、既有綁卡保留、FIFO 併發、還點回原卡、舊卡確認交易強制失敗整筆回復與成功重送只一筆稽核。未連正式／遠端資料庫。
- 8 個相關測試檔 177 項回歸通過；科目確認 action 與 checkout 另 7 項通過。排課收費、共用美業表單與後台指南另 6 檔 20 項通過。
- `scripts/qa/course-subject-browser.mjs` 以實際 React 元件配合合成資料與 stub actions，所有網路請求阻擋。1440×900、1024×768、768×1024、600×768 無水平溢出；只有開放選課仍有科目；明確勾選才可儲存；失敗保留選擇，重試保持相同識別及版本；回覆遺失會鎖住原意圖、只重送同一收據，未確認結果不顯示成功，無 pageerror。截圖與 JSON 輸出在 `/tmp/course-subject-ui/`。
- 最終型別檢查 `tsc --noEmit`、變更檔案 ESLint 及 `git diff --check` 通過。最終全量 `npx vitest run --testTimeout=15000`：1,752 檔、16,483 項通過，33 檔／298 項略過；隔離 PostgreSQL 的 26 項另以明確本機測試 URL 執行通過。略過項目不當成已驗收。現有巢狀 Resend mock 提示仍存在，未修改不相關測試。

## 2026-11-11 隔離預覽實際驗收（台灣時間）

- Draft PR：<https://github.com/rock7652-beep/steamfoot-booking/pull/1538>；分支 head `4417b64a`。預覽 deployment `dpl_5Fk9jzaYNm5ZWoo5uNiJ6MRLPD3W` 已 READY，來源 `69b34743`；與 head 差異僅 PostgreSQL 測試，不涉及執行程式。
- 使用專用 QA 專案、受限資料庫角色與 `addons-qa-fitness`。已取得使用者授權建立 23 小時預覽分享及進行實際驗收；分享 token、密碼和瀏覽器登入狀態不進版本庫。
- 真實 OWNER 帳密登入成功，沒有 mock 身分或 action。指定學員名單確認 A1（2堂）＋A2（5堂）＋A3（3堂）合計 10 堂，B1／C2 及待核對 OPEN 舊卡均未計入。
- 真實舊卡核對 action 成功，1366／1024／768 寬度無水平溢出。只在明確勾選後確認。資料庫覆核：舊卡轉為 A 科目快照、剩餘仍 19 堂、到期仍 2027-11-10T00:00:00Z；只有原 GRANT 19，沒有新增扣堂；CONFIRM_CARD_SUBJECT 稽核恰好一筆。
- 本機相關 PostgreSQL 共 59 項通過；當前 head 的 mixed workflow 42848571719 成功（41項不略過＋4項核心流程）。預覽來源的完整 CI 42847413826 重跑成功；原本一次不相關 PGlite 初始化逾時已單獨覆核並重跑失敗工作。Cloudflare Workers 檢查仍失敗，不能宣稱所有檢查全綠。
- 初次驗收時，QA 的 CourseBooking、CoursePointEntry、OperationAuditOutbox 既有 RLS 僅允許前一批列名帳號／學員，阻擋本次專用身分。之後取得明確的限時權限授權，完成下節真實交易驗收並恢復原政策。未用管理者 SQL 代替扣堂交易。
- 驗收輸出位於執行工作區 `/tmp/subject-hosted/`；該目錄的 state.json 是私密登入資料，不可分享或提交。

## QA 扣堂驗收權限範圍（已核准、執行並恢復）

使用者於本對話明確同意。目的只限完成兩堂合成課程的預約、點名、防重送及恢復待點名測試。以下為實際執行的限制；驗收後11條政策已逐條比對與原始定義完全一致。

- 只修改隔離 Supabase 專案 `ttworfzgwejdeolegkxl` 中角色 `steamfoot_compact_qa_20261103` 的既有測試白名單政策，不動正式專案，不關閉 RLS，不增加管理者權限。
- 門市限 `addons-qa-fitness`；操作者限 `compact-qa-20261103-subject-20261110-owner`；學員限 `qa-subject-20261110-student`；課程限 `qa-subject-20261110-session-OPEN` 與 `qa-subject-20261110-session-ASSIGNED`。
- 可扣抵卡限本次 `qa-subject-20261110-A1/A2/A3/B1/C2/OLD` 六張合成卡；實際扣堂仍由應用程式檢查科目。帳本只允許上述課程預約的保留、實扣與還堂操作，不允許加值、退款或其他學員操作。
- 權限截止 2026-11-11 23:02:49 台灣時間（15:02:49Z），與預覽分享到期一致。驗收後恢復原政策。
- 執行前保存原政策定義並核對未變更，在交易中只新增上述精確條件到必要 permissive／restrictive 政策，保留其他測試範圍與原到期限制；回復交易再次核對套用後定義未被他人修改，然後恢復原11條政策。RLS全程啟用，角色沒有 superuser／bypassrls。隔離QA留存兩筆政策套用／回復 migration歷史，不是應用程式資料結構 migration。

## 2026-11-11 實際預約、扣堂、防重送與還堂結果

- 重用同一個 READY Vercel 預覽，不額外建置。真實登入＋真實 Next Server Actions，沒有替身身分或 action mock。
- OPEN 從名單「＋學員」搜尋合成學員：舊卡已核對後有4個A科目可用方案（A1/A2/A3/OLD）；B1/C2排除，成功新增一筆預約。點名前科目合計29堂；核對前已驗A1/A2/A3合計10堂、未知舊卡19堂不計。
- OPEN、ASSIGNED各從畫面點名，兩筆預約皆綁最早購買A1、每筆1堂。兩堂同時ATTENDED時A1由2堂變0，A2仍5、A3仍3、B1/C2各10、OLD仍19；各卡到期日不變。
- 兩種模式皆捕捉原始已登入點名HTTP請求，在同一瀏覽器同身分重送；回應成功，權威資料庫對帳無新增重複扣抵。單次只扣一張A卡。
- 透過畫面「恢復狀態」還堂，皆返還原A1，最終六張卡餘額回到2/5/3/10/10/19，兩筆預約回RESERVED；ASSIGNED依原規則解除待核對綁卡，OPEN保留原來源卡與預約保留。
- OPEN第一輪點名已成功，但測試器的獨立request replay遇環境直連拒絕；先實際還堂，再改從原瀏覽器傳送捕捉到的請求驗證。故帳本有OPEN兩次真實出席＋兩次還堂、ASSIGNED一次出席＋一次還堂，總計3 DEBIT對3 CORRECT，淨扣0；不是重送產生重複扣堂。
- reserve、attend-open、attend-assigned、restore-open、restore-assigned最終瀏覽器驗收皆complete=true，無pageerror或HTTP錯誤。前述腳本第一次等待錯誤的搜尋／選單標籤與SSR尚未hydration的點擊已修正，只以最後一次完整操作及DB對帳作證據。
- 臨時政策已恢復，11條的qual／with_check／角色／cmd／permissive與保存的原始快照完全一致。不得以此歷史授權再次放寬政策。
- 嘗試從連接器以SET ROLE驗負向規則時，連接器拒絕切換角色，後續測試INSERT未執行；未繞過、不計為負向RLS測試通過。
- 可提交的無憑證證據：[hosted驗收JSON](evidence/course-subject-hosted-20261111.json)。原始政策與回復SQL保存在私密/tmp檔案，分享token、登入狀態及密碼未提交。

## 驗證限制與待發布事項

- 尚未合併或發布正式站；沒有更改正式卡片、帳本、LINE 綁定或通知停發設定。PR仍為Draft，Cloudflare Workers檢查失敗狀態保留。
- 本次hosted驗收已補齊後台兩種模式的合成學員扣堂與還堂；手機會員入口、完整購買流程不是本次hosted驗收已通過項目，購買核心另有CI PostgreSQL證據。
- 正式舊卡仍需依原購買資料逐卡核對，商品改科目不會回填已購卡。正式資料確認及正式發布另需明確授權。
