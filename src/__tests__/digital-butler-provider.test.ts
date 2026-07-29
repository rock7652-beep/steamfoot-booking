import { describe, expect, it } from "vitest";
import {
  DIGITAL_BUTLER_PROVIDER_FILTERS,
  providerLabel,
  providerNotificationLabel,
} from "@/lib/digital-butler-provider";

describe("Digital Butler provider display copy", () => {
  it("shows a Messenger lead with a Messenger badge", () => {
    expect(providerLabel("MESSENGER")).toBe("Messenger");
  });

  it("shows a LINE lead with a LINE badge", () => {
    expect(providerLabel("LINE")).toBe("LINE");
  });

  it("uses a safe fallback for unknown providers", () => {
    expect(providerLabel(null)).toBe("其他");
    expect(providerLabel("WHATSAPP")).toBe("其他");
    expect(providerNotificationLabel("WHATSAPP")).toBe("其他管道");
  });

  it("offers source filters that match the dashboard labels", () => {
    expect(DIGITAL_BUTLER_PROVIDER_FILTERS).toEqual([
      { value: "LINE", label: "LINE" },
      { value: "MESSENGER", label: "Messenger" },
      { value: "INSTAGRAM", label: "Instagram" },
      { value: "WEB", label: "官網" },
      { value: "OTHER", label: "其他" },
    ]);
  });
});
