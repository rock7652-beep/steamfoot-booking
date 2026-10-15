/** Display copy only; the transaction still decides whether a leave debits quota. */
export function courseLeaveDebitMessage(music: boolean, booking: {classType?:string|null;unit:string;cost:number}) {
  if (!music || booking.unit === "TRIAL") return null;
  if (booking.classType === "GROUP") return `團體課請假仍會扣 ${booking.cost} ${booking.unit === "SESSION" ? "堂" : "點"}，不提供補課。`;
  if (booking.classType === "PRIVATE" || booking.classType === "SELF_ORGANIZED") return "本次請假不扣堂，可於方案期限內安排補課。";
  return "請假扣堂依課型規則處理；課型未確認時，請先聯繫店家。";
}
