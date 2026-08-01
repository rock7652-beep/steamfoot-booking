/**
 * CustomerIdentityLink namespaces are intentionally distinct from Auth.js
 * Account.provider values. In particular, Account.provider === "line" is the
 * Auth.js provider identifier and is not a Messaging API identity namespace.
 */
export const CUSTOMER_IDENTITY_PROVIDER = {
  PHONE: "phone",
  GOOGLE: "google",
  LINE_LOGIN: "line_login",
  LINE_MESSAGING: "line_messaging",
  LEGACY_LINE: "line",
} as const;

export type WritableCustomerIdentityProvider = Exclude<
  (typeof CUSTOMER_IDENTITY_PROVIDER)[keyof typeof CUSTOMER_IDENTITY_PROVIDER],
  typeof CUSTOMER_IDENTITY_PROVIDER.LEGACY_LINE
>;

export type CustomerIdentityProvider =
  | WritableCustomerIdentityProvider
  | typeof CUSTOMER_IDENTITY_PROVIDER.LEGACY_LINE;

export const WRITABLE_CUSTOMER_IDENTITY_PROVIDERS = new Set<string>([
  CUSTOMER_IDENTITY_PROVIDER.PHONE,
  CUSTOMER_IDENTITY_PROVIDER.GOOGLE,
  CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN,
  CUSTOMER_IDENTITY_PROVIDER.LINE_MESSAGING,
]);

export function isWritableCustomerIdentityProvider(
  provider: string,
): provider is WritableCustomerIdentityProvider {
  return WRITABLE_CUSTOMER_IDENTITY_PROVIDERS.has(provider);
}

export function isLineLoginIdentityProvider(provider: string): boolean {
  return provider === CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN;
}

export function isLineMessagingIdentityProvider(provider: string): boolean {
  return provider === CUSTOMER_IDENTITY_PROVIDER.LINE_MESSAGING;
}

export function isLegacyLineIdentityProvider(provider: string): boolean {
  return provider === CUSTOMER_IDENTITY_PROVIDER.LEGACY_LINE;
}
