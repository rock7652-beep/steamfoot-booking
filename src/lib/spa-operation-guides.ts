import type { OperationGuide } from "./operation-guide-types";

/** SPA source review; logged-in acceptance is tracked separately. */
export const spaOperationGuides: OperationGuide[] = [
  {
    "id": "J14",
    "category": "start",
    "title": "SPA 第一次開放預約，要先完成哪些設定？",
    "summary": "先備妥療程、人員、班表與服務位置，再核對會員可選時段。",
    "answer": "先備妥療程、人員、班表與服務位置，再核對會員可選時段。",
    "path": "方案管理 → 療程；人員管理；服務位置",
    "keywords": "新手 首次 開店 初始化 設定順序",
    "steps": [
      "在方案管理設定療程、售價、服務與整理時間，核對是否開放顧客自行預約。",
      "由店長從本店會員加入服務人員，設定可提供服務及班表；建立啟用的服務位置並勾選適用療程。",
      "核對會員入口的服務及可選時段；完整試約與結帳請在隔離測試店進行。"
    ],
    "important": "只新增療程或人員還不會自動產生可預約時段。",
    "details": [
      "每個設定頁仍需對應權限；人員管理由店長處理。",
      "首次設定可依序參考服務設定、位置、人員連結與排班教學。"
    ],
    "success": "會員能看到正確服務，且可選時段符合店內班表。",
    "permission": "",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-resources/workspace.tsx",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J15",
    "category": "spa",
    "title": "怎麼讓本店會員成為服務人員？",
    "summary": "從本店會員加入或連結既有人員，接著設定服務與班表。",
    "answer": "從本店會員加入或連結既有人員，接著設定服務與班表。",
    "path": "店長後台 → 人員管理 → 新增人員／連結會員",
    "keywords": "新增人員 會員連結 LINE 技師 芳療師 工作權限",
    "steps": [
      "由店長開啟人員管理，點「＋新增人員」；已有排班人員但尚未連結時，選該人員再點「連結會員」。",
      "輸入會員姓名或手機搜尋，核對遮罩電話、LINE 綁定與既有人員狀態，再選正確會員。",
      "加入後設定「可提供服務」及日期班表，請本人重新登入本店前台查看「我的工作」。"
    ],
    "important": "找不到會員時先確認本店會員註冊及 LINE 綁定；不要另建同名人員來略過身分核對。",
    "details": [
      "加入人員不會自動開放接單。",
      "停用工作權限不等於刪除會員身分或方案。"
    ],
    "success": "人員顯示會員已連結，且本人可查看自己的工作。",
    "permission": "duty.manage",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/spa-staff/new-person.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx",
      "src/app/(dashboard)/dashboard/spa-staff/page.tsx",
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx"
    ]
  },
  {
    "id": "J16",
    "category": "spa",
    "title": "療程已上架，為什麼會員還是找不到可約時段？",
    "summary": "可約時段需同時滿足療程、人員資格與班表、位置以及完整占用時間。",
    "answer": "可約時段需同時滿足療程、人員資格與班表、位置以及完整占用時間。",
    "path": "方案管理／人員管理／服務位置 → 會員預約",
    "keywords": "沒有時段 無法預約 不指定 空檔 整理時間 上架",
    "steps": [
      "確認療程開放顧客預約、日期在可預約範圍內，並重新查詢該日。",
      "由店長核對可提供此療程的人員與當日班表，再確認啟用位置適用所有選取療程。",
      "檢查既有預約及服務加整理時間；改選日期或服務後重新選時段與人員。"
    ],
    "important": "畫面空白不代表足夠容納整段服務；選「不指定」也不會略過資格或衝突檢查。",
    "details": [],
    "success": "符合條件的日期出現可選時段；仍無時段時能指出需調整的條件。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/app/(dashboard)/dashboard/spa-staff/workspace.tsx"
    ]
  },
  {
    "id": "J17",
    "category": "spa",
    "title": "如何引導會員自行預約 SPA 療程？",
    "summary": "會員依序選服務、日期時間、人員，再核對摘要送出。",
    "answer": "會員依序選服務、日期時間、人員，再核對摘要送出。",
    "path": "會員專區 → 立即預約",
    "keywords": "會員預約 顧客前台 指定人員 不指定 自動安排 服務位置",
    "steps": [
      "會員登入正確門市，點立即預約，選取需要的服務，再選日期及上午、下午或晚上的可用時段。",
      "選指定服務人員，或點「不指定（由系統安排）」。",
      "核對日期時間、服務、人員、預估時間與價格，再送出；成功後查看我的 SPA 預約。"
    ],
    "important": "這個會員表單沒有手選位置步驟，系統會安排可用位置；實際安排可在成功後的預約卡查看。",
    "details": [
      "修改服務或日期後需重新選時段與人員。",
      "送出有衝突時先閱讀提示並重選；不確定是否成功時先查已有預約。"
    ],
    "success": "預約卡顯示正確服務、人員、位置與日期時間。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/app/(customer)/book/page.tsx"
    ]
  },
  {
    "id": "J18",
    "category": "spa",
    "title": "會員怎麼取消 SPA 預約？為什麼不能取消？",
    "summary": "在預約卡確認取消；目前自行取消限制為服務開始前至少 12 小時。",
    "answer": "在預約卡確認取消；目前自行取消限制為服務開始前至少 12 小時。",
    "path": "會員預約頁 → 我的 SPA 預約 → 取消這筆預約",
    "keywords": "會員取消 取消截止 十二小時 12 小時 退費 釋放",
    "steps": [
      "核對本店、日期時間及服務，點「取消這筆預約」。",
      "閱讀確認內容後點「確認取消」；若保留原安排則點「保留預約」。",
      "確認卡片顯示已取消；距離開始不足 12 小時或狀態不允許時，請聯繫店家協助。"
    ],
    "important": "取消預約不等於退款；已付費款項另由店家核對。",
    "details": [
      "成功取消會保留歷史並釋放人員、位置及該筆預約的保留權益。",
      "這是 SPA 會員自行取消規則，不套用課程模組的取消設定。"
    ],
    "success": "原預約顯示已取消，或清楚顯示需聯繫店家的原因。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J19",
    "category": "spa",
    "title": "會員在哪裡查 SPA 剩餘次數與預約保留？",
    "summary": "從會員專區查看我的療程，分別核對剩餘、已預約及可用次數。",
    "answer": "從會員專區查看我的療程，分別核對剩餘、已預約及可用次數。",
    "path": "會員專區 → 我的療程",
    "keywords": "剩餘次數 保留 可用次數 過期 歷史療程 扣次",
    "steps": [
      "會員先確認門市及登入身分，再打開我的療程。",
      "核對療程名稱、期限、剩餘次數及已預約保留；需要時查看過期與歷史區。",
      "若有剩餘卻不能結帳扣次，請店家核對適用服務、有效期及保留紀錄。"
    ],
    "important": "可用次數會扣除已預約保留；預約保留不代表服務已完成或款項已結清。",
    "details": [
      "目前會員單一服務預約會在有適用權益時保留一次；多服務組合不可一律推論會自動保留。",
      "本頁讀取 SPA 療程權益，不會把蒸足方案或課程額度合併。"
    ],
    "success": "能對應療程期限、剩餘與保留數量，異常交由店家查原紀錄。",
    "permission": "customer.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/page.tsx",
      "src/app/(liff)/liff/wallets/wallets-list.tsx",
      "src/server/actions/spa-liff-member.ts",
      "src/server/actions/spa-customer-booking.ts"
    ]
  },
  {
    "id": "J20",
    "category": "spa",
    "title": "SPA 服務人員怎麼查看我的工作與備註？",
    "summary": "切到我的工作，選日期並展開預約查看服務明細及預約備註。",
    "answer": "切到我的工作，選日期並展開預約查看服務明細及預約備註。",
    "path": "會員專區 → 我的工作",
    "keywords": "服務人員 我的工作 月曆 藍點 休假 備註 完成服務",
    "steps": [
      "以已連結的本店會員登入，切到「我的工作」。",
      "選月曆日期；藍點表示有預約，休假日另有標示，可用「回到今天」返回。",
      "點開預約卡，核對顧客、時間、服務位置、服務與整理時間及預約備註。"
    ],
    "important": "此工作頁目前提供查看，沒有課程教練的點名、更正出席或編輯備註按鈕；完成服務與結帳由有權限者在後台處理。",
    "details": [
      "工作頁只列本人被指派的預約，取消的預約不列入。",
      "當日無預約不代表已開放接單，仍以店內班表為準。"
    ],
    "success": "選取日期的本人行程與展開明細一致。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx",
      "src/server/actions/spa-liff-staff-work.ts",
      "src/components/spa-identity-mode-switcher.tsx"
    ]
  },
  {
    "id": "J21",
    "category": "spa",
    "title": "服務人員看不到我的工作，怎麼排查？",
    "summary": "先區分工作權限不足與暫時無法讀取，再核對本人及門市連結。",
    "answer": "先區分工作權限不足與暫時無法讀取，再核對本人及門市連結。",
    "path": "我的工作 → 提示訊息；店長後台 → 人員管理",
    "keywords": "尚未取得本店工作權限 無法讀取 會員綁定 重新登入",
    "steps": [
      "確認正在正確門市，且以店長連結的那個會員身分登入。",
      "顯示「尚未取得本店工作權限」時，請店長核對本店會員與服務人員連結；剛設定完成可重新登入。",
      "顯示「目前無法讀取工作資料」時先重新整理；持續失敗請提供時間與畫面請店家協助。"
    ],
    "important": "暫時讀取失敗不能直接當作沒有預約，也不要重建會員或分享他人的登入帳號。",
    "details": [],
    "success": "恢復顯示本人工作，或明確確認需修正的連結／讀取問題。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx",
      "src/server/actions/spa-liff-staff-work.ts",
      "src/app/(dashboard)/dashboard/spa-staff/new-person.tsx"
    ]
  },
  {
    "id": "J22",
    "category": "spa",
    "title": "店長如何修改或取消原本的 SPA 預約？",
    "summary": "從原預約修改日期、服務、人員或位置，避免另外新增造成重複。",
    "answer": "從原預約修改日期、服務、人員或位置，避免另外新增造成重複。",
    "path": "預約排程 → 原預約",
    "keywords": "改期 改時間 換人員 換位置 取消 預約備註",
    "steps": [
      "點開原預約並核對顧客、日期、服務及狀態。",
      "要調整時修改必要欄位與備註，核對可用人員、位置及摘要後點「儲存修改」。",
      "要取消時點「取消預約」再確認；完成後重查原預約狀態。"
    ],
    "important": "只有待確認、已預約且具修改權限的預約可操作；已完成或取消的預約不能用此方式重改。",
    "details": [
      "提示預約已變更時，重新開啟原預約讀取最新內容後再決定。",
      "備註最多 500 字，可在服務人員工作明細看到；取消不等於退款。"
    ],
    "success": "原紀錄呈現新安排或已取消，沒有新增重複預約。",
    "permission": "booking.update",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/spa-schedule/workspace.tsx",
      "src/server/actions/spa-booking.ts",
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx"
    ]
  },
  {
    "id": "J23",
    "category": "spa",
    "title": "SPA 預約成功卻沒收到 LINE，應該重約嗎？",
    "summary": "先查系統內預約紀錄；畫面同步成功不能當作 LINE 已送達。",
    "answer": "先查系統內預約紀錄；畫面同步成功不能當作 LINE 已送達。",
    "path": "會員我的預約／店長預約排程",
    "keywords": "LINE 沒通知 未送達 預約成功 重複預約 同步",
    "steps": [
      "會員先查看自己的 SPA 預約，店長核對同日期與服務的原紀錄。",
      "已有預約時保留該筆，確認服務人員工作畫面是否列入；另核對本店 LINE 綁定及通知紀錄。",
      "沒有通知或查詢失敗時記下時間與提示請店家查明，不要用重新預約來測試通知。"
    ],
    "important": "會員表單的「店長與服務人員會同步看到」是系統行程同步，不是 LINE 送達保證。",
    "details": [
      "是否發通知仍須依實際使用入口、通知設定與發送結果查核；不能套用展示預覽流程的通知承諾。"
    ],
    "success": "能區分預約已建立、工作可見與 LINE 通知結果。",
    "permission": "booking.read",
    "feature": null,
    "modules": [
      "spa"
    ],
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(customer)/book/new/spa-customer-booking-form.tsx",
      "src/server/actions/spa-customer-booking.ts",
      "src/server/actions/spa-liff-staff-work.ts"
    ]
  }
];
