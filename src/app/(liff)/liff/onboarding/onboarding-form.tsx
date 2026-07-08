"use client";

/**
 * LIFF onboarding form (PR-C2)
 *
 * 流程 (plan §1.1 + §3.4)：
 *   1. mount → initLiff(liffId) + getIDToken() + getProfile().displayName (預填姓名)
 *   2. 顯示姓名 / 手機表單（兩欄都有值才能 submit；plan §3.5）
 *   3. submit → submitOnboarding(...) (server action)
 *      - ok → signIn("liff-token", { idToken, storeSlug, redirect: false })
 *             → router.replace(`/s/{slug}/liff`) → LiffShell 重跑 → signed_in
 *      - invalid_phone → inline form error
 *      - bound_other / phone_taken_by_login_account / ambiguous → 阻擋 + 聯繫店家
 *      - expired → 阻擋 + 重新整理
 *      - service_unavailable → 阻擋 + 重新整理 + 聯繫店家
 *
 * 不做：不直接呼 /api/liff/exchange / helper / refrral / password
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  initLiff,
  isInLineClient,
  getIDToken,
  getProfile,
  LiffInitError,
} from "@/lib/liff/client";
import { liffMessages } from "@/lib/liff/messages";
import {
  submitOnboarding,
  type OnboardingActionResult,
} from "./actions";

type FormState =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | { kind: "ready"; idToken: string; defaultName: string; pictureUrl: string | null }
  | { kind: "submitting"; idToken: string; defaultName: string; pictureUrl: string | null }
  | {
      kind: "blocked";
      idToken: string;
      defaultName: string;
      pictureUrl: string | null;
      message: string;
      primaryCta: "reload" | null;
      contactStore: boolean;
    }
  | { kind: "completing" };

interface OnboardingFormProps {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結（server resolveStorePresentation 注入）。 */
  contactUrl: string;
}

