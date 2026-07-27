ALTER TABLE "SessionBalanceNotification"
ADD COLUMN "responseAction" TEXT,
ADD COLUMN "responseAt" TIMESTAMP(3),
ADD COLUMN "managerNotificationStatus" "MessageLogStatus",
ADD COLUMN "managerNotificationError" TEXT,
ADD COLUMN "managerNotifiedAt" TIMESTAMP(3);

CREATE INDEX "SessionBalanceNotification_storeId_responseAction_responseAt_idx"
ON "SessionBalanceNotification"("storeId", "responseAction", "responseAt");

ALTER TABLE "SessionBalanceNotification" ENABLE ROW LEVEL SECURITY;

UPDATE "SessionBalanceNotificationSetting"
SET
  "planUsedUpTemplate" = '{customerName} 您好，您的「{planName}」方案已使用完畢，謝謝您一直以來的支持 😊

舊客續購可享「蒸足 VIP 方案」，享有更優惠的續購選擇。

想了解的話，點擊下方按鈕，我們會立即通知店長，由店長親自為您說明方案內容。',
  "learnMoreButtonLabel" = '了解蒸足 VIP 方案'
WHERE
  "planUsedUpTemplate" = '{customerName} 您好，謝謝您完成這一期的「{planName}」蒸足保養 🤎

如果覺得這段時間對身體有幫助，歡迎再依照自己的狀態，安排下一階段的保養頻率。

還不確定也沒關係，我們可以先陪您了解目前的需求，再決定是否繼續。'
  AND "learnMoreButtonLabel" = '了解適合我的方案';
