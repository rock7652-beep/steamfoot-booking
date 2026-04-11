"use client";

import { useState, useTransition } from "react";
import {
  searchHealthProfile,
  linkHealthProfile,
  unlinkHealthProfile,
} from "@/server/actions/health";

// ============================================================
// HealthLinkModal — 建立 / 連結 AI 健康評估資料
// ============================================================

interface HealthLinkModalProps {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  currentStatus: string; // "unlinked" | "linked" | "not_found" | "error"
  currentHealthProfileId: string | null;
  onLinked?: (profileId: string) => void;
  onUnlinked?: () => void;
}

interface ProfileResult {
  id: string;
  fullName: string | null;
  gender: string | null;
  age: number | null;
  height: number | null;
  emailHint: string | null;
  phoneHint: string | null;
}

export function HealthLinkModal({
  customerId,
  customerEmail,
  customerPhone,
  currentStatus,
  currentHealthProfileId,
  onLinked,
  onUnlinked,
}: HealthLinkModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(customerEmail ?? "");
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // 搜尋
  function handleSearch() {
    if (!email.trim() && !phone.trim()) {
      setError("請輸入 Email 或手機號碼");
      return;
    }
    setError("");
    setSearched(false);

    startTransition(async () => {
      const res = await searchHealthProfile(
        email.trim() || undefined,
        phone.trim() || undefined
      );
      setResults(res.profiles);
      setSearched(true);
    });
  }

  // 綁定
  function handleLink(profileId: string) {
    startTransition(async () => {
      const res = await linkHealthProfile(customerId, profileId);
      if (res.success) {
        setOpen(false);
        onLinked?.(profileId);
      } else {
        setError(res.error ?? "綁定失敗");
      }
    });
  }

  // 解除綁定
  function handleUnlink() {
    if (!confirm("確定要解除綁定嗎？")) return;
    startTransition(async () => {
      await unlinkHealthProfile(customerId);
      setOpen(false);
      onUnlinked?.();
    });
  }

  // 重置狀態
  function openModal() {
    setResults([]);
    setSearched(false);
    setError("");
    setEmail(customerEmail ?? "");
    setPhone(customerPhone ?? "");
    setOpen(true);
  }

  return (
    <>
      {/* 觸發按鈕 */}
      {currentStatus === "linked" ? (
        <button
          onClick={openModal}
          className="text-xs text-earth-400 hover:text-earth-600 hover:underline"
        >
          管理綁定
        </button>
      ) : (
        <button
          onClick={openModal}
          className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
        >
          建立 / 連結評估
        </button>
      )}

      {/* Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-earth-900">
                搜尋健康評估資料
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-earth-400 hover:text-earth-600"
              >
                ✕
              </button>
            </div>

            {/* 搜尋表單 */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-earth-500">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-xs text-earth-500">手機號碼</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}

              <button
                onClick={handleSearch}
                disabled={isPending}
                className="w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
              >
                {isPending ? "搜尋中..." : "搜尋"}
              </button>
            </div>

            {/* 搜尋結果 */}
            {searched && (
              <div className="mt-4">
                {results.length === 0 ? (
                  <div className="rounded-lg bg-earth-50 p-3 text-center text-sm text-earth-500">
                    查無符合的帳號
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-earth-500">
                      找到 {results.length} 筆結果：
                    </p>
                    {results.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between rounded-lg border border-earth-200 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-earth-900">
                            {profile.fullName ?? "未設定姓名"}
                          </p>
                          <div className="mt-0.5 flex gap-3 text-xs text-earth-400">
                            {profile.gender && (
                              <span>
                                {profile.gender === "male" ? "男" : "女"}
                              </span>
                            )}
                            {profile.age != null && (
                              <span>{profile.age} 歲</span>
                            )}
                            {profile.height != null && (
                              <span>{profile.height} cm</span>
                            )}
                          </div>
                          <div className="mt-0.5 flex gap-3 text-xs text-earth-400">
                            {profile.emailHint && (
                              <span>{profile.emailHint}</span>
                            )}
                            {profile.phoneHint && (
                              <span>{profile.phoneHint}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleLink(profile.id)}
                          disabled={isPending}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                        >
                          {isPending ? "綁定中..." : "綁定"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 已綁定 → 解除綁定區塊 */}
            {currentStatus === "linked" && currentHealthProfileId && (
              <div className="mt-4 border-t border-earth-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-earth-500">目前已綁定</p>
                    <p className="text-xs font-mono text-earth-400">
                      {currentHealthProfileId.slice(0, 8)}...
                    </p>
                  </div>
                  <button
                    onClick={handleUnlink}
                    disabled={isPending}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    解除綁定
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
