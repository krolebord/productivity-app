import { getContext } from "@/lib/context";

// The assistant runs LLM calls billed to our shared OpenRouter key, so for the
// initial release it is locked behind an email allowlist. ASSISTANT_ALLOWLIST is
// a comma-separated list of emails; an empty/unset value denies everyone.
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
