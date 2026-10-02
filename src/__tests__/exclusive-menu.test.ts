// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it} from "vitest";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
it("opens one portal menu at a time and dismisses with Escape or outside click",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  const firstMenu={label:"第一堂",children:"第一堂操作"};
  const secondMenu={label:"第二堂",children:"第二堂操作"};
  await act(async()=>root.render(createElement("div",null,createElement(ExclusiveMenu,firstMenu),createElement(ExclusiveMenu,secondMenu))));
  const buttons=host.querySelectorAll("button");
  await act(async()=>buttons[0].click());expect(buttons[0].getAttribute("aria-expanded")).toBe("true");
  await act(async()=>buttons[1].click());expect(buttons[0].getAttribute("aria-expanded")).toBe("false");expect(buttons[1].getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).not.toContain("第二堂操作");expect(document.body.textContent).toContain("第二堂操作");
  await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));expect(buttons[1].getAttribute("aria-expanded")).toBe("false");
  await act(async()=>buttons[0].click());await act(async()=>document.body.dispatchEvent(new Event("pointerdown",{bubbles:true})));expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
 }finally{await act(async()=>root.unmount());host.remove();}
});
