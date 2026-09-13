import { SpaIdentityModeSwitcher } from "@/components/spa-identity-mode-switcher";

export function IdentityModeSwitcher({ storeSlug }: { storeSlug: string }) {
  return <SpaIdentityModeSwitcher storeSlug={storeSlug} activeMode="member" />;
}
