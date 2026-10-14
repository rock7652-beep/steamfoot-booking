"use client";

import { useTransition, type ComponentProps } from "react";
import { useRouter } from "@/components/use-stable-router";

/** GET filters use client navigation while retaining native no-JS submission. */
export function QueryForm({ children, onSubmit, ...props }: Omit<ComponentProps<"form">, "action"> & { action?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <form {...props} method="get" aria-busy={props["aria-busy"] ?? pending} onSubmit={event => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
    const targetName = submitter?.hasAttribute("formtarget") ? submitter.formTarget : form.target;
    if (targetName === "_blank" || (submitter?.hasAttribute("formmethod") && submitter.formMethod.toLowerCase() !== "get")) return;
    const target = new URL(submitter?.hasAttribute("formaction") ? submitter.formAction : form.action || window.location.href, window.location.href);
    if (target.origin !== window.location.origin) return;
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(form, submitter).forEach((value, name) => params.append(name, typeof value === "string" ? value : value.name));
    const query = params.toString();
    start(() => router.push(`${target.pathname}${query ? `?${query}` : ""}${target.hash}`, { scroll: false }));
  }}>{children}</form>;
}
