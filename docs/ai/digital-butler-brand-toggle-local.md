# 品牌 AI 開關：本機單一任務驗證

基準：原 Draft PR #1596／`7d530501fa3dffa21e76c3ad5ee36cc07453405c`。本階段只處理品牌AI開啟與關閉；不改既有雙服務核心、工作台架構或已完成成果。知識、問答、人工、成本操作、六通路及定價需求暫緩，沒有重新展開驗收。

## 已完成的開關修正

1. 沿用7d已有的稽核helper檢查，不重新開發。另以相同結構重現總停止競態：送出前仍運作、交易開始前總停止已生效時，舊程式仍可寫入enabled=true。現在在同一AiButlerControl交易鎖內再次核對，拒絕啟用；即使總停止生效，仍可關閉已啟用品牌。
2. 沿用既有AiButlerPanel及Settings工作台。品牌模式採用較新權威revision，修正重載資料進入已掛載元件後按鈕維持舊狀態、或較舊action回覆覆蓋新版的問題。門市模式仍採原本地編輯狀態，未重建入口。
3. 已知設定revision衝突明示「設定已更新，本次未儲存」；品牌回覆中斷明示結果尚未確認、需重新載入。沒有把未知提交結果當成回滾或成功。

## 使用與隔離庫一致的開關依賴

遠端只做SELECT讀取結構、catalog、ACL與安全狀態，沒有修改任何遠端角色、RLS、函式或資料。

本機使用PGlite PostgreSQL引擎，從唯讀結構快照建立User、Store、StaffLoginRecord與AuditLog的完整相關欄位、列舉、主外鍵；品牌及共享控制表沿用原已安裝SQL。驗證83個相關欄位的型別／NULL／default、相關約束、9表RLS開關及13條既有政策，並載入與原碼吻合的3個函式body與AuditLog上兩個真實觸發器。沒有複製門市營運資料；StoreSubscription只保留本機空的外鍵占位，不執行訂閱功能。

| 依賴 | 核對與本機結果 |
| --- | --- |
| AiButlerControl | 沿用現有server ACL／RLS；啟用必須在控制鎖內見到stopped=false。停止競態拒絕且無部分寫入；停止期間關閉成功 |
| AiBrandGrant | runtime只有SELECT；HIDDEN／LOCKED或授權期限不符不能異動。開關不修改HQ grant |
| AiBrandSetting | 固定ai-preview-brand-steamfoot；SELECT／INSERT／UPDATE及serviceId限定RLS。只允許enabled改動，保留模型、TEST通路、預算及額度 |
| User／StaffLoginRecord | 原完整欄位與enum；只在本機模擬原短效登入政策／合成ADMIN／SUCCESS稽核。撤銷帳號後，即使提供舊actor，AuditLog的User ACTIVE條件仍使交易回滾 |
| AuditLog | 保留完整欄位／FK及原SELECT，僅在本機模擬13欄INSERT及2條限定政策；本階段模擬INSERT操作白名單進一步收斂為setting |
| stamp_verified_audit_actor | SECURITY INVOKER，實際執行並核對actor、角色、名稱及同一成功登入稽核id；沒有略過或停用 |
| redact_audit_json(jsonb,integer) | 原已知缺失仍存在雲端，EXECUTE=false。本機先重現原缺權限，再只對此純JSON函式模擬待審EXECUTE；不授予其他函式或營運資料權限 |
| music_retirement_write_guard | 另一個真實AuditLog觸發器亦掛入本機。品牌storeId=NULL，走原本早退分支；不需要MusicOperationalArchive SELECT，也不修改封存保護 |
| 原有安全邊界 | 既有角色非super／非bypass、無新增角色membership；runtime沒有User寫入或Grant更新權。原角色有效期不變。預設窗口只允許setting，其他action在本機瀏覽器橋接層也拒絕 |

[結構／政策／函式快照](../../artifacts/ai-digital-butler/brand-toggle/readonly-metadata.json) · [列舉／約束／RLS](../../artifacts/ai-digital-butler/brand-toggle/readonly-structure-extra.json) · [原表ACL](../../artifacts/ai-digital-butler/brand-toggle/readonly-table-grants.json)

## 實際本機功能結果

