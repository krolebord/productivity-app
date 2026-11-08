// Built-in skills ship with the app. Unlike user/assistant skills they are not
// stored in the synced `skill` table — they live here as code, are always active,
// and cannot be edited or deleted. The assistant loads them via a dedicated
// SkillSource (see assistant-agent.ts); the Skills UI renders them read-only.
// Keep this module client-safe: constants only, no server-only imports.

export type BuiltinSkill = {
  /** Stable id used in the skill catalog and activate_skill. */
  id: string;
  name: string;
  /** For the model: when to activate it. */
  whenToUse: string;
  /** For people: a short line shown on the new-chat skill starters. */
  description: string;
  /** Markdown playbook, same shape as a user skill's instructions. */
  instructions: string;
};

export function isBuiltinSkillId(id: string): boolean {
  // The "builtin:" prefix never collides with generateId().
  return id.startsWith("builtin:");
}

const importTransactions: BuiltinSkill = {
  id: "builtin:import-transactions",
  name: "Import transactions",
  whenToUse:
    "Importing transactions into an account from a source the user provides — a bank statement, CSV/PDF export, screenshot, or pasted list.",
  description: "Add transactions from a bank statement, CSV, PDF or screenshot.",
  instructions: [
    "Import transactions from a source the user provides into one of their accounts, reusing their existing categories and importance levels and never creating duplicates.",
    "",
    "## 1. Confirm the target account first",
    "The account is required — do not guess it. If the user has not clearly said which account these transactions belong to, ask before doing anything else. Query the `account` table for the options (`id`, `labelText`, `currency`) and, if there is any ambiguity, list them and let the user choose. The account fixes the currency and which balance changes, so getting it right matters more than anything else here.",
    "",
    "## 2. Read the source",
    "Read whatever the user gave you — an uploaded file, pasted text, or an image. For each transaction pull the date, the description, the amount, and the direction (money in vs money out). Keep the original description text; you will show it back and may store it. Work carefully with images and messy statements.",
    "",
    "## 3. Learn the user's existing vocabulary",
    "Before categorizing anything, call getDbSchema, then read what the user already uses so new rows stay consistent:",
    "- Categories: `SELECT category, COUNT(*) AS n FROM transaction_entry WHERE category != '' GROUP BY category ORDER BY n DESC`",
    "- Importance is one of `fixed | flexible | optional | investment`; see how the user classifies similar spending.",
    'Reuse the exact existing category strings and importance levels wherever a transaction fits. Do not invent near-duplicates (e.g. "Groceries" vs "Grocery"). Only propose a new category when nothing existing fits, and call it out as new in the preview.',
    "",
    "## 4. Map each transaction",
    "Also inspect a few existing `transaction_entry` rows to match the conventions this database already uses:",
    "- `type`: `expense` for money out, `income` for money in. Use `transfer` only when both sides are the user's own accounts.",
    "- `amount`: follow the exact sign convention already in the data — match existing rows rather than assuming.",
    "- `accountId` / `accountCurrency`: the confirmed account. If the source amounts are in a different currency than the account, stop and ask how to handle it instead of importing mismatched amounts.",
    "- `category`: an existing category string when possible (leave empty for transfers).",
    "- `importance`: one of the four levels above, matching similar spending.",
    "- `title`: a clean short description; keep the raw source text in `notes` when it helps.",
    "- `effectiveAt`: the transaction's date.",
    "",
    "## 5. Detect duplicates before writing",
    "For each candidate, query `transaction_entry` on the same account for rows with the same or very close `effectiveAt` and `amount` and a similar title. Treat matches as likely duplicates. Never silently import over them — list the suspected duplicates and let the user decide per row whether to skip or import.",
    "",
    "## 6. Preview and confirm",
    "Summarize what you are about to import: count, date range, total per category, any new categories, and any suspected duplicates. Show the transactions with the renderTransactions tool. Import only after the user confirms.",
    "",
    "## 7. Write, then report",
    "Import with mutateDb using `item-created` events on `transaction_entry` (omit ids). Do it in one batch when you can. Account balances reconcile automatically after the write — do not adjust `account.balance` by hand. Finish by reporting exactly what was imported and what was skipped.",
  ].join("\n"),
};

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [importTransactions];

export function findBuiltinSkill(id: string): BuiltinSkill | undefined {
  return BUILTIN_SKILLS.find((skill) => skill.id === id);
}

/** `whenToUse` is the line shown under the name: a user skill's own trigger text, a built-in's `description`. */
export type SkillStarter = { id: string; name: string; whenToUse: string };

/** Skills offered on an empty chat: the user's active ones (most recently used first), then built-ins. */
export function skillStarters(userSkills: readonly SkillStarter[]): SkillStarter[] {
  return [
    ...userSkills,
    ...BUILTIN_SKILLS.map((skill) => ({ id: skill.id, name: skill.name, whenToUse: skill.description })),
  ];
}

/** The composer text a skill starter inserts. */
export function skillStarterPrompt(skill: Pick<SkillStarter, "name">) {
  return `Use the "${skill.name || "Untitled"}" skill.`;
}
