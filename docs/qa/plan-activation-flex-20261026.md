# 全站方案開通 LINE Flex 卡片與預覽

- 入口：蒸足／運動／音樂／美業「提醒管理 → 顧客提醒 → 方案開通通知 → 查看訊息預覽」。既有共用設定列、預設開啟、手動停用、儲存回饋及權限保留。
- 實際新通知使用 LINE Flex bubble，門市、購買人、方案、本次數量及單位、使用期限與會員專區提示皆取自原購買快照。共用品牌色及 `LineCardPreview`，預設收合；預覽使用示範資料、無可點擊的發送／導頁操作。
- 預覽與派送共用 `planActivationCardPresentation`。文字發送紀錄保留可搜尋全文；altText 上限 400 Unicode code points，不截斷卡片內文。
- 新通知首次確定 route 時持久記錄 `messageFormat=flex-v1`。既有 route 未記格式者仍按舊文字重試，避免在相同 LINE retry key 下換 payload。沒有補發舊購買、變更收件人、翻動店家設定或增加 migration。

## 驗證

- 37 tests 通過：各模組派送、共用／獨立 LINE 通道、新格式重試保持相同 payload、舊文字 route 跨版本重試、無期限、各單位與預覽欄位一致、Unicode altText 邊界。
- TypeScript、changed-file ESLint 通過；React 檢查：無新增 client 資料讀取、effect 或衍生 state，僅傳入顯示快照，保留原開關儲存流程，使用共用預覽外框與品牌色。
- 本機隔離真實元件 Preview：四模組 × 1366×900、1920×1080、1024×768、768×1024、480×900（360px 容器），20 組通過。確認卡片初始收合、展開可見、切換儲存及失敗還原、resize 保留狀態、無整頁水平溢出。
- 另驗唯讀狀態與 390px 長門市名／方案名／無期限，無水平溢出或文字裁切。全部網路由 fixture 攔截，不讀正式資料、不發 LINE。
- 截圖與完整尺寸結果：`artifacts/plan-activation-flex-20261026/`；提交代表性的桌機、iPad、窄容器、長文字及卡片截圖。
- 限制：屬隔離共用元件驗收，不等同登入後的完整業務流程、真實 iPad 裝置或實機 LINE 收件測試。LINE 客戶端字型及排版可能略有不同。