| 完成條件 | 本機實際結果 |
| --- | --- |
| 開啟、關閉成功 | 真實共用BrandAiWorkspace按鈕呼叫既有brandManagement.saveSetting，寫入本機PostgreSQL引擎；兩方向成功 |
| 畫面與資料一致 | 每次確認開關、header及DB布林值；各成功異動revision增加1，對應一筆同交易AuditLog |
| 重載正確 | 實際page.reload重新讀取本機DB；開啟與關閉各方向皆保持。不是重新塞入預設開關資料 |
| 權威新修訂及晚到回覆 | 保持同一viewKey／元件掛載，送入較新DB狀態會更新按鈕；刻意延遲舊action回覆亦不覆寫新版 |
| 操作稽核 | before／after開關值與修訂正確；actor固定合成ADMIN、角色ADMIN、loginRecordId為其成功登入紀錄、storeId=NULL |
| 失敗完整回滾 | 在兩個既有觸發器之外，本機加一個真實PG append故障觸發器；確認設定內容、revision及AuditLog整組完全不變，再移除故障觸發器 |
| 缺helper、舊revision | 不寫入、不增加稽核；回饋明確。重送相同舊revision不能翻回開關或多寫一筆AuditLog |
| 提交後回覆遺失 | 本機刻意讓DB提交後丟失回覆；UI提示未知，reload對齊已提交狀態。此情況不宣稱交易回滾 |
| 不影響其他門市 | 四店設定／revision與本機測試前逐列一致，沒有Store操作。Brand Request始終0 |
| 安全機制 | 總停止阻止開啟、允許關閉；鎖定授權、過期窗口、額度修改、停用actor皆拒絕，沒有部分成功 |

六尺寸1920×1080、1366×900、1024×768、768×1024、390×844、360×800均完成本機開→reload→關→reload。無頁面橫向溢出，可見button／select符合44px，沒有新增入口。這是Chromium視窗模擬，非實體手機／iPad。

[完整本機報告與逐筆稽核](../../artifacts/ai-digital-butler/brand-toggle/local-toggle.json) · [六尺寸截圖](../../artifacts/ai-digital-butler/brand-toggle/) · [稽核失敗畫面](../../artifacts/ai-digital-butler/brand-toggle/audit-failure.png)

使用真實共用元件、真實管理核心、PG交易／RLS／觸發器；沒有以固定成功action代替開關寫入。不過Next router刷新與server action傳輸在本機由受限橋接層接線，並未執行雲端NextAuth登入、HTTP、Prisma傳輸／Supabase連線池或保護頁。不能把本機通過改稱雲端驗收完成，也不做效能／正式營運承諾。

重現命令：

```sh
npx vitest run src/__tests__/ai-digital-butler-brand-toggle.test.ts
node scripts/qa/ai-brand-toggle-ui.mjs
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

ESLint、TypeScript與既有AI／權限／導覽回歸完成。測試總數僅作輔助紀錄，以上開關實際結果才是本階段完成依據。沒有真實OpenAI、Mock、訊息外發、知識或人工異動。

## 未解決與下階段邊界

目前完整本機依賴就緒後未發現其他已知開關阻礙；真正雲端driver／session／部署組合仍未重新驗證。隔離庫保持總停止、品牌HIDDEN/off、四店off，現有角色缺少helper EXECUTE及本輪已撤銷的登入／稽核短效權限，均未擅自恢復。

狀態更新（2026-11-27，台北時間）：使用者已批准推送 `385281324` 並接受既有 Cloudflare 自動檢查；該提交已推送原支線，GitHub [CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45889649200) 通過。開關標記為 **本機驗證通過、雲端待驗**。原支線 Vercel 自動 Preview 維持停用，沒有手動 Preview 或遠端寫入。

Cloudflare Workers Builds 仍失敗，獨立列管，沒有修改其部署設定。新的小任務為[品牌知識庫本機驗證](digital-butler-brand-knowledge-local.md)，不擴大至問答、人工或通路。若進入集中雲端驗證，仍須另批必要 Preview、限定權限、測試資料與短效操作窗口；現在不執行。

本輪末次唯讀對帳：總停止true、品牌HIDDEN／false／revision1、四店off、helper EXECUTE=false、Audit INSERT=false、測試帳號SUSPENDED／密碼空；Brand Request0、Store Request53／Dispatch113維持。外發封鎖1、美業通知0、臨時寫入env0。[遠端狀態未變](../../artifacts/ai-digital-butler/brand-toggle/remote-state-unchanged.json)／[唯讀環境旗標](../../artifacts/ai-digital-butler/brand-toggle/readonly-env-flags.json)。沒有建立新短效登入、連結、遠端SQL安裝或Preview。
