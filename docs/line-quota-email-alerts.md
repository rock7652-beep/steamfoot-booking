# LINE 額度與 Email 通知

入口：蒸足「提醒管理」、運動／音樂「課程提醒管理」→「店長通知」中的「LINE 額度 Email 通知」。顧客提醒、教練通知與發送紀錄分頁不顯示此設定。既有及新店家全站預設開啟（ACTIVE／TRIAL，包含蒸足、運動、音樂）；展示、封存及非營運店家排除。具 `business_hours.manage` 權限者仍可自行關閉，排程初始化不覆蓋明確關閉的設定。

收件人固定為本店所有啟用中老闆（ACTIVE Staff + ACTIVE User、User.role=OWNER）的登入 Email，每次通知與重試都重新查詢。沒有手動收件欄位、不固定任何個人信箱、不以造訪後台的總部管理者代替店家老闆。多位老闆各自寄一封，地址 trim／小寫後去重；停用、降級、離店或信箱變更後，舊地址佇列會取消。缺少有效登入 Email 的老闆不會收到，後台提示至人員管理補齊；沒有任何有效老闆信箱時不能開啟。

後台只列出目前收件人，新店尚無設定列也顯示預設開啟，可直接按「寄送測試信給所有老闆」；首次排程或立即通知會初始化設定。每個地址有獨立發送結果及重試鍵，一位失敗不影響另一位的成功紀錄。

## 寄信設定與實際驗證

正式環境需要 `RESEND_API_KEY`、`RESEND_FROM`（Resend 已驗證網域的寄件人），以及既有的 `NEXTAUTH_URL`。`RESEND_REPLY_TO` 可選，預設 `steambutler500@gmail.com`。Gmail 是回覆信箱，沒有串接 Gmail SMTP，也不需要 Gmail 密碼。

2026-10-22 實際檢查：透過使用者已連線的 Vercel 帳號，確認 steamfoot-booking 正式環境已有 RESEND_API_KEY 與 RESEND_FROM。當前寄件人為「蒸足健康站 <onboarding@resend.dev>」，Resend 中的 steamfoot.tw 網域狀態為 not_started。向使用者提供的 steambutler500@gmail.com 試寄一封測試信，Resend 回傳 HTTP 403 validation_error，表示測試模式只允許寄至該帳號註冊者信箱，沒有成功寄出信件；未向其他信箱試寄。

Vercel 專案已驗證的正式網域為 steamfoot.com 與 www.steamfoot.com。steamfoot.com 的公開 NS 指向 Cloudflare；steamfoot.tw 查詢當下回覆 NXDOMAIN。應先確認並完成 steamfoot.com 的寄信網域驗證，再更換 RESEND_FROM。現有工具沒有 Cloudflare 管理連線，未變更 DNS、未更換正式環境金鑰，也未部署提醒功能。

原有 `src/lib/email.ts` 在沒有 API Key 時會只印出信件；新的通知服務會將缺少設定及服務拒絕視為失敗。

驗證正式寄信的步驟：

1. 管理者於安全環境變數設定中補齊 Resend 設定，於 Resend 確認寄件網域已驗證，勿將金鑰放進程式或聊天。
2. 在已審核並發布的正式環境，確認列出的本店老闆登入信箱、按「寄送測試信給所有老闆」。測試信每店每個老闆地址五分鐘限一次；關閉自動通知也可以測試。
3. 按鈕成功只代表 Resend 接受請求。收件人需確認收件匣／垃圾郵件，管理者確認 Resend delivered／bounced 狀態；沒有實際收信證據不能標示送達成功。
4. 確認收信後，由店家確認人員管理中的所有老闆登入信箱；既有店家與新店家都預設開啟，不預設把店家資料寄到總部 Gmail。

## 2026-10-22 網域驗證與試寄結果

使用者明確同意新增 steamfoot.com 作為寄信網域，並在 Cloudflare 加入 Resend 回傳的 DKIM TXT、send MX、send SPF TXT 與 rsend CNAME。Resend 網域及四筆記錄皆回報 verified。

已從「蒸管家 <noreply@steamfoot.com>」寄送一封測試信至 steambutler500@gmail.com，Reply-To 同為該 Gmail。Resend 信件 ID：01a161f8-5478-778a-a2aa-1fa689d5569c，查詢最後事件為 delivered（收件服務已接受，不等於使用者已閱讀）。

Vercel 現有 RESEND_FROM 設定已更新為上述正式寄件人；需後續重新部署才套用至部署中的應用程式。未變更金鑰，未發布提醒功能或套用正式 migration。取用金鑰的暫存檔已清除。

## 規則與排程

- 沿用既有每日 18:00 提醒 cron，查詢分店與共用 LINE 的月額度及用量。LINE 回應 `type=none` 表示沒有該額度上限，不能當成零額度。
- 每店、每月、每個 LINE 來源、每門檻、每個收件地址只建立一個事件。取當次最高門檻 80／95／100%，不補發已跨過的較低門檻。共用帳號用量包含其他店家，Email 有明確標示，應由總部處理。
- LINE 明確回報 monthly limit 時，在 Next.js `after()` 中於請求及預約交易完成後發通知。一般 HTTP 429 不視為月額度耗盡。命令列等無 request context 的呼叫由每日檢查兜底。
- 共用 LINE 額度耗盡會通知所有已開啟此監控的營業中店家；不調整原有顧客通知路由。
- 每日彙整前一個完整台灣營業日的 FAILED 紀錄，涵蓋 MessageLog、SessionBalanceNotification、ManagerNotificationLog。數字為紀錄數，可能包含重試，不能當作未收到通知的客人人數；後台須確認後續是否已補發成功。
- 沿用既有五分鐘 session-balance-retry cron 重試 Email，事件以十分鐘租約及 Resend idempotency key 防止併發雙寄。僅在事件建立後 23 小時內自動重試，避免超過供應商去重期限；超時紀錄留在後台供人工確認。測試信不自動重試。
- 不新增自動排程。`/api/cron/line-quota-alerts` 提供維運手動檢查，需既有 `CRON_SECRET`。
- Preview／來源不明環境沿用外部整合封鎖，不能透過此功能寄信或查 LINE。測試 fixture 的成功不代表實際寄出。

## 資料與發布

Migration：`20261022090000_line_quota_email_alerts` 新增 LineQuotaSetting 與 LineQuotaAlert；RLS 開啟並撤銷 browser role 存取，伺服器以既有授權存取。店別事件鍵唯一；不改預約、會員或既有 LINE 設定。

發布前需依專案現有正式 migration 流程審核／套用這份 migration，再發布依賴這兩張表的程式。目前一般 Production build 不會自動套用任意新 migration，不能只部署程式。未取得發布授權前不合併 main、不執行正式 migration。

## 驗證範圍

Vitest 涵蓋門檻、無限額度、速率限制區分、Preview 封鎖、寄信拒絕、每月重置、租約去重、收件人變更、每日日期範圍、權限與店別、交易完成後通知，以及 PGlite migration／索引／RLS。

畫面測試見 `artifacts/line-quota-email-20261022/`：實際共用元件與 CSS，伺服器 action／router 使用 mock。桌機、iPad 與窄容器無整頁水平溢出，修改後尺寸變化保留草稿。未驗正式登入、真實 iPad／Safari、正式資料庫與實際送信。
