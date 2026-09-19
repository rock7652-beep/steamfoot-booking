export function courseCashStatus(state: string, actual?: number | null, difference?: number | null) {
  if (state !== "CLOSED") return ({ EMPTY: "未開店・尚未啟用", NOT_OPEN: "未開店", PREVIOUS_OPEN: "前次尚未結帳", OPEN: "已開店" } as Record<string, string>)[state] ?? state;
  if (actual == null || difference == null) return "已結帳・尚未完成實點核對";
  if (difference === 0) return "已結帳・帳款相符";
  return `已結帳・${difference < 0 ? "短少" : "多出"} NT$${Math.abs(difference).toLocaleString("zh-TW")}`;
}
