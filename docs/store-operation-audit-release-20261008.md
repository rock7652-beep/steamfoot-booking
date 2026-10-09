# 門市操作紀錄獨立開關：隔離驗收草稿

## 範圍與來源

此版本以 main `549f95b48f0e14fde11f6e005467349b44a1da15`（已含 #1249）重新建立最小獨立變更。舊本地候選 `6cfbf22495ce1208d96d8587554eba3fbd35ed16` 的原始碼與 patch 無法在本次環境復原，因此本版是 reconstructed，不主張重用了舊候選，也不沿用舊測試數。

- 使用既有 StoreFeatureEntitlement，功能碼 `store_operation_audit`，不新增資料表或 migration。
- 所有方案、試用、展示店預設隱藏；只有明確 ENABLED 且在有效期間內才提供入口。
- OWNER 必須有本人於本店的 ACTIVE、isOwner Staff，且選擇自己的營運中／試營運門市。母店查看子店不取得此權利。
- HQ 切店使用同一授權；返回真正總部視角保留原完整稽核。
- 只讀門市 DTO 使用業務類型／動作白名單，保留時間、操作人、白話動作及有限數值／狀態。登入連結、session、IP、安全資訊、任意文字備註、總部事件與未知事件時身分均不提供。
- 關閉或到期只收回查看權，不影響持續記錄、補送或保留。原 writers/outbox/actor context 未修改。
- 原資料的「查看紀錄」也經同一後端授權與 DTO；人員權限等安全類型入口僅 HQ 可見。

## 明確限制

此為隔離驗收草稿，尚未正式上線或開通真實門市。未知動作與缺少事件時角色的舊紀錄預設僅 HQ 可查；需擴充白名單時另行檢查資料安全。

店舖中心提供日期與分頁；不提供 HQ 的登入互查或私密摘要關鍵字查詢。投影後沒有可提供的欄位不代表原始事件沒有異動。

## 發布前條件

1. 公開程式草稿與隔離驗收；不包含正式合併或正式店家開通。
2. 已整合 main `351356767`（含 #1251 諮詢收件、#1253 體驗表單與 #1254 名單密度）；各分支自動部署封鎖保留。最終檢查以草稿 PR 的精確 head 為準。
3. 分支 `feat/store-operation-audit-20261008` 自動 Vercel 部署關閉；只接受明確的隔離 Preview，Cloudflare provenance 拒絕。
4. 整合 #1251 的共用 build/runtime dispatcher，以 `store-operation-audit-preview` 獨立模式檢查此精確分支＋repo；sports 與 consultation 保留各自分支與 opt-in 規則，不冒用其他模式。DATABASE_URL 與 DIRECT_URL 都必須符合原有隔離資料庫、帳號、資料庫名與安全參數白名單。保留通知封鎖，拒絕任意 Preview、缺少 metadata、未知 provider、正式 DB 及不安全連線覆寫；沒有新增金鑰或資料表。
5. 合法隔離 Preview 上完成 OWNER／非 OWNER／HQ 切店／返回 HQ、off/on/expired、跨店 URL、單筆紀錄、登入路由拒絕及關閉返回等實際驗收。
6. UI 驗收入口：HQ 功能設定、三模組側欄、操作紀錄中心與原資料歷史彈窗。需驗 1366px／寬桌機、1024×768／768×1024 iPad、390px／窄容器、長文字、展開／關閉、Back／Forward。尚未完成 browser 或真機驗收。
7. 正式合併、部署與任何門市實際開通需另外取得相應授權。

## 驗證範圍

- 含 #1253 的本地整合：7,728 tests passed、120 skipped；changed-file ESLint passed。
- OWNER 同一 session 的撤回、HIDDEN、DISABLED、到期與身分停用會在每次 server action 重查，五項測試通過。
- 本地 TypeScript 驗證受記憶體限制中止，需由精確 head 的遠端 Typecheck 補證，不將中止列為通過。
- #1251 相容整合：10 個 guard／access 測試檔案、233 項測試通過；相容改動的 ESLint 與 diff whitespace 檢查通過。此輪未執行完整套件。
- 最終 #1251 整合與實際 Preview 驗收以 PR 更新為準。沒有可用的 OWNER／非 OWNER 測試帳號時，角色路徑只列 backend coverage；HQ 切店不冒充不同身分。
- tests、typecheck、lint、瀏覽器與實體裝置驗收彼此獨立，不以其中一項代替其他。
