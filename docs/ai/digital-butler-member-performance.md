# 本人預約入口：效能盤查與互動修正

2026-11-26（台灣時間），沿用 Draft PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，支線 `feat/ai-digital-butler-core`。已更正舊計時定義，完成隔離前後量測，修正畫面先出現但首次點擊無反應的問題。沒有改登入、會員確認、權限、查詢、快取或其他模組業務規則。

## 版本與範圍

- 原程式／Preview：`48a6391ec2974a6f40c98392605c2bc89fccd0d8`，`dpl_G2DchZU8Dpc8UUUAabjd6YcnNxVF`。
- 修正版程式：`8fe39aaa61f9365ba16742b61e509bab405c6ce8`；後續文件／證據提交以 PR head 為準，沒有再改產品程式或重建。
- 修正版 [受保護 Preview](https://steamfoot-booking-3yxjqy6iz-rock7652-2111s-projects.vercel.app)，`dpl_EfLwdm8shw7HEWF4tmUhPsFetkXw`，READY、來源 SHA 相符。
- 同一隔離庫 steamfoot-preview `ttworfzgwejdeolegkxl`、同一合成會員 A、同店、同一筆 2026-11-27 10:00／1 人／CONFIRMED，沒有新增 fixture。main 基準 `378cd9475317f6c4ab804f0e48642f1d4f0f567a`。

## 原 11–18 秒的真正定義

原 QA 的 `entryMs` 從開啟登入頁開始，包含登入頁、自動填表、登入／轉址、工具換分頁、原生目標頁及 networkidle 等待，不是登入後單頁載入時間，也不是查詢結果完成時間。先前聊天將其描述成單頁等待不準確；已更正 [原驗收](digital-butler-member-bookings-acceptance.md) 與 [原 JSON 計時定義](../../artifacts/ai-digital-butler/member-bookings/hosted.json)，原數值保留，不據此判定資料庫或冷啟動慢。

程式盤點有重複會員查核，但沒有量到它們是主要瓶頸，因此不刪安全檢查或添加跨請求會員快取。新量測的原版 TTFB 約 0.46–0.52 秒，DOM 約 0.84–1.51 秒；不能把整段登入合計當成資料庫查詢耗時。

## 已確認的問題與最小修正

原版在 DOM 出現後立即按「測試本人查詢」，三次診斷均未展開；控制重試量測的六次進頁亦全部需要第二次點擊。獨立探針保留了第一次點擊無反應、等待 1.5 秒後第二次成功的 [時間點](../../artifacts/ai-digital-butler/member-performance/click-probe.json)。畫面 SSR 按鈕已可點擊，客戶端互動尚未接好時會漏掉第一次操作。

只修改 AiMemberBookingsPanel：用 React useSyncExternalStore 區分伺服器呈現與客戶端準備完成，準備前按鈕 disabled／aria-busy，準備完成後才接受展開。沒有用空框或虛假成功掩蓋資料等待，也沒有減少讀前／讀後會員狀態與權益檢查。此元件原本就只掛載於精確 AI Preview 的兩個合成會員；正式會員與其他模組未掛載。

## 前後量測

[同一量測腳本](../../scripts/qa/ai-digital-butler-member-performance.mjs)，同一 Cloud Chromium／代理網路、1366×1024，重入另含 390×1024。每輪全新 browser context，登入後開原生會員頁，確認原預約存在且實際展開，再查本人資料；每輪同 context 重入兩次。不主動預取、不以 networkidle 判定完成。新 browser context 不等於已證明的伺服器冷啟動；未強制 Lambda 冷啟動、不是台灣實體裝置或 Production 延遲保證。

原版三輪有兩輪完整、一輪登入頁輸入框等待逾時，失敗保留；修正版三輪完整、無失敗。[Before](../../artifacts/ai-digital-butler/member-performance/before.json)、[After](../../artifacts/ai-digital-butler/member-performance/after.json)、[Summary](../../artifacts/ai-digital-butler/member-performance/summary.json)。以下為中位數（最小–最大），單位秒：

| 路徑 | 原版 | 修正版 |
| --- | --- | --- |
| 登入頁可填寫 | 2.480（2.113–2.846），n=2 | 2.305（1.806–3.825），n=3 |
| 送出登入至轉址 DOM | 3.067（2.016–4.117），n=2 | 2.577（2.396–4.420），n=3 |
| 登入後首次會員頁可操作 | 3.021（2.793–3.249），n=2 | 1.722（1.699–2.286），n=3 |
| 同 context 再次會員頁可操作 | 2.575（2.471–2.938），n=4 | 1.760（1.591–1.900），n=6 |
| 開登入頁至會員頁可操作，含工具填表／換頁 | 8.687（7.011–10.362），n=2 | 6.669（6.028–10.625），n=3 |
| 開登入頁至首次本人查詢結果，含工具填表／換頁 | 10.373（8.561–12.185），n=2 | 8.119（7.059–11.808），n=3 |
| 本人查詢，首查與再次合計 | 1.552（1.502–1.813），n=12 | 1.316（0.941–1.818），n=18 |
| 第一次有效點擊成功展開 | 0／6 次進頁 | 9／9 次進頁 |

原版第一次點擊失效時，腳本等待 1.5 秒才重試；這個等待已包含於原版頁面可操作時間。**不得把表中差距當成伺服器加速百分比**。確定改善的是首次點擊可靠性；查詢服務未改，查詢秒數差異不宣稱為 API 優化。登入仍有約 2–4 秒的個別階段，完整路徑仍可能達約 12 秒；沒有把等待搬到前一頁，也沒有宣稱整個任務只需 1.7 秒。

## 驗證與異常紀錄

- 本機會員身分／查詢／工具／實際 PGlite RLS 4 檔 34 項、型別與變更檔 ESLint 通過。
- [本機 UI](../../artifacts/ai-digital-butler/member-performance/local-ui.json) 12 情境、六尺寸，SSR 按鈕先停用、hydration 後可點，無 hydration error；其餘分頁、日期／actor 晚到回應、錯誤／空資料／重試維持通過。
- [修正版雲端](../../artifacts/ai-digital-butler/member-performance/hosted.json) 8 情境、1920／1366／1024／768／390／360 六尺寸通過：首次有效點擊、本人最少資料／private no-store、結果保留、收合重開、身分／店家／頁碼注入拒絕、錯 proof、未登入拒絕，以及實際停用後舊 session 的 API／UI 拒讀。errors／failures 均空。瀏覽器尺寸模擬不等於真機。
- 程式 CI [45765440552](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45765440552) 四個 job 成功，全量 1,863 檔／17,637 項 passed，36 檔／340 項 skipped，401.23 秒。音樂／運動／混合課程隔離 workflow 成功；Booking／editorial 依既有條件跳過。產品 diff 只有合成 AI 元件，沒有共享服務或其他模組變更。
- 初始工具三次未分類逾時與後續三次展開逾時分別保留在 [初始失敗](../../artifacts/ai-digital-butler/member-performance/initial-unclassified-failures.json)、[具名診斷](../../artifacts/ai-digital-butler/member-performance/initial-click-failures.json)，不丟棄後宣稱每次都成功。控制量測另有一輪登入頁逾時，亦保留於 before.json。
- 修正版功能重驗首次在瀏覽器 ERR_CERT_VERIFIER_CHANGED 時中止、尚未開始案例，保留 [失敗](../../artifacts/ai-digital-butler/member-performance/hosted-initial-tls-retry.json)。測試 helper 改為只對該特定暫時錯誤重試一次，重用同一部署後通過；沒有關閉 TLS 驗證或重建產品。不能將此事推定為原版登入逾時的確切原因。

## 安全、成本與收尾

使用者已明確批准短效通行連結及持有連結者可存取隔離 Preview 的風險。前一輪自動審查拒絕紀錄保留；本輪取得批准後，原版與必要修正版各建立一個 30 分鐘連結，依序使用、量測完成即撤銷。沒有公開連結、放寬 Protection、SSO 或正式存取規則。

只暫時啟用合成會員 A，結束後已 SUSPENDED／passwordHash NULL；B/C 維持停用，三個合成會員目前皆停用且沒有密碼。以舊 session 驗證拒讀，不宣稱全站 CUSTOMER JWT 全域撤銷。測試瀏覽器關閉，repo 外私密設定及協調旗標已刪除；原合成 Owner 本輪未登入或異動。保留既有 fixture，不刪稽核。

[收尾](../../artifacts/ai-digital-butler/member-performance/postflight.json)：global stopped=true、四店 enabled=false；requests 47 全 COMPLETE、估算 1,310 micros、Dispatch 65、audit 8；Booking 129、Customer 1,367、合成通知 0，均不增加。角色 connection limit 8、無 superuser／bypass RLS，原 DB 密碼、嚴格 TLS、Production、Development、其他 Preview 支線及真實外發封鎖不變。沒有新 DDL、模型請求或付費 IPv4 add-on。

僅一次必要 Preview 建置，沿用既有 Turbo、未改全專案機型；工具沒有單次 Enhanced 選項，實際平台帳單未取得。後續純文件證據提交不再建 Preview。Cloudflare 不在此 Vercel 原生路徑依賴內。

套用操作情境 01／05／06／07／08／10（初次／重入、返回、身分、更新、窄畫面、失敗）；搜尋、編輯、HQ 開通及交易寫入不在範圍。沒有新增會員操作指南；後台指南 205 題／96 待驗及其他產業／正式客服未驗邊界維持原狀。本次不代表完整 Phase 3 或正式可用。
