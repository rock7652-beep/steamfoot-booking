export type DigitalButlerGlobalCommand =
  | "CANCEL"
  | "RESTART"
  | "MAIN_MENU"
  | "HANDOFF";

const COMMANDS: ReadonlyArray<{
  command: DigitalButlerGlobalCommand;
  phrases: readonly string[];
}> = [
  {
    command: "HANDOFF",
    phrases: ["轉接客服", "真人客服", "轉真人", "找客服"],
  },
  {
    command: "RESTART",
    phrases: ["重新開始", "重來", "從頭開始"],
  },
  {
    command: "MAIN_MENU",
    phrases: ["主選單", "回首頁", "回主選單"],
  },
  {
    command: "CANCEL",
    phrases: ["停", "停止", "取消", "結束", "退出", "不用了"],
  },
];

function normalizeGlobalCommandText(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/[！!。．,.，？?～~]+$/g, "")
    .replace(/\s+/g, "");
}

/**
 * Exact-match classifier for commands that must take priority over the current
 * Digital Butler field validator. Keeping this deterministic prevents normal
 * answers containing words such as "取消" from accidentally terminating a flow.
 */
export function classifyDigitalButlerGlobalCommand(
  text: string,
): DigitalButlerGlobalCommand | null {
  const normalized = normalizeGlobalCommandText(text);
  if (!normalized) return null;

  for (const item of COMMANDS) {
    if (item.phrases.includes(normalized)) return item.command;
  }
  return null;
}
