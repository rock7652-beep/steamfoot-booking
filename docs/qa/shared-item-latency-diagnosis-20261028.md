# 超過兩秒的延遲原因（2026-10-28）

> 本次上線審查版本不包含新增的驗收截圖及原始結果檔；下列 artifacts 路徑為當時紀錄的來源，並非此版本內的連結。驗收結論僅適用所載版本及條件。

結論：目前主要的可修正問題是付款後多階段重讀、同請求重複授權，以及美業 Server Action 完成後連帶重建後台外框。交易快不等於畫面已更新；先前拆出 GET 的改善尚未消除整段等待。本輪只分析既有真實購買的請求紀錄與產品來源 `8b7d81dc`，沒有新增交易、登入 fixture、部署或變更正式站，也尚未完成效能修復。

## 購買後餘額等待

| 入口 | 成功回饋 | 最新餘額可見 | 成功後額外等待 |
| --- | ---: | ---: | ---: |
| 運動學員頁 | 1,441 ms | 2,754 ms | 1,313 ms |
| 音樂學員頁 | 1,925 ms | 3,736 ms | 1,811 ms |
| 運動預約名單 | 857 ms | 3,183 ms | 2,326 ms |
| 音樂預約名單 | 1,366 ms | 3,191 ms | 1,825 ms |

上述是先前四個實購樣本，證據在 `artifacts/real-checkout/`。名單購買成功後會先關閉表單，接著 `await load(false)` 重新載入整個名單（`roster.tsx`）。學員頁則再讀課卡／音樂期別。運動學員頁後續 `card-read` 請求本身 1,297 ms，對應成功後額外 1,313 ms；因此不是單純等待成功動畫。

運動名單該筆後端 checkout handler 為 323 ms，交易階段 115 ms；音樂名單 committedMs=353、回應總計 669 ms，其中 purchase.snapshot=315 ms。這些階段有包含關係，不可直接相加。音樂帶 snapshot 回應後，名單仍會獨立重讀；快照不是目前所有入口都直接採用的名單結果。

## 美業：寫入後仍重建外框

兩筆購買用同一 requestId 對上寫入與 SETTINGS layout 計時：

| requestId 前綴 | 購買 handler | 其中 db_work | db_lock | 同請求後續 layout |
| --- | ---: | ---: | ---: | ---: |
| `vlhgp-1793161702685` | 889.2 ms | 140.3 ms | 7.7 ms | 911.7 ms |
| `sjr6f-1793161760059` | 815.5 ms | 121.4 ms | 6.7 ms | 878.2 ms |

`assignBeautyNativeCardCore` 在成功寫入後呼叫 `revalidatePath('/dashboard/beauty')`。日誌同 requestId 證明之後執行了 layout 重讀；外框內容包括 read_scope、read_audit、read_trial、read_plan、read_features、read_labels，標籤階段本身約 223／228 ms。這是付款 handler 計時以外的額外工作，不能只看 handler 就說客戶端應立即完成。

付款後共用 workspace 返回顧客面板並重讀課卡；原名單因 `moneyPanel` 開啟而 suspended，顧客變更事件延後至關閉面板才讓名單重讀。從付款至回到名單餘額的 6,255／6,267 ms 因而涵蓋寫入、外框、顧客卡片、關閉面板、名單與傳輸／呈現；不是單一 SQL 執行六秒。這兩筆沒有獨立記錄成功回饋時間，不能把六秒當純結帳回應時間。

## 美業：同請求重複做完整授權

`/api/beauty/customer-read` 先執行 `beautyManager('customer.read')`；卡片 port 的 `scope('wallet.read')` 又執行 `beautyManager('wallet.read')` 及 `beautyManager('customer.read')`。每次包含 session／門市／模組／有效人員檢查，形成三輪序列工作，而非單純多看三個權限代碼。

實測 `customer.cards`：

- 791.1 ms 中，三個授權 span 為 293.1＋169.2＋161.8＝624.1 ms，約 79%；cards＋holds_ledger 為 58 ms。
- 1,025.8 ms 中，三個授權 span 為 334.4＋233.5＋225.2＝793.1 ms，約 77%；cards＋holds_ledger 為 76.4 ms。

上面的授權 spans 是序列呼叫；外層 data span 包含內層工作，不另相加。購買 port 也序列呼叫 wallet.create、transaction.create 及顧客 scope，但目前沒有逐一完整計時，不把 handler 未歸因的時間全部算成授權。

## 名單、初次開頁與其他入口

付款後重新取得整個名單會連帶讀預約、卡片、購買、期別／課堂分配、權益與人員／位置等 metadata；目前不是只傳回此次影響的餘額。三模組均有這種重讀成本，業務分支不同，不能只修某一位顧客。

背景同步每三秒檢查版本，每次仍做授權。日誌可看到多筆版本請求，但本輪沒有隔離多個 browser tab／輪詢與操作的貢獻，不能把它定為六秒的主因，也不能把 background network idle 當成可操作時間。Server Action 佇列的既有診斷見前輪報告；本輪不為每一筆傳輸差額武斷歸因為佇列或冷啟動。

初次開頁前輪仍有運動 6.3–10.1 秒、音樂 4.9–12.3 秒樣本；layout 重讀已找到可修正部分，但本輪沒有新的整頁瀑布線量測，不能聲稱已完整解釋所有首次載入的每一毫秒。代表性 SQL 的既有 EXPLAIN 約 0.171／0.276 ms，只能排除那些代表查詢本身掃表很慢，不能代表所有 SQL 都快。

## 優先修復順序與驗收方式

1. 美業付款的 cache invalidation 與當前 UI 同步分離，避免成功回應等待整個後台外框重建；其他頁面失效及權限／收入檢查仍須保留。
2. 美業同一請求共用伺服器已核對的 session／門市資訊，各項權限仍分別檢查；移除內外層重複查身分，不以跨請求權限快取或跳過授權換速度。
3. 三模組購買回應帶回範圍明確、伺服器核對後的受影響餘額／名單投影，原地更新；必要的其他讀取並行或延後，不以客戶端猜加堂數取代權威查詢。
4. 補齊一段操作的 click、request start、commit、layout、response、balance visible 時間，按 requestId 對齊。整頁首次載入另量，保留冷／暖、樣本數及測試代理限制；功能完整與速度門檻分開驗收。

目前測試經網路代理。瀏覽器請求與後端 handler 的差額還包含傳輸、路由、框架及呈現，沒有足夠證據精確拆分；未測得新的正式站數據，不宣稱正式站必然相同或承諾修復後每次小於兩秒。

關聯證據：`artifacts/latency-diagnosis/beauty-correlated-traces.json`、前輪 `artifacts/real-checkout/`、`artifacts/item-auth-detail/`。正式發布仍維持未執行。
