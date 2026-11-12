# 舊授課人員約定安裝與合併發布

本次使用者已指示通用卡名單修正與 #1554 整合驗證、同批上線。正式站程式需先有 `20261112071000_course_card_provider_agreement`，不單獨發布其中一份修正。

## 限定安裝

Migration SHA256：`6c11a30f461f92b49be311e5e358588cfddf4d0cd9a6fb0913f1ce78ca89262d`。SQL 使用單一交易及 lock／statement timeout；新增欄位、索引、不可改寫的購買快照及複製既有個人費率。原價格、餘額、效期、課次、原費率紀錄不改寫。

正式連線是 Vercel 的不可讀敏感設定。本次沿用儲存庫既有 GitHub Production environment 的 DIRECT_URL，不讀取、輸出或複製密碼。`Reviewed course provider agreement installation` 僅手動 dispatch、原始儲存庫 main、精確批准 SHA 與 SQL checksum 可執行；預設 inspect 唯讀。apply 使用臨時 Prisma schema，僅放這一筆 migration，執行 `prisma migrate deploy`，不執行整份儲存庫的其他 pending migrations，不手動寫 ledger。

安裝前拒絕未解決的 migration、部分存在的 schema、錯誤 ledger；安裝後核對索引、trigger、SECURITY INVOKER／ACL、Prisma checksum 及其他 ledger，並核對原卡資料與原 CourseCompensation 摘要。若發布期間有其他業務更新導致摘要不同，停止並核對，不推定 migration 破壞資料。重跑已安裝且核對正確的版本不再次部署 SQL。

## 發布順序

1. 完成合併版本檢查及 Preview。隔離環境為 `ttworfzgwejdeolegkxl`；本分支加入既有精確分支清單，資料庫 URL、來源儲存庫及通知停發檢查保留。
2. 將 #1554 合併至 main；此專案 main 自動 Vercel build 已停用，不因合併自動切正式網域。
3. 以該 main SHA 執行 workflow inspect，再 apply，核對成功報告。
4. 以相同 main SHA 建立 production deployment；沿用所有通知停發設定，build 再做唯讀 schema preflight。成功後 promote，核對 steamfoot.com 的 deployment ID 與實際來源。
5. 正式驗收限唯讀查詢、路由與畫面；不建立測試購課、預約、扣堂或通知。

不退回會忽略新資格規則／舊卡約定的舊程式，不刪快照或重算歷史計酬；需要修正時保留資料向前修復。

## 合併版 Preview 打包修正

`fc1879d6` 的 Preview `dpl_BwxrNYQktmjxaALjudSArDauVarQ` 已通過隔離／通知停發、編譯、TypeScript 及 Next build，但平台最後拒絕 253.21 MB middleware（上限 250 MB）。新增僅適用本分支、同專案、隔離 DB 且 `/vercel/pathN` 的 Preview 打包程序：建置前把 artifacts 驗收圖片逐檔核對 SHA256 並保存至 build root 外；建置後沿用原有 PostgreSQL 打包檢查及未使用 provider 排除。public 圖片、證書、文件、JSON、QA 腳本、runtime 檔案均保留；正式打包 guard 不變，不調高預算或略過平台限制。相關 3 檔／39 項測試及 ESLint 通過。
