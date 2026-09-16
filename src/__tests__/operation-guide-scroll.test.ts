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
