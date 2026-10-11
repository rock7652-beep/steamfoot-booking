# 官網優惠倒數固定列

2026-10-11；依 UI / Settings Framework v1.5。

## 行為與範圍

- 接入官網共用 MarketingFooter：首頁、方案價格、功能介紹、案例、經營指南與文章。
- 使用既有 public-pricing-offer 截止時間；雙十加購優先，結束後顯示年終贈送月份，年終到期收起。免費試用不是限時截止，倒數明確標示付款優惠。
- 不接入 HQ、店家後台、會員、LIFF 或靜態申請／條款頁。
- 原頁以瀏覽器原生 dialog 開啟既有同源申請表，保留既有驗證、個資告知、送出與 LINE 接續流程。首次開啟才載入，關閉保留 iframe 草稿；頁面切換或重整不保留草稿。
- 使用既有狀態列呈現。原生 dialog 供官網 iframe 使用，提供焦點隔離與 Escape，沒有複製後台業務面板。
- 固定列底部保留安全區，頁尾補償空間；至少 44px 按鈕。

## 已完成檢查

- 優惠、文案、官網路由：初次 3 個測試檔、36 項通過；補唯讀預覽後 4 個檔案、353 項通過。
- 兩個 TSX 的 ESLint 通過；git diff --check 通過。
- 用真實元件與既有申請表建置隔離靜態 fixture，Chromium 測試 320×640、390×844、768×1024、1024×768、1366×900：固定底部、捲動後可見、無水平溢出、表單開啟、Escape 關閉、重新開啟草稿保留、視窗尺寸變化後草稿保留、沒有 pageerror，全部通過。
- 倒數每秒更新；2026/11/01 台灣午夜切換年終，2027/01/01 台灣午夜移除固定列，通過。

## 尚未完成與限制

- fixture 驗收是元件幾何與互動，並非完整 Next 官網／遠端 Preview；尚未完成正式字型與所有周邊元素的視覺驗收。
- 未送出測試申請，未寫入顧客資料。既有 API 與資料庫流程未修改；遠端 Preview 仍需核對同源 iframe 及實際申請成功／錯誤顯示。
- 真實 iPhone／iPad、Safari、虛擬鍵盤、安全區與慢網路待驗；不能以 Chromium 尺寸測試替代。
- 尚未取得正式合併授權；保持草稿 PR。

## 預覽環境補修

自動部署原先被另一支線的 exact-branch guard 擋下。為本支線補 exact Vercel preview／repo provenance，重用既有 disabled DB clients、no migration 與 outbound blocks，proxy 僅允許官網 GET／HEAD，所有寫入回 405，HQ／店家／API 回 404。沒有修改專案共用環境變數或正式主線規則。隔離測試含錯誤 provenance、官網 allowlist、非官網封鎖、寫入封鎖、跳過 migration。
