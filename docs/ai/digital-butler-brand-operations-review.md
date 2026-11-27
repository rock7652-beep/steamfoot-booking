# 品牌AI實際操作：前檢、本機驗證與一次性授權提案

2026-11-26，接續Draft PR #1596。本輪目前只做唯讀遠端核對、本機實作與測試；**尚未建立通行連結、啟用帳號、安裝ACL、寫入測試資料、變更HQ／總停止／品牌開關、呼叫雲端Mock或真實API，也沒有新部署**。

## 前檢與必要修正

既有READY部署 dpl_4MBBMDKK3X1MrTF8NJn5r3gEaqXi（runtime b72d3c925）已完成唯讀工作台驗收。隔離庫 ttworfzgwejdeolegkxl 仍ACTIVE_HEALTHY、總停止true、四店關閉、品牌HIDDEN／false／未發布、知識revision0、設定revision1。原Store Request53／Dispatch113、品牌活動0、月預算1000000 micros／日20／月100；合成ADMIN停用、密碼空、四條臨時登入policy=0。沒有重置或提高額度。

Vercel指定支線沒有AI_BRAND_PREVIEW_WRITE_OPERATIONS／UNTIL。環境變數不會回寫已建置部署，舊prebuild又一律拒絕寫入窗口，所以舊READY無法完成本階段；沒有為相同程式重建。必要本機修正：

1. 建置與runtime共用嚴格窗口驗證：明列七種操作、無重複／未知操作、有效期限最多30分鐘。預設仍唯讀；build仍必須驗總停止、四店關閉、品牌HIDDEN／false／未發布，且嚴格TLS。設定窗口不會啟用任何AI。
2. 沿用既有AuditLog，不新增表／角色／第二套工作台。知識、開關、人工操作及Mock接受事件與資料交易一併寫入稽核；失敗整批回滾。記錄可信actor、服務、時間、操作、修訂／版本及事件digest，不放原始對話／知識文字或憑證。Mock後續完成狀態仍以AiBrandRequest為權威；同event及人工恢復重送保留原識別，不重複帳本／稽核。
3. 避免單連線交易內另開全域auth查詢。入口與回應仍驗證操作者；交易內用原控制鎖、最新grant及AuditLog INSERT的User ACTIVE／非空密碼條件檢查撤銷。人工恢復保留原revision／待核對事件與commandId防重。
4. 品牌問答只留在「品牌知識」，狀態頁保留開關／用量及人工接手，恢復只走既有待人工清單。品牌動作後刷新權威摘要；沿用Settings骨架及RWD，不新增通路或工作台。

## 新ACL提案：尚未安裝

目前runtime角色AuditLog SELECT=true、INSERT=false；沒有對該角色或PUBLIC適用的AuditLog INSERT／ALL policy。採用[精確SQL](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-acl.proposed.sql)：

- 既有AuditLog新增 **2條policy**（SELECT、INSERT），僅既有 steamfoot_ai_preview_20261125、固定合成ADMIN、AI_BRAND_PREVIEW／AI_BRAND、AiBrandService／ai-preview-brand-steamfoot、storeId NULL。
- INSERT只授予SQL列明的13個欄位，沒有UPDATE／DELETE／其他表／角色權限。操作白名單七種，必須User仍為ADMIN／ACTIVE／有密碼，且未超過固定deadline。`__QA_WINDOW_UNTIL__` 必須於取得批准後替換為本輪絕對截止時間，不能原樣執行。
- 安裝guard拒絕既有INSERT權、其他適用寫入policy或任何role membership，遇不符即停，不擴權放行。
- 收尾執行[撤銷SQL](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-acl-revoke.proposed.sql)：撤銷新增欄位INSERT並移除這2條policy；保留全部AuditLog資料，管理通道可唯讀核對。

## 已完成本機準備

PGlite實際載入已批准品牌schema與本輪ACL草稿，使用同名最小角色：三態／期限、預設唯讀、儲存→審核→發布→編輯草稿仍引用舊發布→重審發布引用新版→未知轉人工→人工靜默→稽核恢復／重送→撤回，Mock零成本與獨立計數；另驗日額度拒絕、跨店／跨actor稽核拒絕、稽核append-only、稽核權限故障原子回滾、帳號已停用但舊actor尚未刷新仍不能提交、單連線安全。建置窗口測期限／未知／重複操作及停止前檢。

本機共用元件另驗六尺寸、單一問答入口及模擬儲存失敗保留草稿／縮放不丟輸入；使用假的拒絕save action，不是遠端寫入驗收。最終測試數與CI記原PR，不將本機資料稱為雲端結果。

