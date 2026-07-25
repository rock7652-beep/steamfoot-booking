import type { DigitalButlerStepType, Prisma } from "@prisma/client";

const RESERVED_TRIGGERS = [
  "綁定",
  "重新綁定",
  "查詢方案",
  "我的方案",
] as const;

const STEP_TYPES = new Set<DigitalButlerStepType>([
  "TEXT",
  "FLEX_OPENING",
  "FLEX_COMPLETION",
  "FREE_TEXT",
  "SINGLE_CHOICE",
  "TAIWAN_MOBILE",
  "CREATE_LEAD",
  "COMPLETE_FLOW",
]);

export type DigitalButlerDraftStep = {
  stepKey: string;
  type: DigitalButlerStepType;
  required?: boolean;
  config: Record<string, Prisma.JsonValue>;
};

export type DigitalButlerDraftDefinition = {
  trigger: { keywords: string[] };
  steps: DigitalButlerDraftStep[];
};

export class DigitalButlerDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigitalButlerDefinitionError";
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DigitalButlerDefinitionError("流程格式不正確");
  }
  return value as Record<string, unknown>;
}

export function parseDigitalButlerDraftDefinition(
  value: Prisma.JsonValue,
): DigitalButlerDraftDefinition {
  const root = objectValue(value);
  const trigger = objectValue(root.trigger);
  if (!Array.isArray(trigger.keywords)) {
    throw new DigitalButlerDefinitionError("請設定至少一個觸發詞");
  }
  const keywords = Array.from(
    new Set(
      trigger.keywords
        .filter((keyword): keyword is string => typeof keyword === "string")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
  if (keywords.length === 0 || keywords.length > 10) {
    throw new DigitalButlerDefinitionError("觸發詞需為 1–10 個");
  }
  if (keywords.some((keyword) => /^\d{6}$/.test(keyword) || RESERVED_TRIGGERS.includes(keyword as never))) {
    throw new DigitalButlerDefinitionError("觸發詞與系統保留指令衝突");
  }

  if (!Array.isArray(root.steps) || root.steps.length === 0 || root.steps.length > 30) {
    throw new DigitalButlerDefinitionError("流程需包含 1–30 個步驟");
  }

  const seen = new Set<string>();
  const steps = root.steps.map((raw, index) => {
    const step = objectValue(raw);
    const stepKey = typeof step.stepKey === "string" ? step.stepKey.trim() : "";
    const type = step.type as DigitalButlerStepType;
    const config = objectValue(step.config ?? {});
    if (!stepKey || seen.has(stepKey)) {
      throw new DigitalButlerDefinitionError(`第 ${index + 1} 步的識別碼無效或重複`);
    }
    if (!STEP_TYPES.has(type)) {
      throw new DigitalButlerDefinitionError(`第 ${index + 1} 步的題型不支援`);
    }
    if (type === "SINGLE_CHOICE") {
      const options = config.options;
      if (!Array.isArray(options) || options.length < 2) {
        throw new DigitalButlerDefinitionError("單選題至少需要兩個選項");
      }
      for (const option of options) {
        const parsed = objectValue(option);
        const label = typeof parsed.label === "string" ? parsed.label.trim() : "";
        const optionValue = typeof parsed.value === "string" ? parsed.value.trim() : label;
        if (!label || !optionValue) {
          throw new DigitalButlerDefinitionError(`第 ${index + 1} 步的選項格式不正確`);
        }
      }
    }
    if (["TEXT", "FREE_TEXT", "SINGLE_CHOICE", "TAIWAN_MOBILE"].includes(type)) {
      if (typeof config.text !== "string" || !config.text.trim()) {
        throw new DigitalButlerDefinitionError(`第 ${index + 1} 步缺少顯示文字`);
      }
    }
    seen.add(stepKey);
    return {
      stepKey,
      type,
      required: Boolean(step.required),
      config: config as Record<string, Prisma.JsonValue>,
    };
  });

  const stepKeys = new Set(steps.map((step) => step.stepKey));
  for (const [index, step] of steps.entries()) {
    const targets = [
      step.config.nextStepKey,
      ...(step.type === "SINGLE_CHOICE" && Array.isArray(step.config.options)
        ? step.config.options.map((option) => objectValue(option).nextStepKey)
        : []),
    ].filter((target): target is string => typeof target === "string" && Boolean(target.trim()));
    for (const target of targets) {
      if (!stepKeys.has(target.trim())) {
        throw new DigitalButlerDefinitionError(`第 ${index + 1} 步指定的下一步不存在`);
      }
      if (target.trim() === step.stepKey) {
        throw new DigitalButlerDefinitionError(`第 ${index + 1} 步不可跳回自己`);
      }
    }
  }

  if (steps.at(-1)?.type !== "COMPLETE_FLOW") {
    throw new DigitalButlerDefinitionError("流程最後一步必須為完成流程");
  }
  if (steps.filter((step) => step.type === "COMPLETE_FLOW").length !== 1) {
    throw new DigitalButlerDefinitionError("流程只能有一個完成步驟");
  }

  return { trigger: { keywords }, steps };
}
