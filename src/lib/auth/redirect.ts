/** Keeps post-auth navigation same-origin and out of the auth screen itself. */
export function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/auth/")) return "/";
  return value;
}
