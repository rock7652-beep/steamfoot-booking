# 美業返回 HQ 修正

錯誤代碼 1751104403 的正式紀錄對應「請先選擇店家」。HQ 切換 action 將 active-store-id 改為 __all__ 並 revalidate 後台，當前美業頁可能先於前端導向被重新渲染。

加入僅供頁面使用的 beautyPageManager：ADMIN 已無有效選店時，先 redirect('/hq/dashboard')，不進入單店資料讀取。已選店及所有非 ADMIN 仍走原 beautyManager；無效選店拋錯也不被吞掉。不改切換 action、交易權限、資料或功能資格。原本返回按鈕的目的地已正確，保留原行為。

驗證：6 檔針對性測試 52 項通過，含新增 6 項；TypeScript noEmit、變更檔案 ESLint 與差異檢查通過。擴大 12 檔共 114 項，113 通過、1 項 hq-store-view-preview-merge 的 recovery_skipped_outside_production 輸出斷言失敗；在未修改的 7251c0f4 相同重現（該檔 8 通過、1 失敗），未修改或削弱斷言。

無視覺元件或版面變更；沒有登入瀏覽器重現 cookie 切換與導向的完整流程，不宣稱桌機／平板真人驗收。未執行完整 build、資料庫寫入、migration、合併或部署。支線關閉自動 Vercel 部署。
