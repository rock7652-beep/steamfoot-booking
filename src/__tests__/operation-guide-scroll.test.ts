// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { lockGuideBackground } from "../lib/operation-guide-scroll";
let release: (() => void) | undefined;
afterEach(() => { release?.(); release = undefined; document.body.innerHTML = ""; document.body.removeAttribute("style"); vi.unstubAllGlobals(); });
function touch(target: EventTarget, type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [{clientY:y}] });
  target.dispatchEvent(event);
  return event;
}
describe("mobile guide scroll isolation", () => {
  it("keeps the panel above the keyboard during resize and Safari viewport panning, then restores it", () => {
    vi.stubGlobal("scrollTo", vi.fn());
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const panel = document.createElement("dialog");
    document.body.append(panel);
    release = lockGuideBackground(panel);
    const expectVisible = () => {
      const top = parseFloat(panel.style.top);
      const height = parseFloat(panel.style.height);
      expect(top).toBeGreaterThanOrEqual(viewport.offsetTop);
      expect(top + height).toBeLessThanOrEqual(viewport.offsetTop + viewport.height);
      expect(panel.style.bottom).toBe("auto");
      expect(panel.style.maxHeight).toBe(panel.style.height);
    };
    expectVisible();
    expect(panel.style.height).toBe("680px");
    viewport.height = 360;
    viewport.dispatchEvent(new Event("resize"));
    expectVisible();
    expect(panel.style.height).toBe("306px");
    viewport.offsetTop = 48;
    viewport.dispatchEvent(new Event("scroll"));
    expectVisible();
    expect(panel.style.top).toBe("102px");
    viewport.height = 800; viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    expectVisible();
    expect(panel.style.top).toBe("120px");
    release(); release = undefined;
    expect(panel.style.cssText).toBe("");
    viewport.height = 300;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(panel.style.cssText).toBe("");
  });

  it("falls back to the window size and restores panel styles when returning to desktop", () => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 700);
    const panel = document.createElement("dialog");
    panel.style.cssText = "top: 56px; bottom: 0px; height: 500px; max-height: none !important";
    const original = panel.style.cssText;
    release = lockGuideBackground(panel);
    expect(panel.style.top).toBe("105px");
    expect(panel.style.height).toBe("595px");
    vi.stubGlobal("innerHeight", 400);
    window.dispatchEvent(new Event("resize"));
    expect(parseFloat(panel.style.top) + parseFloat(panel.style.height)).toBe(400);
    release(); release = undefined;
    expect(panel.style.cssText).toBe(original);
  });

  it("locks the background at its original position, contains gestures and restores existing locks", () => {
    vi.stubGlobal("scrollY", 420); vi.stubGlobal("scrollTo", vi.fn());
    document.body.style.overflow = "hidden"; // underlying booking sheet owns this
    const panel = document.createElement("dialog");
    panel.innerHTML = '<div data-guide-scroll><p>Long article</p></div>';
    document.body.append(panel);
    const scroll = panel.firstElementChild as HTMLElement;
    Object.defineProperties(scroll, { clientHeight: { value: 300 }, scrollHeight: { value: 900 } });
    release = lockGuideBackground(panel);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-420px");
    touch(document.body,"touchstart",100);
    expect(touch(document.body,"touchmove",50).defaultPrevented).toBe(true);
    scroll.scrollTop = 100;
    touch(scroll,"touchstart",100);
    expect(touch(scroll,"touchmove",50).defaultPrevented).toBe(false);
    scroll.scrollTop = 600;
    touch(scroll,"touchstart",100);
    expect(touch(scroll,"touchmove",50).defaultPrevented).toBe(true);
    scroll.scrollTop = 0;
    touch(scroll,"touchstart",50);
    expect(touch(scroll,"touchmove",100).defaultPrevented).toBe(true);
    release(); release = undefined;
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("hidden");
    expect(window.scrollTo).toHaveBeenCalledWith({left:0,top:420,behavior:"instant"});
    expect(touch(document.body,"touchmove",50).defaultPrevented).toBe(false);
  });
});
