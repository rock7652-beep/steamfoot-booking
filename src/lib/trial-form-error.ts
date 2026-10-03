/** Reveal all enclosing disclosure panels before focusing an invalid field. */
export function focusTrialFormError(form: HTMLFormElement, key: string) {
  const fallback = key.endsWith("Notes")
    ? key.replace(/Notes$/, "Progress")
    : key;
  const target =
    form.elements.namedItem(key) ?? form.elements.namedItem(fallback);
  if (
    !target ||
    !("focus" in target) ||
    typeof target.focus !== "function" ||
    !("closest" in target)
  )
    return;
  let panel = target.closest("details");
  while (panel) {
    panel.open = true;
    panel = panel.parentElement?.closest("details") ?? null;
  }
  target.scrollIntoView({ block: "center", behavior: "auto" });
  target.focus({ preventScroll: true });
}