## 一次性授權範圍（全部待批准）

| 範圍 | 最小具體動作 |
| --- | --- |
| 一次必要新版Preview | 原Vercel專案、原支線、修正版精確SHA；僅該支線暫設AI_BRAND_PREVIEW_WRITE_OPERATIONS=save,publish,withdraw,setting,handoff,resume,test及UNTIL=建置前T0+30分鐘，期限包含建置時間；不改Production／Development／其他Preview。建置費用無法精確估算，不為延長窗口重建 |
| 新版限定存取 | 僅該新部署一條最多30分鐘通行連結，ttl不超過操作窗口剩餘秒數；持有者期限內可存取。沿用原合成ADMIN，臨時密碼、原4條時限登入RLS，最多1次成功登入及必要稽核更新；不建立新帳號或DB角色 |
| 操作稽核 | 僅隔離庫安裝上述2條限定policy及13欄INSERT；與4條登入policy合計6條，全部於結束移除。保留帳本及稽核，不刪表、不改有效期限 |
| HQ三態 | 僅合成品牌AiBrandGrant HIDDEN→LOCKED→ENABLED，逐態重載驗可見性與操作拒絕；收尾HIDDEN。runtime仍無Grant UPDATE，管理通道執行固定主體狀態變更並記錄AuditLog；總停止與收尾管理異動亦記錄管理通道來源，不開放runtime修改grant |
| 知識寫入 | 僅該品牌新增／編輯合成FAQ、草稿審核、發布、撤回；最多12次成功知識異動，revision／publishedVersion只增不回退。合成稿保留為未發布，禁止門市引用與SYSTEM混入 |
| TEST總停止與品牌開關 | 為正向Mock及獨立開關測試，短暫將隔離AiButlerControl.global stopped=false，僅該品牌enabled=true／false；四店全程關閉。生效前再驗四店及外發封鎖；最後總停止true、品牌false。不改模型、通路或額度 |
| Mock上限與帳本 | 最多8筆新Mock請求帳本（包括任何重試產生的新筆）；伺服器於原控制鎖內檢查窗口內8筆硬上限；同event重送可查重而不新增筆數，人工期間與停用拒絕不應新增筆數。真實OpenAI=0、通路外發=0；不製造假付費成本、不提高／重置限額。Mock預期cost／held皆0；貨幣硬上限的正向保留測試使用本機PG，不宣稱雲端花費驗收 |
| 人工與異常 | 未知問題入本品牌人工清單、手動接手及最多4次成功恢復；同command重送、過期審核／舊revision／錯scope拒絕。保留Request、Conversation、HandoffAudit及AuditLog，未決事件不改成成功 |
| 回復與HTTP | 不論成功失敗中斷，先總停止true／品牌false／HIDDEN／知識未發布，再停用User、清空密碼、更新stamp、移除4登入policy並測原cookies品牌API403／session無使用者，撤銷連結並用全新cookies核對；撤銷2稽核policy及欄位INSERT，刪除兩個支線寫入窗口env與私有暫存，逐項核對。保留所有歷史；修訂不重置；若內容衝突只撤下發布並保留稿，不覆寫不明變更 |

本輪仍不開發自動預約、不接真實OA、不操作真實顧客或既有門市資料。六大通路盤查／Cloudflare失敗維持原待查，不改設定、不擴範圍。所有遠端操作必須等一次明確批准後才執行。


已實際核對AuditLog RLS=true、runtime無INSERT／UPDATE／DELETE、role membership=0；草稿SQL增加同等前置guard，不啟用或重設既有表RLS。撤銷檔移除兩條新增稽核policy與13欄INSERT，資料保留。六通路清單繼續保留LINE、Facebook Messenger、Instagram、WhatsApp、官網即時客服、Email；本輪只涉及品牌TEST／既有LINE共用核心，不實作其餘通路。

## 本機驗證證據

TypeScript（CI同設定6GB heap）與變更檔ESLint通過。核心管理／窗口／連線／稽核呈現4檔81項通過；最後型別修訂後管理／窗口2檔43項再次通過（數量重疊，不相加）。較廣AI與導覽回歸485項通過、6項略過；最終完整CI另記原PR。

[唯讀前檢](../../artifacts/ai-digital-butler/brand-management/operations-precheck.json)、[六尺寸及儲存失敗報告](../../artifacts/ai-digital-butler/brand-management/local-ui.json)、[失敗後草稿截圖](../../artifacts/ai-digital-butler/brand-management/failed-save.png)。瀏覽器console errors=0；6次唯讀審核加1次刻意拒絕的本機save，不是成功雲端異動。
