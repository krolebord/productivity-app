/**
 * A row the user can pull into the assistant as context. `table` is the synced
 * SQLite view the assistant queries (see user-db/migrations.ts) — note that
 * notes live in `item`, not a `note` table.
 */
export type AttachRef = {
  table: "item" | "account" | "transaction_entry";
  id: string;
};

export function formatAttachToken(ref: AttachRef): string {
  return `@${ref.table}:${ref.id}`;
}

/** Appends text to a composer draft, space-separated, leaving a trailing space to keep typing. */
export function appendToDraft(draft: string, text: string): string {
  const needsSpace = draft.length > 0 && !/\s$/.test(draft);
  return `${draft}${needsSpace ? " " : ""}${text} `;
}
