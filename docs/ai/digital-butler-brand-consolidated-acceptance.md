# 品牌集中隔離驗收：建置前檢通過，瀏覽器登入前失敗

原 Draft PR #1596，runtime SHA `e3c65c77ac3481cb8f00d68772ad1e427a0e8472`。**本輪雲端功能驗收未完成，不能標記五項流程雲端通過。已執行失敗清理並核對完成。**

## 原授權與實際執行

沿用[已批准範圍](digital-butler-brand-consolidated-preview-review.md)，另經使用者明確同意：既有 Secret／角色／TLS 由唯一新版建置中的唯讀前檢驗證，通過後才啟用測試帳號及功能。沒有把 Secret 拉出或旋轉憑證。

| 項目 | 實際結果 |
| --- | --- |
| 目標 | 原 Vercel 專案／支線；僅 steamfoot-preview `ttworfzgwejdeolegkxl` |
| 固定窗口 | 台北 2026-11-27 08:32:55 至 09:02:55，包含建置；沒有延長 |
| 建置 | 唯一一次 `dpl_7AQPDTyb2kvYMH62vTqEZCcwydbr`，READY、target=null（Preview），Git SHA 正確 |
| 前檢 | 既有隔離角色、嚴格 CA／TLS、BEGIN READ ONLY、總停止true、四店off、品牌HIDDEN/off、知識未發布、全域2690 micros／concurrent0 全通過；migrations_skipped=true、deliveries_blocked=true |
| 存取 | 僅新部署建立一條 1446 秒連結，不超過剩餘窗口；失敗後撤銷並二次核對 shareable=0 |
| 短效設定 | 安裝限定 helper EXECUTE、兩個支線窗口變數，再於 READY 後安裝六條 RLS／13 欄 INSERT 並啟用原合成 ADMIN；全部已還原 |
| 中斷點 | Chromium 初次開啟登入頁即 ERR_CERT_AUTHORITY_INVALID，尚未填入帳密或送出登入 |
| 活動／成本 | 成功登入0、StaffLoginRecord新增0、知識異動0、Mock0、人工恢復0、操作稽核0、OpenAI0、真實訊息外發0；API費用0，建置費未取得實際帳單 |

[窗口／部署](../../artifacts/ai-digital-butler/brand-consolidated/window.json) · [實際建置前檢](../../artifacts/ai-digital-butler/brand-consolidated/build-preflight.json) · [失敗報告](../../artifacts/ai-digital-butler/brand-consolidated/hosted-result.json)

原 helper／RLS 安裝使用已審查 SQL，角色非 super／非 bypass，有效期及原額度完全未改。未改正式 Webhook、Production、其他支線或 Cloudflare 設定；沒有重新建置或補發連結。

## 清理核對

- 總停止 true；品牌 HIDDEN、enabled=false、setting revision1、knowledge revision0、未發布。四店仍 off。
- 原合成 ADMIN SUSPENDED／passwordHash=NULL／updatedAt 更新；六條短效政策剩餘0，新增13欄 INSERT=false、helper EXECUTE=false。
- 原 Store Request53／Dispatch113、品牌 Request0、操作稽核0。既有預算1000000 micros、日20／月100及角色有效期 `2026-12-02T14:15:52Z` 未變。
- 部署分享連結撤銷，回應及獨立部署 metadata 均 shareable=0；兩個支線窗口環境變數剩餘0。外發封鎖1、美業通知0。
- CLI 已登出；本輪私有密碼／hash／SQL／分享 token／暫存及 CLI auth 目錄均已刪除。瀏覽器在失敗後關閉。
- 未建立登入 session 或 application cookies，因此舊 cookies HTTP403／session無使用者的補驗本輪**不適用／未執行**，不能引用前輪結果當成本輪通過。

第一次清理 migration 呼叫回覆確認已過期，按工具指示重新取得後第二次成功；隨後重新 SELECT 核對全部安全狀態。沒有在清理受阻時繼續驗收。

[資料庫清理實證](../../artifacts/ai-digital-butler/brand-consolidated/cleanup-database.json) · [部署／變數清理](../../artifacts/ai-digital-butler/brand-consolidated/cleanup-vercel.json)

## 瀏覽器 TLS 根因及修復

這次前檢漏了**瀏覽器本身**的 TLS 驗證：資料庫 TLS 通過不代表 Chromium 可存取其憑證資料庫。Chromium 的 NSS 日誌為：

```text
Error initializing NSS with a persistent database (sql:/home/agent/.pki/nssdb): NSS error code: -8126
```

系統 TLS 客戶端嚴格驗證可取得同一部署的匿名302；既有 NSS 已含執行環境代理 CA（SHA-256 `C7:1B:4D:1E:9D:77:75:C5:38:C6:88:AB:10:CE:A9:CE:41:7D:73:12:E8:98:38:F9:D1:5F:F7:32:56:CD:7F:C3`）。問題是沙箱中瀏覽器無法正常以讀寫模式開啟既有 NSS DB，並非缺少 CA。

擬新增 CA 的命令曾遭自動審查拒絕，理由是未授權的持久信任設定變更；該命令沒有執行。後續核對證實不需新增 CA，採用更小的正常瀏覽器 DB 存取權限；匿名 Chromium 嚴格 TLS 已通過，前後憑證清單完全一致，**沒有新增信任、沒有 ignoreHTTPSErrors／忽略憑證旗標**。此匿名探測未使用分享 token，也未登入或讀取受保護業務資料。

[根因比對](../../artifacts/ai-digital-butler/brand-consolidated/browser-tls-diagnosis.json) · [嚴格瀏覽器探測](../../artifacts/ai-digital-butler/brand-consolidated/browser-strict-probe.json)

新增開窗前工具 [ai-brand-browser-tls-probe.mjs](../../scripts/qa/ai-brand-browser-tls-probe.mjs)。呼叫端需授予瀏覽器對既有 `/home/agent/.pki/nssdb` 的正常檔案讀寫（僅測試機），腳本檢查憑證清單前後一致，從不匯入 CA。實際 hosted runner 的每個瀏覽器程序也需相同正常存取；先以匿名 Preview URL 探測成功，再申請連結／開窗。

原先「舊 Preview fetch」工具會建立約23小時連結的路徑亦已遭審查拒絕，沒有執行。本輪僅使用已批准的新部署短效連結一次，不改走長效繞路。

## 尚未驗收及下一輪條件

本輪未能驗收登入後開關、知識、Mock、人工接手／恢復、用量、六尺寸及舊session HTTP拒絕；前五個小任務仍是本機通過。CLI／權限／SQL 前檢與部署的實際成功不替代這些功能結果。

本輪按失敗條件已結束，原單一連結及一次建置授權不可重用。部署內寫入截止時間是固定建置環境值，不能用改專案變數延長既有 runtime；不會自行補發、延長或重建。若使用者另批下一輪，需先完成匿名 Chromium TLS 前檢，固定新30分鐘／一次必要 Preview／一條短效連結與相同角色及操作上限，前檢通過後才啟用合成帳號。仍維持真實 API／外發0、Production不變與完整清理。

[hosted runner](../../scripts/qa/ai-brand-consolidated-hosted.mjs)已備妥但尚未跑過登入後各階段；不能稱整支腳本已完成雲端驗證。Node語法及ESLint通過，未修改產品程式。Cloudflare及舊課程 teardown 繼續獨立列管。原PR維持Draft、不合併。
