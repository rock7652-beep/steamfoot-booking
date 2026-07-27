export type PublishedDigitalButlerStep = {
  stepKey: string;
  position: number;
  type: string;
  config: unknown;
};

export type PublishedDigitalButlerView = {
  id: string;
  version: number;
  publishedAt: Date | string | null;
  steps: PublishedDigitalButlerStep[];
};

type MenuOption = { label: string; value: string; nextStepKey: string | null };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function publishedMenuOptions(steps: PublishedDigitalButlerStep[]): MenuOption[] {
  const menu = steps.find((step) => step.stepKey === "想了解的內容");
  const config = objectValue(menu?.config);
  if (!config || !Array.isArray(config.options)) return [];
  return config.options.flatMap((option) => {
    const parsed = objectValue(option);
    if (!parsed) return [];
    const label = typeof parsed.label === "string" ? parsed.label : null;
    if (!label) return [];
    return [{
      label,
      value: typeof parsed.value === "string" ? parsed.value : label,
      nextStepKey: typeof parsed.nextStepKey === "string" ? parsed.nextStepKey : null,
    }];
  });
}

export function publishedOpeningText(steps: PublishedDigitalButlerStep[]): string | null {
  const opening = steps.find((step) => step.stepKey === "opening");
  const config = objectValue(opening?.config);
  return typeof config?.text === "string" ? config.text : null;
}

export function isDigitalButlerDraftDirty(input: {
  name: string;
  persistedName: string;
  definition: string;
  persistedDefinition: string;
}): boolean {
  return input.name !== input.persistedName || input.definition !== input.persistedDefinition;
}
