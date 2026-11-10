# 蒸足顧客總覽重點與分隔（2026-11-10）

使用者依原蒸足截圖授權小幅優化並延續助理驗收、提供截圖的交付方式。沿用 `feat/customer-overview-alignment-20261110`；正式站未合併或部署。

## 範圍與規則

只調整 `customers/_components/customer-detail-drawer-content.tsx` 的方案摘要、總覽間距及歸屬分隔。原顧客完整頁已有主要可預約數字，本次不改；音樂／運動／美業沿用前輪結果。

- 方案名稱下加粗「可預約 N 堂」，效期維持可讀；剩餘與正數的「預約保留」列在下方。
- 使用原 `walletAvailableToBook`／`walletPendingCount`，現代錢包依 WalletSession AVAILABLE／RESERVED，舊錢包沿用 booking.people 相容分支，不改金額、預約保留、扣堂或退款規則。
- 過期／已取消／已用完的歷史方案顯示狀態，不以原尚餘明細強調可預約；管理方案保留。
- 移除歸屬下分隔線，沿用原備註編輯器自己的上分隔線，總覽區塊間距減少；字級及 44px 操作不縮小。
- 無新增應用查詢、快取、套件或交易；既有來源的資料完整性與權限仍由原 reader／server action 負責。Cloudflare 非本次必要依賴。

## 本地檢查

型別、變更來源 ESLint、`git diff --check` 通過。

6 組 79 項回歸通過：`wallet-availability`、`wallet-session-service`、`customer-drawer-consumption`、`customer-drawer-list-sync`、`customer-panel-records`、`customer-panel-records-ui`。涵蓋堂數明細、預約保留、取消釋放、多人與舊錢包相容、顧客紀錄、清單同步。這些單元／整合測試不是線上實際扣堂交易。

## 隔離測試與版本

Vercel project `prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs`，Supabase `ttworfzgwejdeolegkxl`。來源 `1c8ddd6d3fb29540d09ea13fc56938542ecc8446`，部署 `dpl_FmiRyAkPUBh4UQhd4bMPiPSyXYp2`。

既有 demo 店 `addons-qa-steam` 原無方案，建立本輪專用帳號、顧客、方案、兩張錢包及堂數明細；有效測試錢包剩餘 10、AVAILABLE 8、RESERVED 2，各保留明細關聯一筆測試預約。另一張為過期歷史方案。這是隔離 fixture，未操作真實顧客或金流，也不稱為經應用程式完成的購買／預約驗收。

沿用受限 DB role，僅補充限本輪兩張錢包的 WalletSession SELECT policy，至 2026-11-13 12:00 台灣時間到期；本輪新帳號另有同時到期的 restrictive SELECT policy。RLS 維持開啟，無新增應用寫入權限。QA 密碼、cookie、share token、含密碼雜湊的 fixture SQL 均只存私有 `/tmp`，不進 repo。確認完應撤銷本輪兩個 policies 並依本輪固定 ID 清理 fixture，不影響其他測試。

## 線上畫面驗收

上述精確部署已 READY。由 `scripts/qa/steam-customer-overview-hosted.mjs` 使用真正 OWNER 帳密登入，核對身分與 demo 店後進入顧客面板，未 mock 自有網域讀取，封鎖瀏覽器對外網域。以下全部通過：

- 主摘要可預約 8、剩餘 10、預約保留 2，與獨立 PostgreSQL 明細核對一致。
- 歷史切換顯示已到期，該歷史卡可見內容不聲稱仍可預約。
- 管理方案展開、原每堂使用紀錄重新讀取也顯示可用 8 堂。
- 顧客編輯開啟後返回總覽，額度與原操作保留；不送出編輯或交易。
- 360×780、390×844、768×1024、1024×768、1366×900、1920×1080 均無頁面／面板水平溢出，主數字粗體，載入完成才截圖；無 pageerror。

新版 URL：https://steamfoot-compact-qa-20261103-81fx8zbyi-rock7652-2111s-projects.vercel.app 。分享憑證不進 repo。截圖及 JSON 位於私有 `/tmp/steam-customer-overview`，交付只含成功報告與六種尺寸、歷史、管理截圖；前輪 Preview 只作登入與 fixture 讀取預檢，不冒充本輪畫面證據。

建置沿用既有 QA 包裝規則，一次建置成功；本輪沒有正式部署或應用業務寫入。Chrome 模擬尺寸不等同真機 iPad／Safari，未重新執行線上扣堂、取消或付款交易；取消釋放由上述原堂數 service 回歸覆蓋。測試資料不代表真實購買或金流。
