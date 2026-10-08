/** Public shared membership is an allowlist, never a customer/profile spread. */
export function courseCardPublicMembers(members: readonly { id: string; name: string }[]) {
  return members.map(({ id, name }) => ({ id, name }));
}
