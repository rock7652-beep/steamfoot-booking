# 排課與導航統一 Preview

整合來源：PR #1329 的 5db8be6ef0cfc16ab44586dadc34392577c15e86，以及 PR #1317 的 1a07cecc8a432a1461acab2c1d34830632599dd5。統一使用 fix/full-site-navigation-stability-20261014，未合併 main 或操作正式資料庫。

衝突處理：課表保留排課 receipt 原地更新及導航背景更新保護；租借保留草稿保護及穩定路由；載入保留更具體課表骨架；Preview 名單合併兩分支，統一分支亦禁止公開 intake。新增老師勾選狀態不再透過 effect 重設。

驗證：整合全站 1085 suites / 10324 tests passed、134 skipped；最後修改後隔離/教學項目46項通過。重新產生課程 Prisma client後 TypeScript 通過。整合檔ESLint通過（既有新增老師effect問題已修正）。Chromium排課7個viewport及導航6個viewport合成檢查通過；不等同登入後業務或實體Safari驗收。

隔離部署沿用既有精確分支、Vercel Preview及測試DB限制；跳過migration並阻擋對外通知。排課分支文件記載其migration已在隔離DB套用，本次不重跑。仍待統一部署的登入後課程/調課驗收。
