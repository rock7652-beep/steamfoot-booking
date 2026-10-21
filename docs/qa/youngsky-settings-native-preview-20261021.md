# YoungSky 正式架構隔離預覽驗收

目前狀態：本版五種設定的成功儲存／收合／回讀／還原，以及hosted桌機／iPad viewport補驗已完成；原先TinyFish錯誤畫面的根因仍未定位，兩輪可控瀏覽器未重現。PR維持Draft，未正式發布。最新完整證據見 youngsky-settings-hosted-evidence-20261021.md；以下保留各輪歷史。

- Draft PR：https://github.com/rock7652-beep/steamfoot-booking/pull/1383
- 精確 SHA：b3bc95c0e5d658621407ac87ec8830fa0fd7456c
- Vercel deployment：dpl_Aeu84Pf2tehBfWWYUW3p8PLaPNgs，Preview（target=null），執行區域 hnd1。
- 精確網址：https://steamfoot-booking-mfayhyzi2-rock7652-2111s-projects.vercel.app
- 登入：/hq/login?store=sports-live-flow
- 唯讀確認隔離店：sports-live-flow-store／sports-live-flow／運動流程隔離驗收店。

## 隔離與原生運動設定

新增精確分支至既有 sports redesign Preview guard，保留 Vercel preview、repository、兩個隔離 DB URL、明確 opt-in，並額外套用原 module guard 的嚴格 URL 參數檢查。缺少 opt-in 時不得退回一般 module preview。只為此分支新增 SPORTS_REDESIGN_STAGING=1、SPORTS_REDESIGN_PREVIEW=1、AUTH_TRUST_HOST=true，未修改正式環境變數、資料庫、帳密或第三方憑證。

