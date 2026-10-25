/** Presentation only: never use the displayed value for an import or a write. */
export function musicNoteDisplay(value: string | null): string | null {
  if (!value) return value;
  return value.replace(/SOURCE_REPLICA\|YINJIAOYUN\|[^\r\n|]+\|STUDENT\|[a-zA-Z0-9_-]+/g, "音教雲匯入");
}

export function makeupStatus(state: string, expiry: string | null, today: string) {
  if (state === "ATTENDED") return { label: "已完成", tone: "bg-primary-50 text-primary-800" };
  if (state === "RESERVED") return { label: "已安排", tone: "bg-primary-50 text-primary-800" };
  if (expiry && expiry < today) return { label: "已逾期", tone: "bg-amber-50 text-amber-900" };
  return { label: "待安排", tone: "bg-amber-50 text-amber-900" };
}
