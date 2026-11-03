import type {OperationGuide} from './operation-guide-types';
export const dailyOperationGuides20261103:OperationGuide[]=[
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "ADD01",
    "category": "settings",
    "title": "附加項目與加購商品在哪裡設定？為何沒有入口？",
    "summary": "總部功能資格、系統就緒及管理權限分開；沒有入口不代表資料被刪除。",
    "answer": "蒸足、運動與音樂從店務管理的附加項目設定；美業共同商品在加購商品，美業加做服務則在主服務內設定。",
    "path": "店務管理 → 附加項目／加購商品；美業服務項目 → 編輯主服務",
    "keywords": "附加項目 加購商品 共同商品 加做服務 飲品 免費 圖片 裁切 無入口 未開通 教學項目",
    "steps": [
      "先核對門市、模組、總部開通與 add_ons.manage 權限；錯誤或未開通請由總部確認，不自行切換其他店或借用資格。",
      "新增群組與品項，設定名稱、金額、公開圖片；運動／音樂群組指定適用教學項目，未指定不提供選購。",
      "美業個人加做在主服務設定增加金額與分鐘，均可為零；共同商品設定數量，時間為零。圖片調整後先套用，再儲存整份設定。",
      "等待已儲存，重新開啟核對；衝突時讀取目前版本，失敗保留輸入，不以畫面變色當成功。"
    ],
    "important": "一般附加與共同商品不增加時間、名額或扣堂；美業加做可增加服務時間，會重新檢查資源。抽成尚未計算，不套用主服務拆帳。",
    "success": "本店品項與適用範圍重開後一致，原訂單與服務時長未被設定變更回寫。",
    "details": [
      "目前共同商品與美業加做分別受總部功能開通；不再要求門市重複開同一總開關。服務品項是否可選仍依各項狀態。獨立連線未設定時不能啟用共同商品，但不應阻擋原美業班表或體驗預約。",
      "停用或未開通停止新增選購，不刪原訂單與歷史；既有款項查閱及收退款仍依原權限與可用入口核對。不能為驗收啟用正式店。",
      "管理商品需 add_ons.manage；美業服務編輯需 plans.edit，不能以商品管理權限修改技師計酬。"
    ],
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "permission": "add_ons.manage",
    "sources": [
      "src/app/(dashboard)/dashboard/settings/add-ons/page.tsx",
      "src/components/add-ons/catalog.tsx",
      "src/server/services/add-on-access.ts",
      "src/server/actions/store-feature-entitlement.ts",
      "src/server/actions/beauty-native-service.ts"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "ADD02",
    "category": "money",
    "title": "共同商品與附加項目如何調整、收款或退款？",
    "summary": "商品應收與主服務、學費及方案分開；預約成立不表示已付款。",
    "answer": "從原預約或同行者的共同商品／附加項目核對品項及未收金額，修改後另登實際收款，退款回原收款處理。",
    "path": "預約／課程名單 → 原預約或同行者 → 共同商品／附加項目",
    "keywords": "共同商品 附加項目 商品應收 收款 退款 取消預約 刪除同行者 取消不退款 現金帳 音樂財務",
    "steps": [
      "核對本店原預約、顧客、整組商品與各人項目；共同商品數量不隨人數自動增加，個人項目每項一份。",
      "點調整品項才展開選取；已有收款要減少應收時先處理差額退款，不改主服務金額掩蓋差異。",
      "實際收到款項後才登收款及付款方式，退款核對原收款；結果待確認先查原請求，不重收。",
      "重開核對商品未收、實收、退款及現金帳；取消預約後仍另外確認退款，有附加歷史不能直接刪除同行者。"
    ],
    "important": "登錄收款或退款不等於系統向銀行扣款或退刷；不改學費、方案額度或出席。",
    "success": "商品及原收款歷史可核對，沒有重複收退款或以取消預約當完成退款。",
    "details": [
      "查閱需 booking.read、transaction.read；修改需 booking.update，收款需 transaction.create，退款需 transaction.refund。音樂還須原全店財務範圍；不是看得到名單就能收款。",
      "美業主服務加做在待服務預約修改；應收改變而有優惠時先依原流程清除優惠。美業加做份數／服務日原價小計不是實收營收；共同商品收入另外列。",
      "功能關閉後不新增選購，既有資料不刪除；遇連線／權限／報價錯誤先回原紀錄核對，不重建預約。"
    ],
    "modules": [
      "steamfoot",
      "course",
      "beauty"
    ],
    "permission": "booking.read",
    "additionalPermissions": [
      "transaction.read"
    ],
    "sources": [
      "src/server/actions/shared-goods.ts",
      "src/server/actions/beauty-shared-goods.ts",
      "src/server/actions/course-add-ons.ts",
      "src/server/actions/steamfoot-add-ons.ts",
      "src/server/actions/beauty-add-ons.ts",
      "src/components/add-ons/booking.tsx"
    ]
  },
  {
    "kind": "howto",
    "verification": "source-reviewed",
    "feature": null,
    "id": "BEAUTY10",
    "category": "booking",
    "title": "技師請假或缺席後，這筆服務如何處理？",
    "summary": "本筆技師出勤與整日排班不同；先改派或恢復正常，再完成服務。",
    "answer": "在原預約名單上方編輯技師備註及出勤狀態，請假／缺席須填原因；保留顧客預約與位置，不直接扣次。",
    "path": "美業班表 → 原預約名單 → 技師資訊／備註",
    "keywords": "美業 技師 請假 缺席 出勤 原因 備註 改派 正常服務 不扣次",
    "steps": [
      "核對原待服務預約、技師與日期，不把單筆狀態當整日休假。",
      "在技師資訊填備註或選請假／缺席，填原因後儲存；儲存中先等待，不能同時操作名單。",
      "需繼續服務時先換合格技師或恢復正常服務，再依原權益及收款狀態完成。",
      "重新開啟核對出勤及原因；若他人已改派、服務完成或版本改變，先重讀，不覆蓋。"
    ],
    "important": "請假／缺席保留預約與位置，尚未處理前不能新增服務扣次或計酬；它不會自動取消顧客預約或退款。",
    "success": "本筆技師狀態與原因保存正確，沒有因標記缺席而扣次、退款或刪除預約。",
    "details": [
      "修改需 booking.update 與 staff.manage，且只可調整待服務預約；技師須與目前預約相符。",
      "服務資格與計酬分開管理，未設定計酬不等於無服務資格；計酬變更仍需原專用權限。"
    ],
    "modules": [
      "beauty"
    ],
    "permission": "booking.read",
    "sources": [
      "src/components/beauty/technician-roster.tsx",
      "src/server/actions/beauty-technician-service.ts",
      "src/server/beauty/technician-service.ts",
      "src/server/actions/beauty-native-roster.ts"
    ]
  }
];
