# A 店專用 LIFF 開通（2026/09/20）

使用者本次明確核准新增 A 店 LIFF 及隔離系統對應；steam500 Messaging API 僅唯讀，不變更、不外發。

## 已完成設定

- Provider 蒸管家 2005295754；LINE Login「蒸管家｜會員登入」2010761154，Published。
- 新增「課程隔離驗收 A」，ID `2010761154-2BkMDceh`。
- 完整入口： https://liff.line.me/2010761154-2BkMDceh
- Endpoint： https://steamfoot-booking-git-codex-cour-7f6935-rock7652-2111s-projects.vercel.app/s/course-start-0918-a/liff
- Full，openid/profile，Add friend Off，未選 chat_message.write。
- 隔離專案 ttworfzgwejdeolegkxl：僅 Store id=store-course-start-0918-a 且原 liffId IS NULL 條件更新，RETURNING 確認一筆；方案仍 EXPERIENCE/TRIAL。不改會員、卡片、試用期限、配額。
- Console 詳細頁已讀回名稱、ID、endpoint、scopes及尺寸；原8個LIFF仍在清單。
- 實際完整 LIFF URL 開啟後返回正確 A 店 endpoint；桌面 Chrome 顯示 A 店名稱及「請從 LINE 開啟此頁」，未再顯示尚未開通。這不等於實體 LINE 登入已通過。
- 系統沿用 Store.liffId 動態讀取，無需硬編新映射／新金鑰或遷移。本次文件推送更新同一隔離預覽；功能沿用008c1295。

## 會員驗收界線

目前 A 店既有三位網頁會員皆未綁 LINE，不得把使用者的 LINE 覆蓋連成任一測試會員。
既有中央 LINE 帳號若尚無 A 店會員關係，exchange 會回 IDENTITY_REVIEW_REQUIRED，不能只輸入同名／同電話取得本店資料。新增使用者本人 A 店會員關係已另提出確認；確認後核對既有 Account 與固定 LINE subject，僅新增 A 店顧客及本店關聯，不改既有其他店身分。完成前不能宣稱本人可操作方案及預約。

可沿用課程：9/21 10:00 伸展瑜珈（點數卡每次2點／堂數卡1堂）；9/22 12:00 伸展瑜珈。實際名額與時間限制依畫面；本人成員及測試方案備妥後，再走本人預約→查預約→個別取消→占用釋放。教練工作需固定 StaffMemberLink，不因 LINE 登入自動取得。

## steam500 唯讀查核與後續缺口

官方帳號 steam500 @196rdlvi 的 Messaging API 頁顯示「未使用」，本次未點啟用，沒有新建其 Messaging API channel 或指定 Provider。
Login Channel Basic settings 唯讀欄位「Linked LINE Official Account」實際為 @329rmywc／蒸管家｜客服中心，不是 steam500；本次未修改此關聯。Add friend Off 保持關閉。
此 LIFF 屬蒸管家 Provider／會員登入 channel，不能把 steam500 圖文選單放連結視作 Messaging API 已串接。
後續若用 steam500 測試通知，需另外核准 Messaging API 啟用、Provider 歸屬、channel憑證在伺服器安全設定、店別發送路由、需要的Webhook及驗證收件人。依官方文件，Provider 指派後不可搬移；若需與目前 Login 共用LINE subject，應先審查同 Provider安排，不能擅自決定歸屬。真實事件、Flex 內容、則數、收件人獲准後才外發。

官方參考：https://developers.line.biz/en/docs/messaging-api/getting-started/

## 回復與禁止事項

如需回復，只清除本次 A 店新 liffId，刪除新 LIFF 前再依適用操作授權處理。其他LIFF、Webhook、圖文選單、正式庫完全不動。圖文選單由使用者自行操作。維持 Draft、不合併、不正式部署。
