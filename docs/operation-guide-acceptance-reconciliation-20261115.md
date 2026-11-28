# 後台指南差異驗收對照（2026-11-15）

接續11/14，原141題加本輪差異去重共146題／14類；91題保留先前指南證據，55題在已查來源未找到逐題指南登入證據，不代表功能全未驗。新增0、更新21、清除0。

#1564的f9f7af56登入31案與前版65ecd1b5交易28案分開；#1566的469fbe62登入81案；#1569的717641c7登入171案（含模擬攔截未送後端的中斷案例），#1567分析對帳與使用者實測，#1568／1570代表性正式唯讀篩選，#1572的b11283b1實際有日期格回歸均保留其精確版本及限制。#1571曾回滾，由#1572更正正式發布，不把舊缺陷寫成操作規則；不宣稱首次全部秒開或iPad真機通過。

沿用#1250／1275原指南通過與未改共用導覽，按分類／角色補正文及入口差異，不重做交易。I20獨立資格限制不擴權。新指南登入與截圖結果記同一草稿PR #1429。

| 題號 | 文章 | 先前指南證據 | 後續差異欄位 |
|---|---|---|---|
| I20 | 店主如何查看本店操作紀錄？為什麼沒有入口？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| A03 | 這次預約有事情要交代，怎麼記錄？ | #1275 | details |
| A15 | 蒸足多人預約如何補同行資料或臨時加人？ | #1275 | answer、steps、important、details |
| A16 | 蒸足多人首次體驗如何逐人收款、扣本人方案或標記未到？ | #1275 | summary、answer、steps、important、details |
| C103 | 報到、完成與未到，額度有什麼差別？ | #1275 | summary、important、details |
| C114 | 新增教練或教師後，為什麼還不能排課？ | #1275 | summary、answer、path、steps、details |
| C115 | 課程分析的上課、收款與回流數字怎麼看？ | #1250（使用者確認） | steps、important、details |
| C123 | 課程店的設定入口怎麼找？未儲存草稿會消失嗎？ | #1275 | summary、important、details、references |
| C126 | 第一次使用課程系統，設定順序是什麼？ | #1275 | summary、path、steps、details |
| C139 | 如何開放人員查看本人收入？原本的計算開關在哪？ | #1250（使用者確認） | answer、path、steps、details |
| C157 | 音樂老師拆帳與可查看的教師範圍怎麼設定？ | #1250（使用者確認） | path、steps、details |
| C164 | 教練的明日課表、課程異動與體驗通知怎麼開？ | #1250（使用者確認） | summary、answer、important、details、references |
| C168 | 如何分開設定學員自行預約、請假與改期？ | #1275 | title、summary、answer、path、steps、important、details |
| C169 | 音樂教師如何設定可教課程、拆帳比例及 LINE 權限？ | #1275 | summary、answer、path、steps、details |
| C170 | 課程門市訊息如何查看、標為已讀或回查？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| W06 | 工單待取件 LINE 通知怎麼開啟、確認身分與查結果？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C03 | 顧客姓名或電話填錯，怎麼修正？ | #1250（使用者確認） | summary、answer、steps、details |
| C04 | 哪裡可以看顧客的預約與消費紀錄？ | #1250（使用者確認） | summary、path、steps、details、modules |
| C05 | 店內備註和本次預約備註有什麼不同？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C08 | 顧客換 LINE 或綁定有衝突怎麼辦？ | #1250（使用者確認） | summary、answer、path、steps、details |
| C117 | 會員登入後看不到本店課程或方案，先查什麼？ | #1275 | summary、answer、steps、details |
| D02 | 顧客買了方案，如何登記？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| D03 | 在哪裡看剩餘堂數與到期日？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| D10 | 每一堂是預約中、已使用還是被註銷，在哪裡查？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| I14 | 總部的功能狀態：隱藏、鎖定、啟用與跟隨方案有何差別？ | #1250（使用者確認） | path、details |
| W05 | 工單如何列印雙聯、查看進度與歷史？ | #1250（使用者確認） | summary、details |
| F01 | 顧客提醒與店長通知在哪裡分開設定？ | #1250（使用者確認） | summary、steps、details |
| G01 | 新增後台人員時，角色與工作身分怎麼選？ | #1250（使用者確認） | summary、steps、details |
| G03 | 員工看不到某個功能，是系統壞了嗎？ | #1250（使用者確認） | steps、details |
| I18 | HQ 如何切店、返回總部及閱讀品牌總覽？ | #1275 | details |
| I21 | 設定按儲存後，怎麼確認真的成功？失敗可以直接重按嗎？ | #1275 | summary、steps、details |
| I22 | 顧客、人員、預約與提醒無上限，為什麼有些功能仍不能用？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C07 | 顧客登入後看不到原本方案，先查什麼？ | #1250（使用者確認） | summary、answer、steps、details |
| C142 | 確認收入後，如何手動通知人員到 LINE 查看？ | #1250（使用者確認） | path、details |
| I07 | 分店串接費怎麼算？開通額度就會扣款嗎？ | #1250（使用者確認） | important、details |
| E01 | 顧客說已匯款，如何確認收款？ | #1250（使用者確認） | details |
| F03 | 當日臨時預約，要怎麼通知店長？ | #1250（使用者確認） | summary、answer、steps、details |
| F08 | 顧客已購買或預約，還會收到體驗邀請嗎？ | #1250（使用者確認） | details |
| F10 | 如何處理待關懷、已安排與已處理的顧客？ | #1250（使用者確認） | details |
| H01 | 怎麼查看本月或其他期間的營收？ | #1250（使用者確認） | details、steps |
| H09 | 報表跟預約清單數字不同，怎麼核對？ | #1250（使用者確認） | details |
| I05 | 切換分店後，為什麼只能查看？ | #1250（使用者確認） | details |
| L01 | 找不到按鈕或畫面跟教學不同怎麼辦？ | #1250（使用者確認） | steps |
| D12 | 顧客從關懷訊息購買方案，轉帳後怎麼開通？ | #1250（使用者確認） | details |
| B11 | 同一組服務時段，怎麼套用到多個指定日期？ | #1250（使用者確認） | summary、steps、details、modules |
| I13 | 新版設定中心怎麼找營業、收款、人員、提醒與方案？ | #1275 | summary、details |
| A14 | 蒸足多人單次收款，原價是每人還是整筆？ | #1275 | details |
| F04 | LINE 沒收到通知，先檢查什麼？ | #1250（使用者確認） | summary、answer、steps、details、modules |
| I17 | HQ 店舖封存後，資料與登入會被停用嗎？ | #1250（使用者確認） | answer、details |
| C145 | 音樂課怎麼記錄出席、曠課、請假與恢復待點名？ | #1250（使用者確認） | details |
| C146 | 音樂課老師請假或曠課，學員與補課怎麼處理？ | #1250（使用者確認） | details |
| C148 | 音樂固定課要調課或改回原時段，怎麼操作？ | #1250（使用者確認） | summary、steps、details |
| C149 | 音樂方案的購買期數、堂數與到期日怎麼算？ | #1250（使用者確認） | steps、details |
| C162 | 教師或教練請假、曠課後，學員權益怎麼返還？ | #1250（使用者確認） | details |
| C167 | 課程 LINE 提醒的改期、取消、確認會到與續購，後台怎麼核對？ | #1275 | details |
| I12 | 總部如何查各店操作與登入紀錄？ | #1275 | steps、details |
| A05 | 怎麼查看當日預約、狀態並直接聯絡顧客？ | #1275 | steps、details |
| C105 | 課程方案如何登錄協商退款？ | #1250（使用者確認） | details |
| C109 | 怎麼一次排單堂、每週或多個指定日期？ | #1250（使用者確認） | steps、details |
| C112 | 店內購買方案並結帳，怎麼處理？ | #1250（使用者確認） | details |
| C171 | 為什麼我的運動課表還是舊版，或新版無法載入？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C172 | 新版運動的教學項目與收費方式怎麼建立？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C173 | 新版運動如何排固定課、指定學員或開放選課？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C102 | 同堂多人只取消其中一人，怎麼處理？ | #1250（使用者確認） | details |
| C107 | 新課程要先設定哪些資料？ | #1250（使用者確認） | important、details |
| C110 | 排好的課程要改時間、容量或取消，先看什麼？ | #1250（使用者確認） | details |
| C111 | 如何建立點數或堂數方案？ | #1275 | important |
| C174 | 新版運動如何核對請假、曠課及取消錯誤標記？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C175 | 新版運動剪下課程後，如何貼上與核對調課結果？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C176 | 新版運動的共用與教練個別計酬怎麼設定？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C129 | 哪裡查看學員的購買與上課紀錄？ | #1250（使用者確認） | steps、details |
| C134 | 剩餘、預約保留與可用額度怎麼看？ | #1275 | details |
| C108 | 如何新增空間並設定租借？ | #1275 | title、summary、answer、path、steps、important、details |
| C122 | 教練每堂授課費如何登錄已付或更正？ | #1250（使用者確認） | answer、steps、details |
| E08 | 要登記收入或支出，從哪裡操作？ | #1250（使用者確認） | details |
| I08 | 裝置預覽與前台唯讀預覽有何不同？ | #1250（使用者確認） | summary、steps、details |
| C161 | 如何新增空間租借、收款或取消？ | #1250（使用者確認） | steps、details |
| IMG01 | 如何在首頁放課表或營業時間圖片？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| CG01 | 如何找出期間內消耗最多或最少的顧客？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C124 | 怎麼從課表替既有學員或新體驗客預約？ | #1250（使用者確認） | important、details |
| I19 | HQ 如何管理需求諮詢與體驗版開通申請？ | #1275 | details |
| A17 | 蒸足門市訊息在哪裡？如何標為已讀與回查？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| F13 | LINE 訊息額度快用完時，如何設定 Email 通知？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C130 | 店內備註與本次上課備註有何不同？ | #1275 | details |
| C144 | 音樂課如何找老師與教室空位並建立課表？ | #1250（使用者確認） | summary、path、steps、details |
| C150 | 音樂課名單的本期進度、付款與下期紀錄怎麼看？ | #1250（使用者確認） | details |
| C152 | 音樂學員要續報，怎麼從課表名單完成繳費？ | #1250（使用者確認） | path、steps |
| C154 | 音樂方案多期、贈課或中途插班，繳費時怎麼核對？ | #1250（使用者確認） | path、details |
| C177 | 如何設定開放選課與指定學員？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY01 | 美業店開店前要設定什麼？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY02 | 同行多人可以預約不同服務嗎？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY03 | 家人共用方案怎麼設定？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY04 | 技師拆帳明細與更正怎麼處理？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C178 | 單次收費、體驗與多次方案如何分開設定？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY05 | 美業方案如何調整期限或註銷？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY06 | 美業店家固定費用、店長分配與技師拆帳有何不同？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| BEAUTY07 | 美業單次或體驗消費如何購買與收款？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY08 | 美業收入分類與月結的技師費如何分開核對？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY09 | 技師明日班表與預約異動通知如何設定？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| F12 | 體驗預約成功，但 LINE 通知尚未完成怎麼辦？ | #1250（使用者確認） | path、steps、important、details |
| FIN01 | 營收、現金帳、月結與匯出現在在哪裡？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C138 | 每月收入結算怎麼核對店長利潤與教練授課費？ | #1250（使用者確認） | path、details |
| C140 | 新版月結找不到登錄利潤已付，舊付款與更正去哪裡查？ | #1250（使用者確認） | path、details |
| E13 | 蒸足月結的服務收入與空間租金，為什麼分開顯示？ | #1250（使用者確認） | details |
| H05 | 營運資料如何匯出 Excel？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| F14 | LINE 恢復後，為什麼舊通知仍不補發？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| LN01 | 顧客 LINE 如何由店長核對後以手機重新綁定？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C179 | 同項目有多張方案，為什麼餘額合計、點名卻提示先繳費？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| FIN02 | 購買、收款或核帳中斷後，如何接續原請求？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C141 | 課表如何切換月表、週表、日表及上課名單？ | #1250（使用者確認） | steps、details |
| C165 | 課表月、週、日怎麼搜尋與篩選課程？ | #1250（使用者確認） | details |
| PM01 | 方案如何註銷，或延長／縮短期限？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| DM01 | 數位店長的門市訊息與 LINE 通知有什麼不同？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C106 | 課程提醒會寄給誰？怎麼確認有沒有送達？ | #1250（使用者確認） | steps、details |
| PLAN-SESSION-ADJUST | 如何補登以前上過的課，或註銷部分堂數？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| B04 | 臨時增開、關閉或重開時段怎麼做？ | #1250（使用者確認） | path、steps、important、details |
| ADD01 | 附加項目與加購商品在哪裡設定？為何沒有入口？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| ADD02 | 共同商品與附加項目如何調整、收款或退款？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY10 | 技師請假或缺席後，這筆服務如何處理？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C137 | 銀行轉帳資料與體驗價格在哪裡設定？ | #1250（使用者確認） | details |
| BEAUTY11 | 同一位顧客如何合併不同主服務？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY12 | 美業服務與加做如何登錄混合付款？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| BEAUTY13 | 美業如何臨時開放或關閉當日時段？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、feature |
| C127 | 如何新增或修改課程學員資料？ | #1250（使用者確認） | details、steps |
| A01 | 顧客想改時間，怎麼處理？ | 無逐題指南登入證據 | title、summary、path、steps、important、details |
| AGR01 | 共同約定如何設定、預覽、啟用或暫停？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| AGR02 | 如何查找簽署紀錄、查看原版本與下載 PDF？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| MONTH01 | 月結如何新增獎勵、減項及重新開啟調整？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| REF01 | 如何取得店家推薦碼、查看免費天數？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| REF02 | 總部如何核對推薦收款、發放雙方各 30 天？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| I11 | 總部怎麼查看一筆資料是誰、何時做了什麼操作？ | #1275 | path、steps、details |
| C132 | 課程預約與自行取消截止時間怎麼設定？ | #1250（使用者確認） | details |
| C104 | 公休或縮短可預約日期，為什麼不能儲存？ | #1250（使用者確認） | details |
| A04 | 如何替顧客新增預約？ | #1250（使用者確認） | details |
| C180 | 兄弟姊妹共用電話，如何核對同電話學員集中查看？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| C181 | 舊通用課卡顯示科目待核對，店長如何確認？ | 無逐題指南登入證據 | title、summary、answer、path、steps、important、details、modules、permission、additionalPermissions、feature |
| E10 | 提領現金、補入現金和支出有何不同？ | #1250（使用者確認） | steps、details |
| C153 | 音樂課程名稱與收費方案為什麼分開？怎麼建立？ | #1250（使用者確認） | details |
| C163 | 教練每週可授課時段怎麼改？既有課會消失嗎？ | #1250（使用者確認） | path |
| D04 | 方案到期日填錯，怎麼修改？ | 無逐題指南登入證據 | summary、answer、path、steps、details |
| D09 | 堂數記錄不符，如何核對與更正？ | 無逐題指南登入證據 | path、steps、important、details |
| H03 | 體驗、到場與買方案，要怎麼看？ | #1250（使用者確認） | steps、details |
| H04 | 上個月體驗、這個月買方案，算在哪個月？ | 無逐題指南登入證據 | steps、details |
| C128 | 如何設定運動學員的所屬教練與推薦人？ | #1250（使用者確認） | steps、details |
| M01 | 如何查看顧客最近量測與歷史曲線？ | #1250（使用者確認） | steps、details |
| C135 | 如何新增、修改與查看學員健康量測？ | #1250（使用者確認） | steps、details |
