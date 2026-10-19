# 單一超額舊系列不再阻止同店正常系列展課

基底為已合併PR1363/main 3fd385f0。原問題已在 /workspace/sports-capacity-mixed-review-20261019 重現：同店超額舊系列使正常班三月新增0；只修正隔離舊名單後正常班三月新增5。原PR證據未檢查正常班展課，此為補足該缺口。

只改 sports-permanent-series：每個系列寫入前先收集、驗證整段待展課日期；僅遇專屬容量錯誤才略過整個異常系列並回傳提示，正常系列照常展課。容量檢查不移除、不截斷名單、不寫部分異常課次。原store鎖、整筆交易及訂閱檢查保留；非容量驗證、撞課、權限、DB錯誤仍向外拋出使交易失敗。

## 隔離驗收

只重驗同店一正常開放固定班、一指定超額舊班，沒有重跑整套。localhost PostgreSQL16、既有嚴格QA adapter及正常OWNER登入；課程由既有HTTP actions建立，SQL僅模擬合成學員舊名單超額。程式服務檔與修正分支hash一致。

- normal-last：資料庫實際查詢先讀異常班、再讀正常班。讀2027-03，正常班新增5堂，異常系列課次完全不變。
- normal-first：前一組隔離系列停用後建立不同星期的新一組；查詢先讀正常班、再讀異常班。讀2027-05，正常班新增4堂，異常系列課次完全不變。
- 各組都確認既有正常課次保留、課卡總額度前後一致、提示顯示、課表可讀；重讀不重複建立。未處理pageerror 0。
- 處理順序以實際查詢回傳的requestKey相對順序核對，不以建立先後推定（資料庫使用store_room_start索引）。首次fixture排序斷言錯誤在展課前停止，沿用同一組已建立合成班並依實際時段排序補驗，沒有把失敗的fixture前置斷言當產品驗收。

5檔32項針對性測試、變更TS ESLint及tsc --noEmit通過。單元覆蓋正常系列前後、僅正常、依停課日期計有效名單、非容量錯誤不吞掉、撞課仍拒絕，及既有超額建立/訂閱/點名綁卡保護。沒有新增schema migration，沒有變動前端版面或讀取器。

證據：artifacts/sports-series-capacity-isolation-20261019/results.json、tests.log、source-hash.txt、restored.json；完整本機紀錄 /workspace/sports-capacity-isolation-acceptance-20261019。隔離資料還原顧客0、預約0、系列0、原課次1，服務及容器停止。

只完成本機修正與隔離驗收；未推送、建立PR、合併、部署、執行正式migration、使用真實顧客或改動音樂/正式站。正式是否存在超額舊班並未查詢或宣稱。
