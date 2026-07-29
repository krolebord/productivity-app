import { getContext } from "@/lib/context";

// An unset allowlist denies access to the billed assistant.
function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAssistantAllowed(email: string | undefined | null): boolean {
  if (!email) {
    return false;
  }
  return parseAllowlist(getContext().ASSISTANT_ALLOWLIST).has(email.toLowerCase());
}
