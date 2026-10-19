# 運動測試站：課表密度與側欄保留驗收

- 基底：PR #1355 的獨立運動驗收預覽（94bfda5a）。PR 分支與 main 未更動。
- 應用部署提交：c0c30ea4d3df712fbcfa9e7bb89d6745a40ac994。
- Vercel Preview：dpl_2BozjbC8Jyq4JRioAefoek6YQPBJ，target=null，READY。
- 網址：https://steamfoot-booking-2ll94je2n-rock7652-2111s-projects.vercel.app （受存取保護；臨時分享參數不存入版本庫）
- 僅適用受隔離部署守衛保護的 sports-live-flow-store；音樂測試站、正式站未部署；不合併、不執行 migration。

## 修正範圍

日／週表共用同一比例，每小時由 96px 降為 88px（縮短約 8.3%，相同高度約多呈現 9.1% 時段）。原先約 20% 的提案調整為優先保留半小時約 44px 觸控區域。卡片縮減行距，字級不變；月表及音樂原有 96px 比例維持不變。時間刻度、卡片起點、時長與淡化影子一起調整。

側欄明確展開／收合選擇以版本化、店家 admin 路徑範圍 cookie 保存。伺服器初始渲染讀取相同偏好；prefetch 舊 props 的重新掛載在繪製前核對 cookie。手機 mobileOpen 保持獨立，不共用桌面展開狀態；不增加資料庫查詢。

## 已通過

- 69 項原有回歸：課表狀態、五種卡片呈現、導航前綴、導航方式、HQ 側欄。
- 10 項新增渲染測試：日／週表 40／45／50／60 分鐘、10:15 起點比例；音樂日／週表保持原始比例。此為元件測試，非真實短課交易驗收。
- TypeScript、修改檔案與新增測試 ESLint、git diff --check。
- 實際登入專用運動驗收店：收合後切顧客管理再返回、重新整理、瀏覽器前進／後退均保留；明確展開後重整仍展開。
- 1366×900、1920×1080、1024×768、768×1024：無整頁水平溢出；週表時間列均 88px；抽查 12 張卡片高 84px，內容 48–49px，未裁切。
- 日表／教練視角／日期離開後返回保留。
- 週表點 2026-10-20 11:30 空位，排課介面帶入正確日期時間，未送出新增。
- 淡化卡片一次點擊即開排課；不開原上課名單。
- 週／日／月表剪下內容可帶入貼上確認；本輪不送出調課交易。
- 1024×768 模擬觸控，半小時格 tap 帶入正確排課時間。
- 已完成的主瀏覽器驗收無 pageerror。
- 建置紀錄：`isolated_database=true migrations_skipped=true notifications_blocked=true`。

## 限制與證據

瀏覽器為 Chromium，iPad 為視窗尺寸／觸控模擬，不代表實體 iPad/Safari 已通過。交易核心未修改，本輪只開關排課／貼上介面，未重新送出扣點、還點、跨裝置撞課等交易。

本機證據：`/workspace/sports-density-acceptance-20261019/`：results.json、interactions.json、week-*.png、day-return.png、paste-confirmation.png 與執行紀錄。初期腳本曾因部署尚未 READY、欄位／返回按鈕名稱不符而失敗，修正腳本後完成；不列為產品缺陷。

本輪工程驗收完成；下一步為店家親自確認密度及側欄操作感受，未授權正式啟用。
