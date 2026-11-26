# LINE HTTP 接入零外發驗收

2026-11-26（台灣時間），沿用 Draft [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。[契約](digital-butler-line-webhook.md)／[結構化摘要](../../artifacts/ai-digital-butler/line-webhook/summary.json)。本輪完成實際 POST、簽章與隔離 fixture → 共用核心 → 持久帳本 → 阻擋回覆 → 既有人工清單恢復；不代表真實 LINE OA 或外發驗收。

## 版本及結果

- Runtime `005ce6e61562a1e5694b7537fbcbdb5d04eab5da`；後續文件／證據提交不修改產品程式。
- [受保護 Preview](https://steamfoot-booking-26jkkka2o-rock7652-2111s-projects.vercel.app)，deployment `dpl_8XMZsnsSwHjMs9cFRRSqSYbm2Nn1`，READY、來源 SHA 相符。一次必要建置，無環境變數或 schema 修改，不重建文件。
- 本機 10 檔／223 項通過；最後兩個新檔 56 項再驗（與前述重疊），型別及 ESLint 通過。
- [runtime CI 45780302669](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45780302669) 四個 job 成功，1,866 檔／17,715 項 passed、36 檔／340 項 skipped，558.78 秒。音樂、運動、混合課程隔離 workflow 通過；Booking／Editorial 依條件 skipped，不冒稱執行。
- [雲端原始結果](../../artifacts/ai-digital-butler/line-webhook/hosted.json)：14 個情境、12 筆已記錄 HTTP 事件結果、六尺寸，pageerror 0、failures 0。不是效能基準或真機驗收。

## 實際通過的雲端情境

1. 未登入的公開 fixture，即使 HMAC 正確也拒絕。
2. AI 總停止時實際 POST 返回 STOPPED，模型呼叫 0。
3. 錯誤簽章拒絕，沒有寫入模型帳本。
4. 公開 fixture secret 不可冒充未配置的真實 OA。
5. 固定 sender 與已驗證操作員綁定，其他 sender 拒絕。
6. 原流程命中 COMPLETED／等待欄位 VALIDATION_FAILED 都優先處理，模型 0，回覆僅 OUTBOUND_BLOCKED。
7. 已發布知識問題經同一 HTTP／Routing／Service 得 AI_ANSWER，新增 Mock 1，回覆 OUTBOUND_BLOCKED。
8. 原 event 重送、相同 message 換新 event 均 DUPLICATE，模型 0、不重記 delivery。
9. 明確轉人工後，新事件與重新進頁保持 HUMAN_ACTIVE 靜默。
10. 既有「AI 待人工處理」準備／確認恢復成功，私有 audit 同交易記錄。
11. 未知問題得 AI_HANDOFF，新增第二筆 Mock，後續已知問題仍靜默；再以同一既有清單明確恢復。
12. 既有待人工工作區在 1920、1366、1024×768、768×1024、390、360 六尺寸無整頁水平溢出，控制可到達。截圖為瀏覽器模擬，清單採原刷新機制，非即時推送。
13. 恢復總停止與四店關閉後再 POST，模型 0。
14. 清除臨時登入並更新版本後，修正後 null-safe `/api/auth/session` probe 雲端通過；舊 session 再 POST 被拒絕。前輪 QA 登出腳本的雲端重測待驗項已由這個新版實測補齊；前輪原始失敗與當時未重跑狀態仍保留。

## 首次失敗、TLS 與通行連結

使用者分別明確批准本部署第一條 30 分鐘連結及同部署替代連結。第一次在登入前因 Chrome 無法於一般 sandbox 正常使用 NSS 信任庫而 ERR_CERT_AUTHORITY_INVALID，執行 0 個 Webhook 情境、Mock／真實 API 均 0；立即還原並撤銷，shareable-link 0。[原失敗](../../artifacts/ai-digital-butler/line-webhook/hosted-attempt1.json)及[收尾](../../artifacts/ai-digital-butler/line-webhook/attempt1-cleanup.json)保留，未改寫為成功。

測試機使用既有環境 CA，在限定 NSS 路徑存取權下以相同 Chrome client 預查；嚴格 TLS 收到預期的 302 保護回應，[TLS 證據](../../artifacts/ai-digital-butler/line-webhook/browser-tls.json)。未用 ignoreHTTPS、忽略憑證旗標或降低資料庫 TLS。替代連結經新批准後才建立，重用相同部署，14 項實測通過後立即撤銷，撤銷回應 shareable-link 0；[未認證 HTTP](../../artifacts/ai-digital-butler/line-webhook/protection-after-revoke.json)仍 302 導向 vercel.com。兩條連結都已撤銷，無再生或第三條連結。

## 帳本、成本與最終安全

[逐階段](../../artifacts/ai-digital-butler/line-webhook/checkpoints.json)／[postflight](../../artifacts/ai-digital-butler/line-webhook/postflight.json)／[最終安全](../../artifacts/ai-digital-butler/line-webhook/final-safety.json)：

- Request 51→53，Mock 46→48，OpenAI 5→5。本輪真實 API 0、重試 0，新增估算 API 費用 0；累計保守估算維持 US$0.002690，非供應商帳單，平台建置實際費用未取得。
- Dispatch 78→113，包含雙 alias、路由及阻擋回覆收據；本輪有效回覆 sink 5 筆，沒有 LINE API 或 replyToken 保存。恢復 audit 10→12。所有 Request COMPLETE，Dispatch CLAIMED／UNKNOWN 0。
- 合成美業當日 13→15／20，剩餘 5；沒有提高、重置額度或換店繞上限。其他三店一直關閉。
- 最終 global stopped=true、四店 enabled=false，四店設定與 caps 完全等同驗收前；只有美業 revision 因開／關增加 2，其他三店不變。
- 合成 OWNER passwordHash=NULL、更新登入版本、舊 session 被拒絕；瀏覽器及私密測試設定／旗標已清理。三個合成會員仍 SUSPENDED、密碼空。
- Booking 129、Customer 1,367 不變；原 handoff 1 保留，新 HTTP 對話已由原人工清單明確恢復。沒有刪帳本或清費用。
- 原角色 superuser=false、bypass RLS=false、connection limit 8；嚴格 TLS、原 DB 憑證、Production、main 不變。真實 LINE／Messenger／Email 外發全程封鎖，無自動預約、正式 migration、promote 或合併。

## 未驗邊界

真實 LINE OA／LINE HTTP 來源、Messaging 傳送及回執、真實會員權益與 Login、CENTRAL／共用 OA、正式原流程跨事件 repository、其他模型、真機及暖暖試營運仍未驗。顧客身分衝突及預算上限的完整矩陣在本機替代權威來源／PGlite 測試，不能算真實會員雲端驗收。HTTP fixture 身分永遠 GUEST，不開放會員工具；fixture 原流程仍 request-local。固定 Mock 與阻擋 sink 是本輪範圍，沒有啟用真實 OA 或付費 Provider。

本輪沒有修改 UI 或 HQ 控制。依 Framework 保留原入口、既有待人工清單與確認恢復，不新增第二個工作台；HQ 三態後端權限有測試。後台指南仍 source-reviewed、205／96 不變，不新增前台指南。
