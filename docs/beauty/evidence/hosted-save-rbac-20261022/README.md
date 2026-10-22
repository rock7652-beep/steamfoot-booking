# Hosted 真實驗收證據

- `results.json`：原隔離版本 fe44babb 的真實登入／寫入／重開／拒絕結果，以及額外發現的新增人員 503。不要把該失敗或尚未驗的修正算成通過。
- `db-comparison.json`：負向請求前後完整比較，以及測後原位置、服務、方案、卡片、技師、收退款及預約筆數核對。
- 截圖：實際受保護 Preview 經應用程式登入後取得，不是 fixture。瀏覽器尺寸模擬，不是實體裝置簽收。
- 只保存公開可審閱的結果；沒有存取分享 token、cookie、帳密、原始 request body 或 session state。
- 停用後原 session 的讀取實際回應 307；初版驗收 helper 預期 Flight false 而誤列為失敗，已依實際回應及資料庫停用狀態列為拒絕，沒有把 200 空回應算通過。
- staff 新增的修正已隔離建置，hosted 重驗需對新版建立經同意的驗證連結；舊 link 不挪用。
