const ANSWER_LABELS: Record<string, string> = {
  name: "姓名",
  service: "服務項目",
  "service-item": "服務項目",
  "service-type": "服務項目",
  "contact-time": "方便聯絡時間",
};

function answerLabel(key: string): string {
  return ANSWER_LABELS[key] ?? key;
}

function answerText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const option = value as Record<string, unknown>;
  if (typeof option.label === "string" && option.label.trim()) {
    return option.label.trim();
  }
  if (typeof option.value === "string" || typeof option.value === "number") {
    return String(option.value);
  }
  return null;
}

export function digitalButlerAnswerSummary(
  value: unknown,
  options: { isHumanSupportHandoff?: boolean } = {},
): string {
  if (options.isHumanSupportHandoff) {
    return "顧客希望轉接真人客服";
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";

  const answers = value as Record<string, unknown>;

  const entries = Object.entries(answers)
    .flatMap(([key, item]) => {
      const text = answerText(item);
      return text ? [`${answerLabel(key)}：${text}`] : [];
    })
    .slice(0, 4);

  return entries.length ? entries.join(" · ") : "—";
}
