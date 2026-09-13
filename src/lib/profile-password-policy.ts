const PASSWORDLESS_PROFILE_PROVIDERS = new Set(["line", "google"]);

export function hasPasswordlessProfileProvider(
  providers: readonly string[]
): boolean {
  return providers.some((provider) =>
    PASSWORDLESS_PROFILE_PROVIDERS.has(provider)
  );
}

export function requiresProfilePassword(input: {
  hasPassword: boolean;
  providers: readonly string[];
}): boolean {
  return (
    !input.hasPassword && !hasPasswordlessProfileProvider(input.providers)
  );
}
