"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SessionContext } from "next-auth/react";
import { customerResumePath, liffMemberResumeHref } from "@/lib/customer-resume-path";
import { getIDToken, initLiff, isInLineClient } from "@/lib/liff/client";
import { publicTrialPrimaryIntent } from "@/lib/liff/public-trial-intent";
import { LIFF_MEMBER_SESSION_EXPIRED } from "@/lib/liff/session-events";
import { currentVerifiedLiffCustomer, hasVerifiedLiffTokenChanged, refreshLiffSession } from "@/lib/liff/session-refresh";

const IDLE_MS = 15 * 60_000;
const VERIFY_TIMEOUT_MS = 12_000;

type Props = { storeSlug: string; children?: ReactNode } & (
  | { channel: "web"; userId: string }
  | { channel: "line"; liffId: string }
);
type Status = "ready" | "checking" | "expired" | "unavailable" | "onboarding" | "review" | "checkout_login";

export function CustomerSessionResume(props: Props) {
  const pathname = usePathname();
  return <SessionResumeContent key={pathname} {...props} />;
}

function SessionResumeContent(props: Props) {
  const { children, storeSlug, channel } = props;
  const liffId = props.channel === "line" ? props.liffId : undefined;
  const userId = props.channel === "web" ? props.userId : undefined;
  const [status, setStatus] = useState<Status>("ready");
  const [retry, setRetry] = useState(0);
  const [referenceId, setReferenceId] = useState<string>();
  const browserSession = useContext(SessionContext);
  const currentBrowserUserId = browserSession?.data?.user?.id;
  const changedBrowserUser = Boolean(userId && currentBrowserUserId && currentBrowserUserId !== userId);

  useEffect(() => {
    if (!changedBrowserUser) return;
    const { pathname, search, hash } = window.location;
    const target = customerResumePath(pathname + search + hash, storeSlug, "web");
    if (target) window.location.replace(target);
  }, [changedBrowserUser, storeSlug]);

  useEffect(() => {
    const location = window.location;
    const path = () => location.pathname + location.search + location.hash;
    const initial = customerResumePath(path(), storeSlug, channel);
    if (!initial) return;
    if (channel === "line" && location.pathname.replace(/\/$/, "") === `/s/${storeSlug}/liff`) {
      const state = new URLSearchParams(location.search).get("liff.state") ?? undefined;
      if (publicTrialPrimaryIntent(state).kind !== "member") return;
    }

    let active = true;
    let checking = false;
    let blocked = false;
    let lastActivity = Date.now();
    let deadline: number | undefined;
    const controller = new AbortController();

    async function verify() {
      if (!active || checking || document.hidden) return;
      checking = true;
      blocked = true;
      setStatus("checking");
      deadline = window.setTimeout(() => {
        controller.abort();
        if (active) setStatus("unavailable");
      }, VERIFY_TIMEOUT_MS);
      try {
        if (liffId) {
          // Plan checkout also supports an ordinary browser session.
          const checkout = location.pathname.includes("/liff/wallets/shop/");
          const sdk = await initLiff(liffId).catch((error: unknown) => {
            if (!checkout) throw error;
            return null;
          });
          if (!active || controller.signal.aborted) return;
          if (isInLineClient() || sdk?.isLoggedIn()) {
            const before = currentVerifiedLiffCustomer(storeSlug);
            const result = await refreshLiffSession({ idToken: getIDToken() ?? "", storeSlug }, undefined, controller.signal);
            if (!active || controller.signal.aborted) return;
            if (result.status === "identity_review_required") {
              setReferenceId(result.referenceId);
              setStatus("review");
              return;
            }
            if (result.status !== "session_created") {
              setStatus(result.status === "service_unavailable" ? "unavailable" : result.status === "need_onboarding" ? "onboarding" : "expired");
              return;
            }
            if (!before || before !== currentVerifiedLiffCustomer(storeSlug)) {
              location.replace(path());
              return;
            }
          } else if (!checkout) {
            setStatus("expired");
            return;
          } else {
            await checkWebSession(true);
            return;
          }
        } else if (!(await checkWebSession())) {
          return;
        }

        if (!active) return;
        lastActivity = Date.now();
        blocked = false;
        setStatus("ready");
      } catch {
        if (active) setStatus("unavailable");
      } finally {
        window.clearTimeout(deadline);
        checking = false;
      }
    }

    async function checkWebSession(checkout = false) {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
      if (!response.ok && response.status !== 401) throw new Error("Session lookup failed");
      const session = response.ok ? await response.json() : null;
      if (!active) return false;
      if (session?.user?.role !== "CUSTOMER" || !session.user.id) {
        setStatus(checkout ? "checkout_login" : "expired");
        return false;
      }
      if (!userId || session.user.id !== userId) {
        location.replace(path());
        return false;
      }
      return true;
    }

    function onLiffExpired(event: Event) {
      const expiredStore = (event as CustomEvent<string | undefined>).detail;
      if (!blocked && (!expiredStore || expiredStore === storeSlug)) {
        blocked = true;
        setStatus("expired");
      }
    }
    function checkIdle() {
      if (!document.hidden && !blocked && Date.now() - lastActivity >= IDLE_MS) void verify();
    }
    function onResume() {
      checkIdle();
      if (!document.hidden && !blocked && liffId && isInLineClient() &&
          hasVerifiedLiffTokenChanged(storeSlug, getIDToken())) void verify();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted && !controller.signal.aborted) void verify();
    }
    function onScroll() {
      checkIdle();
      if (!document.hidden && !blocked) lastActivity = Date.now();
    }
    function onInteraction(event: Event) {
      checkIdle();
      if (blocked) {
        if (event instanceof KeyboardEvent && event.key === "Tab") return;
        if (!(event.target instanceof Element) || !event.target.closest("[data-customer-resume-controls]")) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      lastActivity = Date.now();
    }

    if (retry) void verify();
    if (liffId) window.addEventListener(LIFF_MEMBER_SESSION_EXPIRED, onLiffExpired);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    for (const name of ["pointerdown", "click", "keydown"]) window.addEventListener(name, onInteraction, true);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(deadline);
      window.removeEventListener(LIFF_MEMBER_SESSION_EXPIRED, onLiffExpired);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("scroll", onScroll, true);
      for (const name of ["pointerdown", "click", "keydown"]) window.removeEventListener(name, onInteraction, true);
    };
  }, [channel, liffId, retry, storeSlug, userId]);

  const currentPath = typeof window === "undefined" ? "" : window.location.pathname + window.location.search + window.location.hash;
  const webReturn = customerResumePath(currentPath, storeSlug, "web");
  const lineReturn = customerResumePath(currentPath, storeSlug, "line");
  const reopen = liffId ? liffMemberResumeHref(liffId, storeSlug, currentPath) : null;
  const login = `/s/${storeSlug}/${webReturn ? `?returnTo=${encodeURIComponent(webReturn)}` : ""}`;
  const displayStatus = changedBrowserUser ? "checking" : status;
  const actionClass = "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white";

  return (
    <>
      <div className={displayStatus === "ready" ? "contents" : "hidden"} hidden={displayStatus !== "ready"} inert={displayStatus !== "ready"}>{children}</div>
      {displayStatus !== "ready" && (
        <section data-customer-resume-controls className="fixed inset-0 z-[1000] overflow-y-auto bg-earth-50 px-4 py-12">
          <div className="mx-auto grid w-full max-w-md gap-3 rounded-xl border border-earth-200 bg-white p-5 text-center text-earth-900">
            {displayStatus === "checking" && <p role="status">正在確認會員身分…</p>}
            {displayStatus === "expired" && <>
              <p role="status">請{reopen ? "重新開啟會員中心" : "重新登入"}，繼續使用會員服務。</p>
              <a className={actionClass} href={reopen ?? login}>
                {reopen ? "用 LINE 重新開啟" : "重新登入"}
              </a>
            </>}
            {displayStatus === "checkout_login" && lineReturn && <>
              <p role="status">請重新登入以繼續購買。</p>
              <a className={actionClass} href={lineReturn}>重新登入</a>
            </>}
            {displayStatus === "unavailable" && <>
              <p role="status">暫時無法確認會員身分，請再試一次。</p>
              <button className={actionClass} type="button" onClick={() => setRetry((count) => count + 1)}>再試一次</button>
            </>}
            {displayStatus === "onboarding" && <>
              <p role="status">請先完成目前 LINE 帳號的會員驗證。</p>
              <a className={actionClass} href={`/s/${storeSlug}/liff/onboarding`}>驗證會員身分</a>
            </>}
            {displayStatus === "review" && <p role="status">請聯繫店家確認會員身分。{referenceId && ` 查核編號：${referenceId}`}</p>}
          </div>
        </section>
      )}
    </>
  );
}
