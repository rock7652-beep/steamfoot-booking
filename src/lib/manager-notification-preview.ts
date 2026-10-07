import { managerNotificationPresentation } from "./manager-notification-card";

/** Fictional samples only; never queries customers or sends notifications. */
export function managerNotificationPreviewSamples(course = false) {
  const link = (label: string) => `${label}：https://example.com/s/demo/admin/dashboard`;
  const sample = (key: string, label: string, body: string) => ({ key, label, ...managerNotificationPresentation(body) });
  return [
    sample("sameDay", "當日新預約", course
      ? `今日新增課程預約\n示範門市\n示範日期 14:00 瑜珈課\n上課者：示範學員\n預約人：示範學員\n${link("查看課程")}`
      : `🔔 今日新增預約\n示範門市\n顧客：示範顧客\n日期：示範日期\n時間：14:00\n人數：1 位\n${link("查看預約")}`),
    ...(!course ? [
      sample("trial", "新體驗預約", `🎉 新體驗預約\n姓名：示範顧客\n電話：示範電話\n日期：示範日期\n時間：14:00\n人數：2 位\n應收：NT$600\n來源：官網公開預約\n${link("查看預約")}`),
      sample("vip", "VIP 續購需求", `【蒸足 VIP 續購需求】\n分店：示範門市\n顧客：示範顧客\n電話：示範電話\n原方案：示範方案\n顧客已點選「了解蒸足 VIP 方案」，請主動聯絡並說明續購優惠。\nhttps://example.com/dashboard/customers/demo`),
    ] : []),
    sample("lead", "數位管家新名單", `🙋 新詢問\n姓名：示範顧客\n電話：示範電話\n需求：了解服務\n來源：LINE\n店別：示範門市\n目前進度：已留下聯絡資料\n${link("查看名單")}`),
    sample("support", "要求真人客服", `🙋 顧客要求真人客服\n來源：LINE\n狀態：等待門市夥伴接手\n${link("前往後台接手")}`),
    sample("supportFinal", "真人客服催辦", `⚠️ 真人客服仍未接手\n已等待超過 30 分鐘。\n這是最後一次即時提醒，後續會保留在今日待辦。\n${link("前往後台接手")}`),
    sample("payment", "待確認付款", course
      ? `課程方案待確認付款\n示範門市\n顧客：示範學員\n方案：示範課程方案\n應付金額：NT$2400\n請至後台核對入帳後再確認發卡。\n${link("查看待核帳訂單")}`
      : `💰 等待確認入帳\n姓名：示範顧客\n方案：示範方案\n金額：NT$2,400\n後四碼：1234\n${link("前往後台確認")}`),
    sample("incomplete", course ? "出席待處理" : "服務未完成", `${course ? "🔔 課程出席尚未處理" : "🔔 服務尚未完成"}\n顧客：示範顧客\n預約日期：示範日期\n預約時間：14:00\n狀態：${course ? "課程結束一小時後仍待處理出席，包含已報到者" : "服務時段結束後仍未完成"}\n${link("前往後台處理")}`),
    sample("digest", "每日待辦摘要", `☀️ 今日待辦\n💰 待確認付款：2 筆\n🔔 ${course ? "昨日待處理出席：3 人次" : "昨日未完成服務：3 筆"}\n🙋 尚未接手客服：1 位\n共 6 件待處理\n${link("前往接手客服")}`),
  ];
}
