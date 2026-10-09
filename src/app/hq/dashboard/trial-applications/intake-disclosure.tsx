"use client";

import type { ComponentProps } from "react";

/** Native disclosure semantics, with Escape returning focus to its own summary. */
export function IntakeDisclosure(props: ComponentProps<"details">) {
  return <details {...props} onKeyDown={event => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Escape") return;
    const target = event.target as HTMLElement;
    // Let a native select consume Escape for its own popup first.
    if (target.tagName === "SELECT") return;
    const disclosure = target.closest("details[open]");
    if (disclosure !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    event.currentTarget.querySelector<HTMLElement>(":scope > summary")?.focus();
  }} />;
}