建置紀錄確認：[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true。Next production build 完成；這是 Vercel Preview 的 production bundle，並非 NODE_ENV=development 本機伺服器。原生運動功能限既有合成驗收店；不複製 YoungSky 正式資料。

## 已完成

- 新增／既有 guard 兩檔 37 項通過；修改的 guard 與測試 ESLint 通過。
- 最新 SHA 遠端 Changed-file ESLint、Typecheck、Targeted tests、sports-shared-card-postgres 通過。完整 Vitest baseline 已通過；Workers Builds 失敗，原因未確認，未宣稱所有 check 全綠。
- 透過 Vercel authenticated fetch：登入頁 200，data-dpl-id 為上述精確 deployment；session 回傳 null；未登入設定頁最終 x-matched-path=/hq/login。這些結果不算已登入業務驗收。
- 既有本機全量型別檢查通過、97 項功能回歸、40 個合成 Chromium 案例及 16 筆本機登入／DB 儲存結果，見先前隔離報告；不得混為此 hosted Preview 的結果。

## 待登入驗收

已依使用者要求開啟安全登入設定頁，等待其完成登入及 Save profile。未讀取密碼或雜湊，未更換既有測試帳號密碼，也未製造 session。

在精確 deployment／分支 alias 核對版本後，以合成店依序測試店家資料、預約與取消截止、銀行轉帳、候補、體驗。每筆保存原值，只修改合成驗收欄位，驗證回條、摘要更新、成功收合及重新開啟回讀，最後還原。量測實際 request duration、Server-Timing、trace ID 與回覆後收合；若工具無法取 network timing，明列缺口，不以操作錄影估算當 HTTP 耗時。桌機 1366×900／1920×1080、iPad 1024×768／768×1024 需實際 viewport 證據。

3.3 秒延遲、失敗、結果不確定與同步警告已有合成 fixture 驗證；不在共享隔離資料庫故意持鎖或破壞資料來製造故障。正式架構 Preview 只有自然重現超過 3 秒才進一步定位，不預先擴大優化。登入完成不代表取得正式發布授權；維持 Draft 至完整驗收與發布安排確認。


## 2026-10-21 12:06–12:11 Asia/Taipei 登入後首輪

使用者完成安全登入並 Save profile 後，TinyFish run `b18e1a75-cca5-4de7-a651-95f6df002043` 成功進入分支 alias 的隔離驗收店。記錄：https://agent.tinyfish.ai/runs/b18e1a75-cca5-4de7-a651-95f6df002043 。未索取或讀取密碼。

| 設定 | 測試／還原 | 結果 |
| --- | --- | --- |
| 店家資料 | 店名追加 QA1021 → 恢復原名 | 實際儲存成功、toast、編輯器收合、重開回讀與還原通過 |
| 預約與取消截止 | 首輪誤點另一列「預約開放期限」 | 未驗收；日期輸入失敗不能當截止規則通過，未儲存新日期 |
| 銀行轉帳資訊 | 首輪未開到編輯器 | 未驗收；摘要「未設定」不能推論沒有可編輯銀行欄位 |
| 候補 | 2 → 3 → 2 人 | 儲存、收合、重開回讀與還原通過 |
| 體驗 | 499 → 500 → 499 元 | 儲存、收合、重開回讀與還原通過 |

自動瀏覽器回報總結誤寫 4/5；依逐項證據，首輪只能列 **3/5**。對 HTTP timing／Server-Timing 不可見，並非伺服器未送 header；本工具無法取得 network 明細。首輪未量測指定 viewport，不能把未觀察到溢出當 RWD 通過。

後端同 deployment 同時段 trace：店名兩筆 528.6／298.5 ms；體驗兩筆 365.3／355.2 ms；候補兩筆 236.2／214.7 ms，outcome 均 saved。設定 hub 525.1–592.7 ms；共用 layout 679.2–1005.1 ms。巢狀 span 與平行 hub/layout 不相加；這些不是完整 HTTP 或畫面耗時，不能斷言端到端低於 3 秒，也不能證明 10/19 正式操作的原因。去識別 trace 已存 artifacts/youngsky-settings-integration-20261021/hosted-preview-traces.json。

deployment API regions 顯示 hnd1，但 runtime logs 記為 sfo1；保留此差異，未據此斷言部署區域已修正或變更任何正式設定。

隔離資料庫唯讀核對：原店名、bankName=null、bookableUntilDate=2099-12-31、trialDefaultPrice=499、bookingLeadMinutes=0、cancellationLeadMinutes=0、defaultLimit=2。無資料庫寫入或 migration。

補驗 run `da876d5f-d3fa-4160-ba50-cd84945069c4` 已結束，但未完成截止規則或銀行名稱的修改／儲存／還原。它把選錯同名修改按鈕推論成 UI bug，證據不足，未採納此根因。


## 補驗與唯讀診斷結論

唯讀診斷 run `a9385796-259d-424d-afab-3d6c9454dc59` 透過銀行那一列的確切按鈕成功開啟「編輯銀行資訊」，含 bankName、bankCode、bankAccountNumber。這證明先前「銀行表單不存在／所有修改按鈕皆開錯」的結論不成立，不因此修改網站業務邏輯。該次工具回報 input 值 True 與資料庫 bankName=null 不一致，因此不採計其欄位值解讀，亦不以此建立測試值或回寫。銀行資料的完整儲存驗收仍待完成。

補驗出現不在測試計畫內的誤點：
- AuditLog 確認 12:18:04 Asia/Taipei 自行請假 selfLeaveEnabled true→false，12:18:18 false→true，已還原。
- 值班聯動儲存有一筆 outcome=error、handler713.5ms，未啟用，資料庫 dutySchedulingEnabled=false。
- 後續唯讀 SQL 確認店名、bankName=null、日期2099-12-31、體驗499、候補2、booking/cancellation各0、selfLeaveEnabled=true、dutySchedulingEnabled=false。

兩次補驗沒有取得指定 viewport 的尺寸量測或截圖，不宣稱 hosted 桌機／iPad 驗收通過。fixture 的40案例仍只屬隔離元件驗證。

完整去識別 trace：hosted-preview-final-traces.json，共6筆本次目標的成功儲存，handler214.7–528.6ms；hub26筆471.4–675.5ms；layout26筆656.5–1005.1ms。沒有觀察到這些計時區段超過3秒；但缺端到端HTTP、hydration／畫面收合時間，不能宣稱頁面等待均低於3秒或正式站已加速。

最終交付判定：**登入後驗收3/5完成，截止規則與銀行完整保存／還原，以及hosted尺寸驗收尚未完成，維持Draft，未合併或發布。** 不因未重現後端>3秒而擴大效能修改。重要下一步：使用可明確限定DOM目標、讀取network並設定viewport的已登入瀏覽器補齊缺口，再安排發布；不得以補驗工具的推測直接改動按鈕處理。
