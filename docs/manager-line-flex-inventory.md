# 後台操作人 LINE 通知盤查（2026-10-07）

所有下列事件均經 `deliverManagerNotification`，在發送時共用 Flex 卡片、門市識別與操作按鈕；原始文字仍保留於發送紀錄。

| 事件 | 來源 | 按鈕目的地 |
| --- | --- | --- |
| 當日新預約 | same-day-booking-manager-notification / course-manager-notifications | 門市預約或當日課表 |
| 新體驗預約 | public-trial-manager-notification → store-manager-line-notifications | 指定預約 |
| VIP 續購需求 | session-balance-notifications | 指定門市顧客 |
| 數位管家新名單 | store-manager-line-notifications | 指定名單 |
| 要求真人客服 | store-manager-line-notifications | 待接手客服 |
| 真人客服最後催辦 | store-manager-line-notifications | 待接手客服 |
| 待確認付款 | store-manager-line-notifications / course-manager-notifications | 交易或課程方案 |
| 服務未完成／出席待處理 | store-manager-line-notifications | 指定預約或日期課表 |
| 每日待辦 | store-manager-line-notifications | 客服或門市後台／課表 |

## 發送與相容性

- 沿用門市 LINE token、收件人偏好、停用檢查、VIP 範圍、唯一事件鍵與 LINE retry key。
- 新增可空的 `renderedMessages` JSONB，保存實際卡片；重試使用原卡片。旧紀錄沒有卡片時仍以原文字重試，避免同一 retry key 變更 payload。
- 原始網址變為按鈕，保留查詢參數；舊 VIP 通用顧客路徑補上門市路徑。
- 本次盤查未找到後台操作人的週報發送實作，因此不宣稱週報改版。
- 綁定指令的成功／失敗回覆與顧客手動訊息屬互動回覆，未納入自動店務通知。

## 驗證

- 4 個相關測試檔共 50 項通過，包含收件人隔離、停用、重複事件、新舊 payload 重試與卡片連結。
- 修改檔案 ESLint 與 diff whitespace 檢查通過。
- 卡片文字設定 wrap，長名稱與 400 字 altText 上限有測試。
- 尚未發送真實 LINE 或完成 LINE 手機／桌機／iPad 渲染驗收；本地測試不等同正式送達。
- 正式發布須先套用 migration 並 regenerate Prisma client。

## 後台訊息預覽

提醒管理的店長通知區新增預設收合的「查看訊息預覽」。蒸足涵蓋上述 9 種通知；運動／音樂呈現適用的 7 種，排除蒸足體驗預約與 VIP 續購需求。使用既有 LineCardPreview 與實際發送卡片共用的文字解析、色彩，僅顯示虛構示範資料，預覽按鈕不執行操作、不發送 LINE。此預覽用於檢視卡片內容與風格，實際 LINE 排版仍以 LINE 用戶端為準。

預覽清單測試 2 項、通知相關測試 50 項通過；變更檔 ESLint 通過。正式門市登入與實際 LINE 收件驗收仍需在驗收環境確認。
