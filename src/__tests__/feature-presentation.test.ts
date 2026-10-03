import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureEntry, FeaturePresentationProvider } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";

describe("feature entry rendering", () => {
  it.each(["HIDDEN", "LOCKED", "ENABLED"] as const)("%s mounts only authorized content", state => {
    const child = vi.fn(() => h("div", null, "private editor"));
    const Child = child;
    const html = renderToStaticMarkup(h(FeaturePresentationProvider, {states:{[FEATURES.CUSTOMER_LABELS]:state}, children:h(FeatureEntry, {feature:FEATURES.CUSTOMER_LABELS,label:"顧客標籤",children:h(Child)})}));
    if(state === "ENABLED") {expect(child).toHaveBeenCalled();expect(html).toContain("private editor");}
    else {expect(child).not.toHaveBeenCalled();expect(html).not.toContain("private editor");}
    if(state === "HIDDEN") expect(html).toBe("");
    if(state === "LOCKED") {expect(html).toContain("顧客標籤");expect(html).toContain("未開通");}
  });
});
