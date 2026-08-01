export type TaichungCompletionResult =
  | { ok: true }
  | { ok: false; error: "sign_in_failed" | "completion_failed" | "unexpected_error" };

type Dependencies = {
  callbackUrl: string;
  signIn: (provider: string, options: { redirect: false; callbackUrl: string }) => Promise<{ ok?: boolean } | undefined>;
  complete: () => Promise<{ ok: boolean }>;
  redirect: (url: string) => void;
};

/**
 * Do not redirect on an assumed success. The final destination is reachable
 * only after Auth.js has consumed the bridge and completion confirms the
 * line_login write.
 */
export async function completeTaichungLineLogin({
  callbackUrl,
  signIn,
  complete,
  redirect,
}: Dependencies): Promise<TaichungCompletionResult> {
  try {
    const signInResult = await signIn("line-taichung-coordinator", {
      redirect: false,
      callbackUrl,
    });
    if (!signInResult?.ok) return { ok: false, error: "sign_in_failed" };

    const completion = await complete();
    if (!completion.ok) return { ok: false, error: "completion_failed" };

    redirect("/s/taichung/book");
    return { ok: true };
  } catch {
    return { ok: false, error: "unexpected_error" };
  }
}
