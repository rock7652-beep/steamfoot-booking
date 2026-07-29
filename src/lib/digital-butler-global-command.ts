export type DigitalButlerGlobalCommand =
  | "CANCEL"
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
    command: "CANCEL",
    phrases: ["停", "停止", "取消", "結束", "退出", "不用了"],
  },
  {
    command: "MAIN_MENU",
    phrases: ["回到主選單", "主選單", "回主選單"],
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
