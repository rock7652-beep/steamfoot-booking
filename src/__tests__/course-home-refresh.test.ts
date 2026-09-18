// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const refresh = vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({refresh}),usePathname:()=>'/dashboard'}));
import { HomeClockRefresh } from "@/app/(dashboard)/dashboard/courses/home-controls";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();refresh.mockClear();document.body.innerHTML='';});
it("refreshes once after class end without polling",async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T01:00:00Z'));vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(HomeClockRefresh,{nextAt:Date.now()+60000})));await act(async()=>vi.advanceTimersByTime(59999));expect(refresh).not.toHaveBeenCalled();await act(async()=>vi.advanceTimersByTime(251));expect(refresh).toHaveBeenCalledTimes(1);await act(async()=>vi.advanceTimersByTime(3600000));expect(refresh).toHaveBeenCalledTimes(1);await act(async()=>root.unmount());});
it("waits in background and refreshes on return",async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T01:00:00Z'));const state=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(HomeClockRefresh,{nextAt:Date.now()+10000})));await act(async()=>vi.advanceTimersByTime(20000));expect(refresh).not.toHaveBeenCalled();state.mockReturnValue('visible');await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(refresh).toHaveBeenCalledTimes(1);await act(async()=>window.dispatchEvent(new Event('focus')));expect(refresh).toHaveBeenCalledTimes(1);await act(async()=>root.unmount());});
