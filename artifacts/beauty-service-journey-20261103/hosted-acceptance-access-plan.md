# Hosted 業務驗收：已批准的隔離權限範圍

程式版本：5f4d0e7745a1d337b1b0e239938d06dbdc57f2e1；PR #1503。

## 已確認

- 本次專用 bubblewrap mount namespace 掛載暫存 NSS 信任庫，瀏覽器在維持代理、TLS 驗證下已成功取得預覽站 HTTP 200。共用信任庫未修改。
- 實際登入回報 digest 1846633003。Vercel runtime log 證實 StaffLoginRecord INSERT 被 RLS 拒絕；目前 QA role 的預約／付款政策也只有 SELECT，不能進行完整交易驗收。
- 沒有提交預約或付款。舊 OWNER 帳號已恢復 SUSPENDED／passwordHash NULL、Staff INACTIVE 及原 updatedAt；會員帳號未修改。合成服務、方案、技師及床位停用，合成卡關閉，臨時加做資格停用。

## 已批准方案

- 只在隔離 Supabase 專案 ttworfzgwejdeolegkxl、isDemo 店 beauty-hosted-20261021 操作；正式專案不變。
- 不停用 RLS、不加入 BYPASSRLS、不授予跨店權限，不改正式角色、正式部署或通知停發設定。
- 臨時政策只授予現有 QA role 本次測試必要的同店 SELECT／INSERT／UPDATE。登入紀錄限定已授權舊 OWNER 的 actorUserId 與 storeId；服務、方案、卡、技師及床位寫入限定 QA1503 合成資料。
- 交易限本次合成會員與服務，涵蓋 BeautyGroup／BeautyAppointment／BeautyLedger／BeautyPayment／BeautyEvent、既有 command／修訂及金流稽核。現金驗收需要同店臨時錢櫃與現金帳，不能改寫其他人的錢櫃。具體政策需依現有欄位與交易鏈列明後執行，不能因此放寬全表或其他店。
- 驗收 A+B、同／不同技師、各段加做、混合付款、重送、取消釋放及完成扣次；只透過正常登入及應用交易流程建立交易，不偽造 session。
- 完成或受阻即撤回本次政策與 grants、恢復舊帳號與設定。交易與稽核證據保留並標示 QA，不刪除或改寫不可變付款／扣次紀錄。

使用者於本聊天明確回覆「允許」，已批准上述單一隔離店的臨時必要寫入權限，完成後撤回；後續不需重問同一授權。

本輪尚未執行新增權限、啟用帳號或建立業務交易。Supabase 唯讀 metadata 查詢的自動權限審核逾時，重試仍逾時；單一 Store/isDemo 唯讀查詢已成功，確認目標隔離店存在；RLS／grants 盤點仍遭自動審核逾時。Vercel 存取工具亦未成功。這是工具審核逾時，不是安全拒絕，也不是使用者尚未批准。待工具恢復後，先核對實際 RLS／grants，再套用最小政策並驗證跨店及非 QA 資料仍遭拒絕，接續已批准的正常登入與交易驗收。
