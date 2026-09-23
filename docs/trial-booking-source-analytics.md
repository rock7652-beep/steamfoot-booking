# 體驗預約來源分析

每家門市使用同一份公開體驗預約表單；入口連結帶 `source`。將下列網址的
`{storeSlug}` 換成 `zhubei`、`hsinchu` 或 `taichung`：

| 入口 | 預約連結 |
| --- | --- |
| LINE 圖文選單 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=line` |
| Messenger | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=messenger` |
| Google 商家預約 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=google_maps` |
| 其他網址（選用） | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=other` |
| IG 個人檔案／限動 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=instagram` |

Google 商家連結由商家管理者自行填入；IG、Messenger 與 LINE 各用自己的網址。
若現有 LINE LIFF 已產生驗證過的聊天專屬入口，會以該入口實際頻道為準；
LIFF 無法產生入口而轉至公開預約頁時，也會標示 LINE。

來源記在**預約**上，不依顧客是否已綁定 LINE 或使用 Google 登入推斷。
參數只接受四個指定入口及 `other`；無參數的預約與 `other` 合併顯示為「其他／未記錄」。連結標籤能
衡量該連結帶來的預約，無法驗證顧客是否真的在該平台看見店家；
轉傳連結也會沿用原連結的標籤。

營運分析按「預約建立日期」選取一批體驗預約，顯示其預約組數、預約人數、後續完成服務人次、到店率，以及已指派正式套餐顧客與方案轉換率。到店率＝完成服務人次÷預約人數；方案轉換率＝已指派正式套餐顧客÷完成服務且已建檔的顧客。取消與未到保留在預約分母，但不列入到店或方案。指派方案不代表款項已確認收訖。過去資料不回填來源，以免把已綁 LINE 的 Google 地圖顧客
誤算為 LINE。報表結果會在顧客完成服務與指派方案後更新，並非固定月結快照。

正式啟用前須先套用 Prisma migration 並重新產生 Prisma Client，再發佈
應用程式，最後逐店更新四個入口網址。
