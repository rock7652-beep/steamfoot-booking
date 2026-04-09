"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function OAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  async function handleSignIn(provider: string) {
    setLoadingProvider(provider);
    try {
      await signIn(provider, { callbackUrl: "/book" });
    } catch {
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* LINE Login */}
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => handleSignIn("line")}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#05b04c] transition disabled:opacity-60"
      >
        {loadingProvider === "line" ? (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .349-.281.63-.63.63h-2.386a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 .63-.63h2.386c.349 0 .63.282.63.63 0 .349-.281.631-.63.631H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 0 1-.63.63.629.629 0 0 1-.51-.262l-2.442-3.339v2.97a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 .63-.63c.2 0 .383.096.51.262l2.442 3.339V8.108a.63.63 0 0 1 1.26 0v4.771zm-5.741 0a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 1.26 0v4.771zm-2.466.63H4.917a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 1.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .349-.281.63-.629.63M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.122.301.079.771.039 1.075l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.023 14.469 24 12.512 24 10.314" />
          </svg>
        )}
        {loadingProvider === "line" ? "登入中..." : "LINE 登入"}
      </button>

      {/* Google Login */}
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => handleSignIn("google")}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50 transition disabled:opacity-60"
      >
        {loadingProvider === "google" ? (
          <svg className="h-5 w-5 animate-spin text-earth-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        {loadingProvider === "google" ? "登入中..." : "Google 登入"}
      </button>
    </div>
  );
}
