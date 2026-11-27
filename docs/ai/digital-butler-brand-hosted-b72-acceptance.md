# 品牌管理 b72 修正版隔離 Preview 實際驗收

2026-11-26，接續 Draft PR #1596。僅使用者指定 b72d3c925 的一次新建置與一次性30分鐘存取窗口；本輪已完成且已清理，不授權未來連結或啟用。Production、正式Webhook、DB角色期限、Cloudflare設定皆未變。

## 版本與範圍

- Runtime SHA：`b72d3c925b004ac65af35dc1e90d2f6a32d3013d`，修正HQ proxy將品牌管理錯誤rewrite成門市路徑的404。
- 唯一新部署：`dpl_4MBBMDKK3X1MrTF8NJn5r3gEaqXi`，READY，原project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`、原branch、target=null（Preview）。網址：`https://steamfoot-booking-ns9a2jidi-rock7652-2111s-projects.vercel.app`；通行連結已撤銷，未附share secret。
- 唯一資料庫：steamfoot-preview / `ttworfzgwejdeolegkxl`，ACTIVE_HEALTHY。Vercel prebuild以既有角色實際嚴格TLS／BEGIN READ ONLY核對：roleVerified、tlsVerified、globalStopped、disabledStores=4、brandHidden／Disabled／Unpublished皆符合，totalMicros=2690、concurrent=0；migrations_skipped=true、deliveries_blocked=true。
- 同一合成User `ai-preview-brand-hq` 短暫恢復ACTIVE、臨時隨機密碼，無Staff／Store關係；僅重建原四條限定帳號／ADMIN／storeId NULL／SUCCESS及30分鐘期限的RLS。沒有新增角色、變更table grants、HQ grant或店家資料。
- 成功登入 **本輪1次**，之前保留稽核1筆，清理後累積2筆。未重試登入。唯一share link ttl=1800秒，結束不再生。

## 實際雲端結果

真實登入後頁面可用，品牌管理404已確認排除。使用真實server actions與隔離DB資料，沒有注入fixture actions或改頁面內容；所有瀏覽器請求限指定部署origin。Chromium使用一次性mount namespace的獨立NSS信任庫，沒有永久新增CA，未用ignoreHTTPSErrors、憑證錯誤忽略或SPKI略過。

| 項目 | 實際結果 |
| --- | --- |
| 未登入品牌API | 403拒絕 |
| 本品牌讀取 | 200；serviceId固定、HIDDEN、總停止、關閉、revision0／未發布、用量與待人工皆0 |
| 跨門市／品牌參數 | GET覆寫Store／serviceId均400；審核輸入夾帶Store為403 |
| 人工隊列scope | 偽造viewKey為403；本品牌空隊列可讀，不觸發接手／恢復寫入 |
| 知識與安全控制 | 沒有產業切換及門市引用，草稿唯讀，儲存／發布／撤回／AI開關／Mock測試／人工異動皆停用 |
| 唯讀審核 | 六尺寸均以真server action核對已儲存版本0，2筆來源；不寫DB、不發布、不呼叫模型 |
| 切區／重新載入 | 狀態用量、品牌知識、人工接手、安全頁可操作；兩次reload維持固定主體、HIDDEN與停止 |
| 瀏覽器腳本錯誤 | pageerror=0；失敗斷言0 |

六尺寸 **6/6通過**：1920×1080、1366×900、1024×768、768×1024、390×844、360×800；全頁無橫向溢出，桌機分類導覽及窄版分類選擇可操作，知識審核回饋與停用狀態可見。這是Chromium viewport模擬，**不是實體iPad／手機測試**。touch欄位量測可見main nav buttons；不擴稱所有全站控制均已量測44px。完整頁面截圖在審核後捲動位置擷取，sticky HQ導覽可能位於長圖中段。

輔助時間紀錄：登入動作至品牌頁完整可用10.49秒（1次，非中位數）；兩次reload 3.32／3.38秒。非本輪效能比較或SLA結論，不與其他會員頁量測混用。

## 失效與撤銷：真實HTTP證據

驗收完成即由同一流程接續清理，不再用跨步驟等待flag。登入後已私下保存原cookies；停用User、清空密碼、更新updatedAt並移除四policy後，**未重新登入**，以原session token重放：

| 請求 | 結果 |
| --- | --- |
| 舊cookies GET /api/ai/brand | **403**；已確認請求前仍有原session-token cookie |
| 同context GET /api/auth/session | **200，無user.id** |
| 撤銷share link | API剩餘0，不再生 |
| 全新cookies帶原已撤銷連結 | **307回Vercel保護**，嚴格TLS通過 |

這次是實際部署的HTTP拒絕，補足上一輪只有DB／本機失效機制核對的缺口。

## 清理及帳本對帳

- User=SUSPENDED、passwordHash=NULL、updatedAt已改；四條臨時policy=0；保留登入稽核。
- 臨時密碼／hash設定檔、私有storageState（含cookies）與一次性信任庫已刪除；證據不包含token、密碼、完整連線字串。
- 全域停止true；四店enabled=false且原revision（11／8／7／7）未變；品牌HIDDEN／false，settingRevision1、knowledgeRevision0、published=NULL。
- Store Request53（OpenAI5）／Dispatch113不變；Brand Request／Dispatch／Conversation／Audit全0；全域total2690 micros／concurrent0，沒有提高或重置任何額度。
- DB角色期限仍2026-12-02T14:15:52Z。本輪真實OpenAI、Mock及LINE／Messenger／Email外發 **均0次**，無新增模型費用；Vercel本輪只有一次建置，費用無法精確估算。

## 證據與限制

[雲端報告及六張截圖](../../artifacts/ai-digital-butler/brand-management/hosted-b72/) · [舊session HTTP](../../artifacts/ai-digital-butler/brand-management/hosted-b72/session-probe.json) · [share撤銷HTTP](../../artifacts/ai-digital-butler/brand-management/hosted-b72/share-probe.json) · [清理對帳](../../artifacts/ai-digital-butler/brand-management/hosted-b72/cleanup.json)。

本輪沒有啟用品牌或四店、切換HQ狀態、儲存／發布／撤回知識、操作真實人工對話、模型回覆或正式通路；不把唯讀工作台驗收稱正式可營運。LOCKED／ENABLED及寫入流程保留先前本機／CI證據，未在本輪遠端切換。Cloudflare失敗獨立列管，未改設定。原PR維持Draft，未合併。

程式版本b72的CI 45822286548已通過：17,864 passed／340 skipped、TypeScript／ESLint成功。本輪後續提交僅保存本文件與驗收證據，執行程式維持b72，不為證據提交重建Preview。
