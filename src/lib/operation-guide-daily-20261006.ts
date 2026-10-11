import type { OperationGuide } from "./operation-guide-types";

/** Initial source review at main b665404e; G05 and inventory corrections reviewed at cd6d80f.
 * Logged-in operation acceptance remains separate. */
export const dailyOperationGuides20261006: OperationGuide[] = [
  {
    "id": "A13",
    "category": "booking",
    "title": "當日多筆預約如何全選並批次完成？",
    "summary": "先進入批次模式，只選目前清單中可完成的預約；確認筆數與總人數後再一次送出。",
    "answer": "在當日清單開啟「批次完成」，全選或逐筆勾選可完成預約，核對筆數、人數及收款狀態後確認。",
    "path": "預約管理 → 選日期 → 當日預約 → 批次完成",
    "keywords": "批次完成 全選 當日預約 多筆 完成所選 人數 部分失敗 待確認 還原",
    "steps": [
      "選定日期並套用必要篩選，點「批次完成」；只有目前清單中可完成的待處理預約會出現勾選。",
      "用全選或逐筆勾選，核對畫面的預約筆數與總人數；需要先收款的預約請改用個別流程。",
      "點「完成所選」，在確認視窗再次核對日期、筆數與人數後才送出。",
      "查看成功、失敗與待確認數；失敗項目留在清單，逐筆開啟提示處理，必要時可從個別預約還原。"
    ],
    "important": "批次完成依原方案規則扣堂，但不改收款狀態；不要把待收款預約用批次完成繞過個別收款確認。",
    "success": "成功項目改為已完成，失敗／待確認項目保留可追查，扣堂與原收款狀態一致。",
    "details": [
      "全選只包含目前篩選後且可完成的預約；已完成、取消、未到、唯讀或正在處理的項目不會加入。",
      "處理期間自動更新暫停，避免名單變動；結果不明先重新讀取，不要重按。",
      "批次完成不能替代多人實到、體驗／單次收款或其他需要個別確認的流程。"
    ],
    "modules": [
      "steamfoot"
    ],
    "permission": "booking.update",
    "feature": null,
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx",
      "src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx",
      "src/lib/booking-action-batch.ts",
      "src/server/actions/booking.ts"
    ]
  },
  {
    "id": "G05",
    "category": "staff",
    "title": "Owner、Manager、Staff 有什麼差別？角色怎麼調整？",
    "summary": "Owner 管理所屬門市全部已開通功能；Manager 與 Staff 依個別權限操作，角色切換預設保留原授權。",
    "answer": "先選符合責任的角色，再決定是否套用角色預設；儲存前核對新增／移除權限，角色變更後請本人重新登入。",
    "path": "人員管理 → 選擇人員 → 同頁基本資料／後台帳號與權限",
    "keywords": "Owner Manager Staff 老闆 店長 門市人員 角色切換 套用角色預設 保留個別授權 最後一位 Owner 退貨 退款 作廢銷貨 更正收款 作廢收款",
    "steps": [
      "在人員管理開啟同頁編輯彈窗，核對基本資料、後台帳號、目前角色及操作者可管理範圍。",
      "選新角色；預設會保留現有個別授權。只有確定要全面改成新角色預設時，才勾「套用角色預設權限」。",
      "閱讀增加／移除權限摘要並確認儲存；角色切換後舊登入會失效，請本人重新登入。",
      "再用當事人帳號核對側欄、直接網址與敏感操作；教練／教師／芳療師工作身分另行驗證。"
    ],
    "important": "最後一位啟用中的 Owner 不可停用或降級；Manager 不能管理自己、Owner、Admin 或其他 Manager，也不能授出自己沒有的權限。",
    "success": "角色、細項權限與可見功能一致，重新登入後沒有跨店或超出階層的操作。",
    "details": [
      "Owner 的細項權限不縮減，但功能開通、店舖範圍與母子店唯讀仍照常限制；操作與登入紀錄目前僅供總部 ADMIN 查閱。",
      "Manager 預設含店務、銷貨、收款、收貨，以及「退貨、退款與作廢銷貨」「更正或作廢收款紀錄」；Staff 預設不含後兩項。兩者預設均不含進銷存成本、進貨付款、商品管理及價格管理。",
      "角色預設只在建立帳號或明確套用時寫入；既有人員以實際已儲存權限為準，不會因新增權限自動取得授權。",
      "既有 PARTNER 保留原個別授權，不會因這次角色制度自動改寫。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "staff.view",
    "additionalPermissions": [
      "staff.manage"
    ],
    "feature": null,
    "kind": "explanation",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/staff/staff-account-editor.tsx",
      "src/components/admin/staff-role-control.tsx",
      "src/lib/permissions.ts",
      "src/lib/staff-role-policy.ts",
      "src/server/actions/staff.ts"
    ]
  },
  {
    "id": "O01",
    "category": "inventory",
    "title": "進銷存入口為什麼看不到？不同角色能做什麼？",
    "summary": "門市須先開通進銷存，帳號還要有查看權限；退貨／退款／作廢銷貨與更正／作廢收款分別授權。",
    "answer": "先核對進銷存開通及查看權限，再依工作確認銷貨、收貨、退貨／退款、收款更正、成本及管理等細項授權。",
    "path": "左側功能列 → 進銷存；人員管理 → 細項權限 → 進銷存",
    "keywords": "進銷存 看不到 未開通 Owner Manager Staff 權限 成本 銷貨 收款 收貨 進貨付款 商品管理 價格 退貨 退款 作廢銷貨 更正收款 作廢收款 inventory.refund inventory.payment.correct",
    "steps": [
      "確認目前門市及左側是否有「進銷存」；沒有時先由管理者核對功能開通狀態。",
      "到人員管理查看進銷存細項權限，分清「退貨、退款與作廢銷貨」及「更正或作廢收款紀錄」，兩者不能以一般銷貨／收款權限代替。",
      "儲存權限後讓當事人重新登入，再依實際工作測試入口與按鈕。"
    ],
    "important": "Manager 預設含退貨／退款／作廢銷貨與更正／作廢收款，Staff 預設不含；既有人員以實際已儲存權限為準，不會自動補授權。",
    "success": "帳號只看到已開通且已授權的分頁、金額與操作，直接網址不能繞過限制。",
    "details": [
      "Owner 在所屬門市的已開通功能內操作；Manager／Staff 均不預設成本、商品管理、進貨付款或價格管理，仍依個別授權。",
      "退貨、退款及作廢銷貨需 inventory.refund；更正付款方式及作廢收款紀錄另需 inventory.payment.correct。只查看進銷存不代表能執行這些操作。",
      "沒有成本權限時會隱藏平均成本、進貨金額、毛利及進貨財務資料；伺服器回傳也會移除受保護欄位。",
      "進銷存為單店資料，不會因切換模組或查看下層店而取得寫入權限。",
      "本次有實際退款或進行收款更正／作廢時，還需 cashbook.create 及現金收支功能開通，才能保存連動帳務。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.read",
    "feature": "inventory",
    "kind": "troubleshooting",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/page.tsx",
      "src/components/sidebar.tsx",
      "src/lib/permissions.ts",
      "src/server/services/inventory.ts",
      "src/server/services/inventory-settlement.ts"
    ]
  },
  {
    "id": "O02",
    "category": "inventory",
    "title": "如何建立商品、廠商與身分價格？",
    "summary": "先建立廠商與商品基本資料；身分價格用一般售價的比例設定，未設定時沿用一般售價。",
    "answer": "到廠商管理建立供應資料，再到商品與庫存建立商品、售價及最低庫存；需要時另設會員身分價格。",
    "path": "進銷存 → 廠商管理／商品與庫存",
    "keywords": "新增商品 廠商 品牌 規格 單位 售價 最低庫存 身分價格 比例 平均成本 使用中",
    "steps": [
      "在廠商管理新增名稱、窗口、電話與地址，核對使用中狀態。",
      "到商品與庫存新增商品名稱、品牌、規格、單位、一般售價與最低庫存；初始庫存／成本只在建立時依權限填寫。",
      "展開身分價格，設定各身分售價比例並核對換算金額；進階資料可補商品編號、條碼與內部備註。",
      "儲存後用搜尋與銷貨單核對商品、一般售價及身分價格。"
    ],
    "important": "商品建立後的庫存請用收貨或盤點調整；不要直接改商品資料來補庫存。",
    "success": "商品與廠商可被正確搜尋，售價、身分價格及使用中狀態符合設定。",
    "details": [
      "商品／廠商管理需 inventory.manage；設定身分價格另需 inventory.price.manage。",
      "0 元成本代表明確的贈品成本，未確認成本則會標示待確認，兩者不能混用。",
      "停用不刪歷史單據；舊單保留建立當時的品名、售價與成本快照。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.manage",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/lib/inventory.ts",
      "src/server/actions/inventory.ts",
      "src/server/services/inventory.ts"
    ]
  },
  {
    "id": "O03",
    "category": "inventory",
    "title": "到貨時如何先入庫，之後再補廠商與成本？",
    "summary": "收貨可先填品項與實收數量入庫；廠商與成本可後補，補成本不會再加一次庫存。",
    "answer": "用「登錄收貨」依本次實收數量入庫；分批到貨可續收，之後由有成本權限的人員補廠商與成本。",
    "path": "進銷存 → 進貨單 → 登錄收貨",
    "keywords": "登錄收貨 分批到貨 實收 入庫 待補廠商 待補成本 送貨單 負數更正 確認成本",
    "steps": [
      "點「登錄收貨」，選日期、搜尋商品，填訂購數量與本次實收；廠商及送貨單號可先留待補。",
      "核對只依本次實收增加庫存後確認入庫；分批到貨時從原收貨紀錄再填本次數量。",
      "需要更正已收數量時填負數並寫原因，且更正後庫存不得為負。",
      "由有成本與管理權限者開「補廠商與成本」，逐項填單位成本；確認後核對進貨單、平均成本與待確認標示。"
    ],
    "important": "補成本只補價值與歷史銷貨成本，不會再次增加庫存；0 是確認贈品成本，空白是尚未確認。",
    "success": "庫存只增加實收數量，分批紀錄與經手人可追查，補成本後平均成本及歷史成本正確。",
    "details": [
      "收貨需 inventory.receive；補廠商與成本需 inventory.manage 及成本權限。",
      "本次實收不可超過剩餘訂購量；負數更正要有原因，且不能造成負庫存。",
      "已涉及售出或成本確認後的正式退貨，不應用負數收貨取代另行退貨流程。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.receive",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/server/services/inventory-receiving.ts",
      "src/server/actions/inventory.ts"
    ]
  },
  {
    "id": "O04",
    "category": "inventory",
    "title": "如何建立銷貨單、折扣、贈品與寄送資料？",
    "summary": "先選顧客與身分價格，再加入商品、數量、折扣／贈品及交貨資料；儲存後才扣庫存。",
    "answer": "建立銷貨時選顧客、身分價格與商品，核對庫存、折扣／贈品、運費及本次收款後完成銷貨。",
    "path": "進銷存 → 銷貨單 → 新增銷貨",
    "keywords": "新增銷貨 顧客 身分價格 商品 數量 單價 折扣 贈品 自取 寄送 運費 未付款 庫存 編輯限制 退貨 退款 作廢 換貨 草稿 保留 放棄 重讀",
    "steps": [
      "點「新增銷貨」，用姓名或電話選顧客；找不到時依權限建立顧客，再選日期與身分價格。",
      "搜尋並加入商品，核對庫存、數量與自動帶入單價；有價格權限才可改單價、折扣或勾贈品。",
      "選自取或寄送；寄送需填管道、顧客運費及列印備註，內部備註不列印。",
      "填本次收款及方式，或選未付款；核對應收後完成銷貨，再回清單確認庫存、已收與尚欠。"
    ],
    "important": "銷貨即使未付款也會扣庫存；收款失敗或結果不明先查原單與現金帳，不要重建同一張單。",
    "success": "銷貨單、庫存、身分價格、折扣／贈品、運費與收款狀態一致。",
    "details": [
      "銷貨需 inventory.write；手動覆價、折扣與贈品另需 inventory.price.override。",
      "贈品售價為 0 但仍扣庫存並計成本；顧客運費不納入商品毛利。",
      "編輯既有銷貨單時顧客鎖定；已作廢或已有退貨／退款處理紀錄的銷貨不能再直接編輯。多人同時更新會要求重新開啟核對版本。",
      "換貨請先建立同一顧客的新銷貨單，再依 O09 從原單退貨時選「換貨關聯」；兩張單分別結清，不直接改掉原單。",
      "儲存失敗後若確認放棄草稿，系統會先重讀最新單據；取消放棄或重讀失敗會保留草稿。重新核對最新餘額後再操作，不要另建重複交易。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.write",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/lib/inventory.ts",
      "src/server/actions/inventory.ts",
      "src/server/services/inventory.ts",
      "src/app/(dashboard)/dashboard/inventory/settlement-form.tsx"
    ]
  },
  {
    "id": "O05",
    "category": "inventory",
    "title": "如何替顧客單筆或批次收款？現金帳會怎麼連動？",
    "summary": "可從銷貨單或收款單替同一顧客分次收款，也可勾多張未清單據一次分配。",
    "answer": "先選顧客與未付單據，逐張填本次金額再確認；成功後核對收款紀錄、各單餘額與現金帳連動。",
    "path": "進銷存 → 收款單／銷貨單 → 收款",
    "keywords": "收款單 分次收款 批次收款 多張單 現金 轉帳 尚欠 餘額 現金帳 重送 重複入帳 列印收款 付款方式填錯 更正付款 作廢收款 待退款",
    "steps": [
      "到收款單搜尋顧客、電話、商品或單號，選顧客後查看未付銷貨單。",
      "單筆收款可從原單進入；批次收款先在銷貨單依同一顧客勾選多張，再逐張填本次金額。",
      "選實際收款方式，核對本次總額與完成後各單尚欠，再送出一次。",
      "成功後查看收款紀錄、各單已收／尚欠及現金帳；需要時列印本次收款明細。"
    ],
    "important": "每張單不可超收；結果不明先查收款單與現金帳，不要重送。系統會用請求識別避免同一請求重複入帳。",
    "success": "每張單的已收與尚欠正確，現金／轉帳依方式連動一次，收款明細可追查。",
    "details": [
      "收款只處理顧客銷貨；廠商進貨付款使用進貨單流程。",
      "同批任一筆超收或失敗時整批回滾，不會只留下前幾張入帳。",
      "進銷存連動現金紀錄在現金帳為唯讀，不可獨立修改或刪除；付款方式填錯或重複登收款，依 O10 回銷貨單的「收付款紀錄」更正。",
      "更正付款方式保留收款金額與各單欠款；作廢收款紀錄會恢復欠款，兩者都不會退款給顧客，也不調整庫存。",
      "實際退貨、退款或作廢銷貨走 O09；「待退款」是店家尚需退還的款項，不要把它當成顧客尚欠再收一次。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.write",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/server/actions/inventory.ts",
      "src/server/services/inventory.ts",
      "src/app/(dashboard)/dashboard/cashbook/page.tsx",
      "src/app/(dashboard)/dashboard/inventory/settlement-form.tsx",
      "src/server/services/inventory-settlement.ts"
    ]
  },
  {
    "id": "O06",
    "category": "inventory",
    "title": "如何建立進貨與支付廠商款項？",
    "summary": "進貨成本與廠商付款受獨立權限保護；可先建未付款進貨，再分次或批次支付。",
    "answer": "由有商品／成本權限者建立進貨單；付款人員再選廠商與未付單據，逐張填金額並核對現金帳。",
    "path": "進銷存 → 進貨單 → 新增進貨／付款",
    "keywords": "新增進貨 廠商 進貨成本 未付款 分次付款 批次付款 進貨款 inventory.purchase.pay 現金帳",
    "steps": [
      "在進貨單選廠商與日期，加入商品、數量及進貨成本；沒有付款權限時先選未付款。",
      "完成進貨後核對庫存、平均成本、應付與已付；未付不會先記現金支出。",
      "支付時依同一廠商選一張或多張未付進貨單，逐張填本次金額與付款方式。",
      "送出後核對進貨單尚欠、付款紀錄與現金帳支出；結果不明先查原單，不要重送。"
    ],
    "important": "查看／建立進貨需要商品管理與成本權限；實際支付另需 inventory.purchase.pay，不能以看得到金額代替付款授權。",
    "success": "進貨數量與成本正確，付款只連動一次，各單尚欠及現金帳一致。",
    "details": [
      "進貨成本會更新移動平均；待補成本的收貨應先完成 O03 流程，不要重建進貨。",
      "批次付款任一筆超付會整批回滾；未付款進貨仍會影響庫存。",
      "Manager／Staff 預設不含商品管理、成本或進貨付款，需由 Owner 明確授權。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.manage",
    "additionalPermissions": [
      "inventory.cost.read",
      "inventory.purchase.pay"
    ],
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/server/actions/inventory.ts",
      "src/server/services/inventory.ts",
      "src/server/inventory-finance-access.ts"
    ]
  },
  {
    "id": "O07",
    "category": "inventory",
    "title": "如何盤點庫存並留下差異紀錄？",
    "summary": "輸入盤點原因與各商品實際數量；系統保存帳面、實際與差異並一次更新庫存。",
    "answer": "從商品與庫存開啟盤點，填實際數量與原因；送出前核對差異，完成後展開同頁「盤點紀錄」核對。",
    "path": "進銷存 → 商品與庫存 → 庫存盤點",
    "keywords": "庫存盤點 實際數量 帳面庫存 差異 原因 更正 衝突 操作紀錄",
    "steps": [
      "在商品與庫存點「庫存盤點」，填盤點原因，必要時搜尋縮小商品。",
      "只對已清點商品填實際數量，逐列核對帳面、實際與差異。",
      "確認後送出；若盤點期間庫存已異動，重新載入最新庫存再盤，不要覆蓋同事交易。",
      "完成後回商品與庫存，展開「盤點紀錄」，核對日期、記錄者、原因、儲存時間、帳面庫存、實際數量及差異。"
    ],
    "important": "盤點會直接把庫存改為實際數量，不能拿來補建遺漏的銷貨、收貨或退貨。",
    "success": "商品庫存等於盤點實數，差異、原因、日期與記錄者完整可追查。",
    "details": ["盤點會更新庫存數量，實際數量不可為負。", "同一請求重送不會重複調整；版本衝突會拒絕並要求重新核對。", "待確認成本會按盤點後剩餘庫存比例調整，盤點本身不會自動補成本。", "門市可查本店盤點紀錄。HQ 完整操作與登入紀錄僅供總部 ADMIN 查閱；其他門市角色即使有舊 audit.read 授權也不能開啟。獨立開通且有效的 OWNER 可另查本店白名單業務操作，見 I20，不含私人備註或安全紀錄。其他門市角色及母店查看子店不取得此權利。"],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.manage",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/server/actions/inventory.ts",
      "src/server/services/inventory.ts",
      "src/lib/permissions.ts",
      "src/components/operation-history-button.tsx",
      "src/server/actions/operation-audit.ts",
      "src/app/(dashboard)/dashboard/operation-audits/page.tsx"
    ]
  },
  {
    "id": "O08",
    "category": "inventory",
    "title": "如何查銷貨報表、篩選、匯出與列印？",
    "summary": "依日期及付款狀態查單；待退款與尚欠分開，銷貨報表按銷貨日與退貨處理日分列銷售、退貨及淨銷售。",
    "answer": "先在各分頁套用日期與更多篩選，再查看合計、單據明細或列印；匯出商品資料需同時具備匯出功能與權限。",
    "path": "進銷存 → 銷貨單／收款單／進貨單／商品與庫存／銷貨報表",
    "keywords": "進銷存報表 日期篩選 顧客 廠商 付款狀態 商品 品牌 經手人 交貨 收貨 毛利 Excel 匯出 列印 A4 待退款 跨月退貨 銷售金額 退貨金額 淨銷售金額 處理日期",
    "steps": [
      "選對分頁，輸入單號、姓名、電話或商品關鍵字，再設定日期與更多篩選；每頁 50 筆。",
      "具查看成本權限時，可在銷貨報表切每日或商品彙總，核對銷售金額、退貨金額與淨銷售金額；沒有此權限不會顯示該分頁。",
      "從原銷貨／收款明細列印顧客文件；列印前確認不含成本與內部備註。",
      "商品與庫存點「輸出 Excel」時，核對目前搜尋／品牌／狀態範圍及下載檔。"
    ],
    "important": "銷貨報表分頁另需 inventory.cost.read 查看成本權限；沒有時不顯示成本、進貨金額與毛利，但具收貨權限仍可使用進貨收貨流程。匯出另需 report.export 與資料匯出功能，不能用匯出繞過畫面權限。",
    "success": "清單、合計、列印與 Excel 範圍一致，顧客文件不含成本或內部備註。",
    "details": [
      "在銷貨單的收付款狀態選「待退款」，可找到淨已收大於應收的單據；這是店家尚需退款，不能向顧客再收該差額。",
      "報表銷售按原銷貨日，商品退貨按處理日；跨月退貨列在退貨月份。只補退錢的「處理待退款」不再增加商品退貨數量或退貨金額。",
      "顧客運費不列入商品銷售報表與毛利；贈品收入為 0、仍計成本。退貨只有勾選放回庫存才沖回對應商品成本，未回庫不會自動沖回成本。",
      "列印準備中請等待；逾時或無法開啟時重試，不要重複建立單據。",
      "成本被隱藏時，完整財務合計、匯出與現金結帳也會依保護規則限制，避免顯示不完整數字。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.read",
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/lib/inventory-print.ts",
      "src/app/api/inventory/export/route.ts",
      "src/server/inventory-finance-access.ts",
      "src/lib/inventory.ts",
      "src/lib/inventory-settlement.ts"
    ]
  },
  {
    "id": "O09",
    "category": "inventory",
    "title": "銷貨要退貨、延後退款或作廢，款項與庫存怎麼處理？",
    "summary": "退貨數量、放回庫存與實際退款分別核對；尚未退錢可先填 0，之後從待退款補處理。",
    "answer": "在原銷貨單的更多操作選「退貨／退款」或「作廢銷貨單」，依實際退貨、回庫及退款填寫，再核對處理後餘額。",
    "path": "進銷存 → 銷貨單 → 更多操作 → 退貨／退款／作廢銷貨單／處理待退款",
    "keywords": "退貨 退款 退費 延後退款 待退款 作廢銷貨 尚可退 本次退貨 放回庫存 退還運費 本次實際退款 填入全額退款 尚需退款 顧客尚欠 換貨 折扣 贈品 已結帳 inventory.refund",
    "steps": [
      "核對顧客與原單，在銷貨單的「更多操作」選「退貨／退款」；整張取消則選「作廢銷貨單」。工單請改走工單入口。",
      "核對尚可退數量、本次退貨及退還運費；只有可再次販售的商品才勾「放回庫存」。作廢必須處理全部剩餘商品與運費。",
      "「本次實際退款」填已實際退還的金額，尚未退錢填 0；核對可退上限、退款方式、處理日期與原因，再看「尚需退款／顧客尚欠／款項已結清」後確認。",
      "完成後從原單「收付款紀錄」核對退貨、回庫、退款、原因及餘額；如有待退款，之後用「待退款」篩選找到原單，再從更多操作選「處理待退款」。"
    ],
    "important": "作廢銷貨不表示款項已退清；系統只登記實際退款並連動現金帳，不會自動轉帳或退刷。不能把待退款當成欠款再收，也不能以作廢收款取代退款。",
    "success": "原單及每次處理紀錄保留，退貨與回庫數量、淨已收、尚欠或待退款及連動帳務一致。",
    "details": [
      "需「退貨、退款與作廢銷貨」權限（inventory.refund）；有實際退款時另需 cashbook.create 及現金收支功能開通。",
      "退款上限為淨已收扣除保留商品及剩餘運費後的可退額，不可超退；折扣依原單金額分攤，贈品退貨不會產生商品退款金額。",
      "「處理待退款」只補登實際退錢，退款金額須大於 0，不再退商品、退運費或增加庫存；已作廢且仍待退款的單據也可補處理。",
      "換貨先建立同一顧客的新銷貨單，再在原單退貨時展開「換貨關聯」選新單；可從紀錄互查，兩張單分別結清。",
      "處理日期不得早於原銷貨、最近收款或退貨紀錄，也不可晚於今天；處理日已結帳時，現金退款會被阻擋。請核對實際日期並由管理者依既有流程處理。",
      "已退貨／退款或作廢的原單不能直接編輯。送出失敗或結果不明時先核對原單；放棄草稿須先確認並重讀成功，取消放棄或重讀失敗會保留草稿。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.refund",
    "additionalPermissions": [
      "inventory.read"
    ],
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/page.tsx",
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/app/(dashboard)/dashboard/inventory/settlement-form.tsx",
      "src/lib/inventory-settlement.ts",
      "src/server/services/inventory-settlement.ts",
      "src/server/services/inventory.ts",
      "src/server/services/cash-day.ts"
    ]
  },
  {
    "id": "O10",
    "category": "inventory",
    "title": "付款方式填錯或重複登收款，怎麼更正？",
    "summary": "更正付款方式保留收款金額及欠款；作廢收款紀錄會恢復欠款，同批分配單據一起處理，庫存不變。",
    "answer": "開啟原銷貨單的收付款紀錄，從該筆收款的更多操作選「更正付款方式／作廢收款」，核對所有關聯單據後確認。",
    "path": "進銷存 → 銷貨單 → 收付款紀錄 → 該筆收款的更多操作 → 更正付款方式／作廢收款",
    "keywords": "付款方式填錯 更正付款方式 更正收款 重複記帳 重複入帳 作廢收款 恢復欠款 現金 轉帳 其他 多張單 沖回 替代收款 非退款 inventory.payment.correct",
    "steps": [
      "開啟原銷貨單的「收付款紀錄」，找到要處理的收款，從該列更多操作選「更正付款方式／作廢收款」。",
      "付款方式填錯時選「更正為現金／轉帳／其他」；重複登記則選「作廢收款紀錄（恢復欠款）」。先核對列出的全部分配單據。",
      "填處理日期及原因，核對更正後保留原收款金額、欠款不變，或作廢後各單恢復尚欠的金額，再按確認。",
      "回原單核對各單已收／尚欠、原收款的已更正／已作廢標示，以及沖回與替代收款紀錄；有現金帳查看權限時一併核對連動帳務。"
    ],
    "important": "這只修正收款紀錄，不會退款給顧客，也不改庫存；同一筆收款分配的全部單據會一起處理。實際退貨或退款請走 O09。",
    "success": "更正付款方式後收款總額與各單欠款不變；作廢收款後恢復對應欠款，原紀錄與沖回／替代紀錄可追查。",
    "details": [
      "需「更正或作廢收款紀錄」權限（inventory.payment.correct），另需 cashbook.create 及現金收支功能開通；一般銷貨／收款權限不能代替。",
      "更正付款方式會沖回原紀錄並建立同額、同分配的替代收款；作廢收款只沖回並恢復欠款。進銷存連動現金帳為唯讀，不可另行修改或刪除。",
      "已有更正的收款，或任一關聯銷貨屬工單、已作廢、已有退貨／退款處理紀錄時，不提供此入口；連動帳不完整或金額不符也會被拒絕，請回原單核對。",
      "處理日期不得早於原收款日或晚於今天；原收款或更正後方式涉及現金時，處理日已結帳會阻擋整筆更正。請核對實際日期並由管理者依既有流程處理。",
      "整筆更正成功才更新各單與連動帳；失敗或結果不明先核對原紀錄，不要再新增一筆收款補差。取消放棄或重讀失敗時會保留草稿。"
    ],
    "modules": [
      "steamfoot",
      "spa",
      "course"
    ],
    "permission": "inventory.payment.correct",
    "additionalPermissions": [
      "inventory.read"
    ],
    "feature": "inventory",
    "kind": "howto",
    "verification": "source-reviewed",
    "sources": [
      "src/app/(dashboard)/dashboard/inventory/page.tsx",
      "src/app/(dashboard)/dashboard/inventory/workspace.tsx",
      "src/app/(dashboard)/dashboard/inventory/settlement-form.tsx",
      "src/lib/inventory-settlement.ts",
      "src/server/services/inventory-settlement.ts",
      "src/server/services/inventory.ts",
      "src/server/services/cash-day.ts"
    ]
  }
];
