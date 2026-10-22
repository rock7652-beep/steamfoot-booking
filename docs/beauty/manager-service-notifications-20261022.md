# 美業店長服務通知共用接點

## 範圍與來源

隔離支線 `preview/beauty-ui-alignment-20261021`，起點 `5f6f765f`／前一版應用 `c3bc86f3`。只更新隔離 Preview，LINE 保持關閉，不修改正式站、資料表、角色或憑證，不新增排程。

沿用共用 `LineNotificationRecipientsCard`、`ManagerNotificationPreview`、`deliverManagerNotification`、Flex 卡片、收件人逐項偏好、持久去重及既有紀錄查詢。美業提供資料 adapter，未複製另一份 UI、扣次或帳務流程。

## 已接入五項

| 共用操作 | 美業資料與規則 |
| --- | --- |
| 當日新預約 | 會員自行預約當日服務才通知，一筆同行群組合併一則；不把店長代建普通預約當作顧客操作。 |
| 新體驗預約 | 公開體驗提交成功後，以實際群組分項列各服務與起訖時間；當日體驗採體驗或當日偏好任一開啟即接收，仍只送一則。 |
| 待確認付款 | 顧客方案申請成功且 BeautyPurchase 仍 PENDING，讀取該訂單原方案快照與後四碼；不讀課程或蒸足付款表。 |
| 服務未完成 | BeautyAppointment RESERVED，依實際 endsAt 加一小時判斷，掃描昨日開始以後的結束時間；不假設服務都一小時，不自動完成或扣次。 |
| 每日待辦摘要 | 台灣 09:00 起 15 分鐘內，有美業 PENDING 方案申請或昨日結束仍 RESERVED 的服務才送；錯過不補發，不混入其他模組待辦。 |

`src/server/beauty/manager-notifications.ts` 為美業 adapter；預約／方案申請由 `src/server/actions/beauty.ts` 在原交易提交後呼叫，通知失敗不推翻已提交交易。未完成／摘要接到原 `/api/cron/beauty-notifications`，未新增 cron。

普通預約與購買申請原 AUDIT 快照新增 managerNoticeEligible 布林，只記錄當時店家／環境允許通知與否；這不是發送佇列。缺少標記或停用期間標記 false 的舊資料不會因重新啟用或同請求重送而加入即時通知。原業務紀錄、收款、扣次與拆帳計算保留。

## 關閉與權限

- `src/lib/beauty/notification-policy.ts`：模組關閉、通知環境關閉或 Preview，observer／cron 在任何業務讀取、收件人處理、排送或發送前返回。原美業顧客服務 worker 也補相同 Preview 防護。
- 共用發送邊界再次確認美業 ACTIVE／非 demo、LINE 授權、BeautySetting.notifications；只接受上述五種已接入類型。每位收件人建立紀錄前與外送前重查店家、服務／訂單、個人開關／偏好及目前 LINE 綁定；已關閉則停止，已建立的紀錄明記 SKIPPED。
- 關閉時保留原紀錄，不搬收件人、不改全域開關，不發任何真實 LINE 訊息。美業及課程均不從舊環境變數／Staff 帳號自動匯入通知收件人。
- 美業共用設定 action 必須通過 `beautyManager('business_hours.manage', true)` 的實際可寫店家範圍與 LINE 授權；母子店只讀、撤權及跨店皆不能寫。只讀頁面停用修改；本店有權人員可編輯既有通知偏好，但 LINE 關閉時 UI 與後端均拒絕建立新綁定。
- Steamfoot 固定時長未完成 worker 限 STEAMFOOT；共用舊每日摘要排除 BEAUTY，避免兩套來源重複或用錯付款／服務表。原運動／音樂來源、文案與規則保留並回歸。

## 驗收

- 19 個測試檔、179 項通過：三層關閉零讀寫、店家授權／opt-in、多人合併、當日／未來體驗、原停用期間不補發、原訂單快照、狀態重查、共用持久去重／原 retry key、收件人暫停、跨店／撤權／只讀拒絕與原預約扣次／方案／關懷／音樂運動回歸。
- 105 個合成瀏覽器案例通過：沿用實際共用元件，25 位合成人員、五個偏好與預覽，1920／1366／1024／768／560／390／360px 展開無整頁水平溢出、旋轉保留、LINE 關閉無新綁定入口、只讀禁止修改；封鎖後端及外部網路，不冒稱真實綁定或實體裝置。
- 最終 production Turbopack build、TypeScript 與相關 ESLint 通過；建置只用固定 loopback 虛擬連線，不執行 npm build／migration。最終 hosted 結果如下。最初未指定本機 QA 模式被既有環境守衛拒絕，接著發現本機 release QA tsconfig 缺漏；補回被 gitignore 排除的本機設定後通過，未放寬任何守衛。
- 驗證前 Preview 唯讀快照：15 筆預約、10 筆付款、所有付款種類合計 15500、卡片餘額 2 / 5、共用成員不變，notifications=false，通知收件人、店長發送紀錄、顧客訊息及關懷紀錄均 0；業務事件只有 AUDIT／SKIPPED。

## 尚待完成

真實 LINE 登入、官方帳號與收件人綁定、實際送達／跨日自然 cron、專用 worker 真實連線、實體 Safari／iPad 與店家簽收仍未完成。測試站沒有已綁定收件人，不能把合成設定測試當作真實 LINE 收件人設定已簽收。獨立角色通知守衛保留，正式資料庫及部署另行確認。

重要下一步：店家在手機／平板驗收提醒中心與既有三端流程；LINE 申請完成後，以指定測試官方帳號及收件人補驗登入、綁定與實際送達，正式啟用另行確認。

## 最終 Preview 驗收

- 應用 `43f207f91e62d95af1fd6128f5ff82b7442e1e92`；部署 `dpl_9P2q48ZqYx86v54uE4RiJXfZRXCH` READY，target=null（Preview）。網址 https://steamfoot-booking-55l2fryx7-rock7652-2111s-projects.vercel.app 。
- 店長入口：`/s/beauty-hosted-20261021/admin/dashboard/beauty?tab=設定&section=notifications&panel=reminders&panelQuery=tab%3Dmanager`。
- 9 項真實 hosted 驗證通過：共用店長頁 LINE-off／無綁定入口、五項實際預覽、1366／1024／768／390／360px 無整頁水平溢出、店長新綁定請求明確拒絕、未接入通知開啟拒絕、不存在本店名單的修改拒絕、顧客與技師寫入被路由層 HTTP 307 擋下，以及 cron 缺授權 HTTP 401。沒有建立收件人、修改偏好或執行真實發送。
- 第一輪腳本已有 6 項通過，但將會員端實際 HTTP 307 的拒絕誤判為失敗；調整腳本接受明確授權拒絕／轉向，再完整重跑通過。應用程式未因此更改；保留初次結果與原因，不掩蓋未通過的腳本紀錄。
- 驗證前後快照完全相同：15 筆預約、10 筆付款、總額 15500、卡片餘額 2 / 5、共用成員、notifications=false、AUDIT 87／SKIPPED 39；通知收件人、店長／顧客訊息與關懷發送紀錄均 0。
- 本版近 10 分鐘 Preview error／warning 查詢沒有符合紀錄；僅為有界觀測，非日後零錯誤保證。
- 驗收證據與本節以本機文件提交保存，不因補紀錄再次部署。正式站、LINE 開關、schema、憑證與部署保護均未調整。
