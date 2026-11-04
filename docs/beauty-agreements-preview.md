# 美業服務共同約定測試版

2026-11-04 使用者決定優先製作美業，運動 PR #1505 暫不合併正式站。本分支沿用 #1505 的共用簽署與重點標示底層，美業使用獨立開關、入口與授權；本次不授權任何正式合併、部署或正式資料寫入。

- 後台入口：美業設定 → 服務共同約定、簽署紀錄。店家填規則 → 預覽 → 啟用／分享 QR。選用功能，不改預約、扣次、付款、方案或通知。
- 分成「服務共同約定」與「服務風險與注意事項告知」，各自勾選後簽一次，保存同一份 PDF。重點粗體底線隨不可變版本與 hash 保存，舊版不回填。
- 範本涵蓋一般非醫療美業服務，店家設定服務範圍、產品與操作說明、可能反應、事前注意、事後照護、應變及退費。各次項目／產品／部位／方式／時間／費用需事前說明確認，不能用一次簽名概括授權未說明的操作。重要條款或風險變更需另行告知確認。
- 不蒐集完整病史；必要過敏或皮膚資訊在服務前以適當方式私下說明。影像公開行銷須另外授權，拒絕不影響服務權益。本文件不免除店家與服務人員依法應負責任。

## 權限與保存

美業管理／查閱／匯出一律由 `beautyManager` 驗證，門市必須為啟用中的 BEAUTY，並保留 basic_booking、角色、員工、唯讀與訂閱保護。管理需 business_hours.manage，查閱需 customer.read + business_hours.view，下載另需 customer.export；不借音樂／運動的 courseManager 授權。

共用五張 Agreement 表及 PNG 保存，不新增 DDL。交易以 BEAUTY Store row lock 驗證當下模組與營運狀態，不呼叫會發送通知的課程交易 wrapper。原有音樂／運動路徑與 snapshot 相容。美業分項確認寫入獨立 `beautyAcknowledgement`，型別、文件 hash 及伺服器時間須與不可變版本一致；不能用 fitness 確認替代，也不依姓名／電話自動連結既有會員。

`BEAUTY_MODULE_ENABLED=1`、`BEAUTY_AGREEMENTS_ENABLED=1` 才能開放美業後台；公開簽署另需 `BEAUTY_AGREEMENTS_PUBLIC_ENABLED=1`。共用 server-only `COURSE_AGREEMENT_LINK_SECRET`；美業可以在課程約定開關關閉時獨立運作。公開頁保留 no-store、no-referrer、noindex 與 frame 保護；各店尚未啟用時不接受新簽署。

## 測試及發布邊界

本機 164 項相關與共用回歸測試通過，另新增美業 Preview 禁止 dedicated 生產連線與通知的隔離測試。`BEAUTY_AGREEMENTS_QA=1` 可執行既有設定／簽署 browser QA：桌機 1920/1366、iPad 1024×768/768×1024、窄容器 600/390，以及學員元件共用 360/390 等尺寸；合成 action、無整頁溢出、保留草稿與簽名、分別確認、失敗重送與換人清空。這不是實體手機或雲端後端證據。

`node --conditions=react-server --import tsx scripts/qa/beauty-agreement-pdf-artifact.ts` 產生合成 PDF；擷取驗證完整條文與美業用語，無課程／指導員／補課誤植。輸出 `/workspace/reports/beauty-agreements-pdf/`；操作 QA 輸出 `/workspace/reports/beauty-agreements-settings/` 與 `/workspace/reports/beauty-agreement-signing/`。

雲端 Preview 僅精確分支 `codex/beauty-agreements-preview`，同一個已隔離的測試 Supabase 專案，`BEAUTY_DATABASE_MODE=legacy`、`BEAUTY_NOTIFICATIONS_ENABLED=0`，不得有 dedicated beauty URL／role／password。維持既有 LINE 禁發及 migration skip；Git 自動部署關閉，正式分支配置不變。美業測試只使用新建合成 BEAUTY 店家與測試帳號，完成後停用管理帳號，保留供使用者試填的隔離入口及不可變合成證據。正式可用性與真機 Safari／LINE LIFF 仍須另行驗收。