export function OnboardingForm({ storeSlug, storeName, liffId, contactUrl }: OnboardingFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ kind: "initializing" });
  const [nameValue, setNameValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // ── 1. mount: init LIFF + 取 idToken + profile ─────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initLiff(liffId);
        if (cancelled) return;
        if (!isInLineClient()) {
          setState({ kind: "not_in_line_app" });
          return;
        }
        const idToken = getIDToken();
        if (!idToken) {
          setState({ kind: "expired" });
          return;
        }
        let defaultName = "";
        let pictureUrl: string | null = null;
        try {
          const profile = await getProfile();
          defaultName = profile.displayName ?? "";
          pictureUrl = profile.pictureUrl ?? null;
        } catch {
          // best-effort，失敗就空著讓使用者輸入
        }
        if (cancelled) return;
        setNameValue(defaultName);
        setState({ kind: "ready", idToken, defaultName, pictureUrl });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LiffInitError) {
          // init 失敗一律歸 service_unavailable（顧客面不需區分）
          console.warn("[onboarding-form] liff.init failed", err.message);
        } else {
          console.warn("[onboarding-form] liff.init unexpected error", err);
        }
        setState({ kind: "service_unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  // ── 2. submit ──────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    if (state.kind !== "ready" && state.kind !== "blocked") return;

    const name = nameValue.trim();
    const phone = phoneValue.trim();

    if (!name) {
      setFieldError(liffMessages.error.missingName);
      return;
    }
    if (!phone) {
      setFieldError(liffMessages.error.missingPhone);
      return;
    }

    const idToken = state.idToken;
    const defaultName = state.defaultName;
    const pictureUrl = state.pictureUrl;
    setState({ kind: "submitting", idToken, defaultName, pictureUrl });

    let result: OnboardingActionResult;
    try {
      result = await submitOnboarding({ idToken, storeSlug, name, phone });
    } catch (err) {
      console.error("[onboarding-form] action throw", err);
      setState({ kind: "service_unavailable" });
      return;
    }

    switch (result.status) {
      case "ok": {
        setState({ kind: "completing" });
        try {
          const signInResult = await signIn("liff-token", {
            idToken,
            storeSlug,
            redirect: false,
          });
          if (signInResult?.error) {
            console.warn("[onboarding-form] signIn returned error", signInResult.error);
            // Customer 已建好，cookie 可能沒寫；router.replace 回 LiffShell 自然 retry
          }
        } catch (err) {
          console.warn("[onboarding-form] signIn throw", err);
        }
        router.replace(`/s/${storeSlug}/liff`);
        return;
      }

      case "invalid_phone":
        setFieldError(liffMessages.error.invalidPhone);
        setState({ kind: "ready", idToken, defaultName, pictureUrl });
        return;

      case "bound_other":
      case "phone_taken_by_login_account":
      case "not_found":
        setState({
          kind: "blocked",
          idToken,
          defaultName,
          pictureUrl,
          message: liffMessages.error.boundOther,
          primaryCta: null,
          contactStore: true,
        });
        return;

      case "ambiguous":
        setState({
          kind: "blocked",
          idToken,
          defaultName,
          pictureUrl,
          message: liffMessages.error.ambiguous,
          primaryCta: null,
          contactStore: true,
        });
        return;

      case "expired":
        setState({ kind: "expired" });
        return;

      case "service_unavailable":
        setState({ kind: "service_unavailable" });
        return;
    }
  }

  // ── 3. Render ──────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">{storeName}</p>
        <h1 className="mt-2 text-2xl font-semibold text-earth-900">
          {liffMessages.onboarding.title}
        </h1>
        <p className="mt-2 text-sm text-earth-600">{liffMessages.onboarding.body}</p>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.onboarding.initializing} />
      )}

      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          showContactStore
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          showRetry
          showContactStore
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "completing" && (
        <CompletingBlock />
      )}

      {(state.kind === "ready" ||
        state.kind === "submitting" ||
        state.kind === "blocked") && (
        <>
          {state.kind === "blocked" && (
            <InfoBlock
              tone="red"
              body={state.message}
              showContactStore={state.contactStore}
              showRetry={state.primaryCta === "reload"}
              contactUrl={contactUrl}
            />
          )}

          {state.pictureUrl && (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.pictureUrl}
                alt=""
                className="h-16 w-16 rounded-full border border-earth-200 object-cover"
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-earth-700">
                {liffMessages.onboarding.nameLabel}
              </span>
              <input
                name="name"
                type="text"
                required
                maxLength={50}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder={liffMessages.onboarding.namePlaceholder}
                disabled={state.kind === "submitting"}
                className="rounded-lg border border-earth-300 px-3 py-2.5 text-base text-earth-900 focus:border-earth-500 focus:outline-none focus:ring-1 focus:ring-earth-500 disabled:bg-earth-50"
                autoComplete="name"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-earth-700">
                {liffMessages.onboarding.phoneLabel}
              </span>
              <input
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder={liffMessages.onboarding.phonePlaceholder}
                disabled={state.kind === "submitting"}
                className="rounded-lg border border-earth-300 px-3 py-2.5 text-base text-earth-900 focus:border-earth-500 focus:outline-none focus:ring-1 focus:ring-earth-500 disabled:bg-earth-50"
              />
              <span className="text-[11px] text-earth-500">
                {liffMessages.onboarding.phoneHelp}
              </span>
            </label>

            {fieldError && (
              <p className="text-xs text-red-700" role="alert">
                {fieldError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                state.kind === "submitting" ||
                !nameValue.trim() ||
                !phoneValue.trim()
              }
              className="mt-2 rounded-xl bg-earth-800 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98] disabled:opacity-60"
            >
              {state.kind === "submitting"
                ? liffMessages.onboarding.submitting
                : liffMessages.onboarding.submit}
            </button>

            <p className="text-center text-[11px] text-earth-500">
              {liffMessages.onboarding.privacyNote}
            </p>
          </form>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function Loading({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
        aria-hidden
      />
      <p className="text-sm text-earth-600">{text}</p>
    </div>
  );
}

function CompletingBlock() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-green-300 border-t-green-700"
        aria-hidden
      />
      <p className="text-sm font-medium text-green-900">
        {liffMessages.onboarding.successTitle}
      </p>
      <p className="text-xs text-green-700">{liffMessages.onboarding.successBody}</p>
    </div>
  );
}

function InfoBlock({
  tone,
  title,
  body,
  showRetry,
  showContactStore,
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  /** PR-E：per-store LINE OA 連結；showContactStore=true 時必填。 */
  contactUrl: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    earth: "border-earth-200 bg-earth-50 text-earth-900",
  };
  return (
    <div className={`flex flex-col gap-3 rounded-xl border px-4 py-5 text-sm ${toneClasses[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      <p className="text-xs break-words opacity-90">{body}</p>
      <div className="flex flex-wrap gap-2">
        {showRetry && (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.retryCta}
          </button>
        )}
        {showContactStore && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        )}
      </div>
    </div>
  );
}
