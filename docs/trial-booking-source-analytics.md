# 體驗預約來源分析

每家門市使用同一份公開體驗預約表單；入口連結帶 `source`。將下列網址的
`{storeSlug}` 換成 `zhubei`、`hsinchu` 或 `taichung`：

| 入口 | 預約連結 |
| --- | --- |
| LINE 圖文選單 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=line` |
| Messenger | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=messenger` |
| Google 商家預約 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=google_maps` |
| IG 個人檔案／限動 | `https://www.steamfoot.com/pricing/experience/{storeSlug}/book?source=instagram` |

Google 商家連結由商家管理者自行填入；IG、Messenger 與 LINE 各用自己的網址。
若現有 LINE LIFF 已產生驗證過的聊天專屬入口，會以該入口實際頻道為準；
LIFF 無法產生入口而轉至公開預約頁時，也會標示 LINE。

來源記在**預約**上，不依顧客是否已綁定 LINE 或使用 Google 登入推斷。
參數僅允許上述四種值，其他或無參數的來源顯示「未記錄」。連結標籤能
衡量該連結帶來的預約，無法驗證顧客是否真的在該平台看見店家；
轉傳連結也會沿用原連結的標籤。

營運分析按「預約建立日期」選取一批體驗預約，顯示其預約組數、後續實際
到店人次、有效正式方案開卡顧客數。取消與未到保留在預約組數，但不列入
到店及開卡。過去資料不回填來源，以免把已綁 LINE 的 Google 地圖顧客
誤算為 LINE。報表結果會在顧客到店與付款後更新，並非固定月結快照。

正式啟用前須先套用 Prisma migration 並重新產生 Prisma Client，再發佈
應用程式，最後逐店更新四個入口網址。
