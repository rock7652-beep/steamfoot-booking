# 課表補修發布的打包阻擋

課表 PR #1527 已合併 2209121179069fd39cbf5133cf36b6fb7e2feb28，CI 及隔離 Preview 成功；正式部署 dpl_84GCw6kTcPCV2Eee54zMG9h98oWo 在 postbuild 被原245,000,000 bytes安全上限擋下，未 promote，正式網域未套用本次補修。

next.config.ts 已排除 artifacts，但 Next Proxy 追蹤不套用 route glob。來源盤點未發現正式程式讀取 artifacts 圖片，使用處均為 QA／測試。必要補修只從 NFT 追蹤移除 artifacts/ 下 png、jpg、jpeg、webp 驗收截圖；來源檔與 Git 證據完整保留。正式 public 圖片、憑證、PostgreSQL engine、其他 runtime、docs、JSON證據和QA腳本保持。大小上限、main停用自動部署、精確production專案檢查不變，仍對過大正式依賴拒絕發布。

新增稀疏檔測試：246MB驗收圖片可排除，246MB public/runtime.png仍超過原上限；不需配置實際大檔磁碟內容。失敗訊息附帶byte摘要，若仍超限能直接判定，而非盲目重建。未變更應用業務、資料庫或通知。
