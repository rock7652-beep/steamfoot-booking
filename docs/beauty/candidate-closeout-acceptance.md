# 第 1 包驗收與第 3、4 包收斂

2026-10-21，隔離支線整合 main `5aebaa69`（本地 merge `de48a3a5`）；正式 SQL／角色／設定／部署／LINE 均未操作。PR 保持既有狀態，本輪成果只留本地。

## 已驗的範圍

| 項目 | 真正做過的事 | 限制 |
|---|---|---|
| 專用角色關帳／補登／跨月退款 | 同庫雙角色、本機 production 封裝、真正店長登入；UI 關帳、確認補登、125 元現金及 33 元非現金、合法重送一次、改金額／移除確認拒絕；原快照保留，明確撤銷後重算；九月原款於十月追加 300 元退款，共用帳與三月界分析逐筆對照 | 已有其他合成帳務，按原基準加本輪增量核對，不能把本輪 1000／800／-250 當整店絕對營收。原模組 Transaction 為 0，未宣稱驗完舊式混帳；歷史月界收據為新增 fixture，實際退款使用 DB 時間 |
| 專用角色跨月技師月結 | 九／十月真 UI 確認；九月付款十月補付 100、分次收回 100＋200＋100；未收回前更正拒絕；跨月換實際技師、固定拆帳改鐘點 600；新月結版本、600 付款與 250 收回；店長與技師本人已付 350、共用淨支出 350 一致 | 舊版本逐欄 DB 比對；不冒稱有歷史版本選擇器。合成歷史服務，無實際匯款／收回 |
| 顧客資料與合併安全 | 店長真正登入；人工合併 action 明確拒絕，美業底層 service 直接呼叫也拒絕；姓名／備註更正可用，舊值與跨店 ID 拒絕；身份、方案、預約與帳本不變 | **美業顧客合併暫不支援**，不是已完成自動搬移；保留兩筆資料並使用資料更正。LINE OAuth placeholder 另驗，不能用本輪結果代簽 |
| 共用現金回應修正 | 發現部分 UI 已入帳卻停在 pending；關帳、撤銷與補登改為同源 JSON transport，仍使用既有 permission／writable／store feature／日期鎖／CAS／requestId；成功才 hard navigation | 影響共用現金入口；不改金額或權限規則。其他現金操作保留原流程，不能宣稱全站所有 pending 例外均修復 |
| 新入口安全 | 跨來源／缺 Origin、顧客低權限、店長跨店 session／不支援操作拒絕；失敗前後對帳摘要相同 | 顧客由 dashboard authentication boundary 阻擋，與真正 action 分支拒絕分開記錄 |
| 封裝與版本 | 最新 main 本地整合、production build／TypeScript、四 Prisma client、trace 零缺檔、無來源目錄與 `.env`、私密 QA Secret 明文比對未命中；本地乾淨發布 worktree | 沒有真 pooler 或 hosted deployment；正式管理工具 metadata 不帶入乾淨候選 |

測試證據存於 [本輪合成證據](evidence/candidate-closeout-20261021/)；原始截圖、私密環境與完整 action 回應只留 `/tmp/beauty-release-qa`，不複製憑證或正式 metadata。數量與 build ID 見 `summary.json`。

## 中斷與修復記錄

- 第一輪金額測試把畫面沒有千分位的 `4925` 預期為 `4,925`，屬測試格式錯誤，修正後保留失敗摘要，不列成功。
- 後續數次真 UI 重現入帳後 pending；原始帳務保留，透過有權限的撤銷閉店重開，沒有改收據／刪帳重置。改 JSON 後完整重跑通過，不能將修正前中斷計入完整成功。
- 顧客 script 的 BeautyCommand 排序欄位與跨頁 action POST 路徑曾寫錯，修正測試工具後重驗；未因此修改產品權限。
- domain 初跑時隔離抽屜仍為中斷演練留下的 CLOSED，前置失敗；正式操作重開後 10 項通過，失敗不計成功。
- 中間 build 發現撤銷表單 `session.id` 不在 scope，改為既有 `sessionId`，最後 build 及 TypeScript 通過；早一版成功 build 不代替最後修正版。
- 隔離共用主角色補 `CashDrawerEntry`、`TransactionPaymentSplit` 的 SELECT／RLS 讀取依賴；沒有擴大 Beauty 專用角色，最小 SQL 與其 ACL 保持相同。共用主角色仍只代表已測流程，不能當整站 production 授權清單。

## 驗收結論

第 1 包主要業務補驗與已發現缺陷處理有具體證據；第 3、4 包已整理為[候選環境／版本／SQL／回復方案](candidate-release-20261021.md)。剩餘按 **環境實連、LINE、店家簽收** 三類追蹤；其中環境實連仍含安裝承接角色收斂、備份／還原與 hosted 驗收，不能把這些未做的事藏掉或標完成。第一版不開人工合併須在店家簽收中確認；若要求支援合併，需另做關係搬移規則與驗證。

重要下一步：核定獨立測試環境與安全憑證綁定，先唯讀核對真 pooler／TLS／雙角色，再進行目標安裝與 hosted 開／關驗收。LINE 待申請完成，店家可平行安排實機簽收；正式套用另行確認。
