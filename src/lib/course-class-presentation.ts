/** Class colours belong to the class, never to the current roster filter. */
export function courseClassPresentation(classType?: string | null, trial = false, rental = false) {
  if (rental) return { label: "空間租借", dot: "bg-pink-500" };
  if (trial) return { label: "體驗", dot: "bg-orange-500" };
  if (classType === "GROUP") return { label: "團體課", dot: "bg-emerald-600" };
  if (classType === "PRIVATE") return { label: "個別課", dot: "bg-blue-600" };
  if (classType === "SELF_ORGANIZED") return { label: "自組課", dot: "bg-yellow-600" };
  return { label: "課型待設定", dot: "bg-earth-400" };
}
