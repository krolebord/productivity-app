import { createMigrations, defineSyncSchema, t } from "@sqlite-sync/core";
import { sql } from "kysely";

export type UserDbProps = {
  userId: string;
};

const migrations = createMigrations((b) => ({
  0: [
    b.createTable("_item", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("type", "text", (col) => col.notNull().defaultTo("note"))
        .addColumn("title", "text", (col) => col.notNull())
        .addColumn("createdAt", "integer", (col) => col.notNull()),
    ),
  ],
  1: [
    b.addColumn({
      table: "_item",
      column: "content",
      type: "text",
      defaultValue: "",
    }),
    b.addColumn({
      table: "_item",
      column: "order",
      type: "real",
      defaultValue: 0,
    }),
  ],
  2: [
    b.createTable("_currency_rate", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("date", "text", (col) => col.notNull())
        .addColumn("baseCurrency", "text", (col) => col.notNull())
        .addColumn("AUD", "real")
        .addColumn("BRL", "real")
        .addColumn("CAD", "real")
        .addColumn("CHF", "real")
        .addColumn("CNY", "real")
        .addColumn("CZK", "real")
        .addColumn("DKK", "real")
        .addColumn("EUR", "real")
        .addColumn("GBP", "real")
        .addColumn("HKD", "real")
        .addColumn("HUF", "real")
        .addColumn("IDR", "real")
        .addColumn("ILS", "real")
        .addColumn("INR", "real")
        .addColumn("ISK", "real")
        .addColumn("JPY", "real")
        .addColumn("KRW", "real")
        .addColumn("MXN", "real")
        .addColumn("MYR", "real")
        .addColumn("NOK", "real")
        .addColumn("NZD", "real")
        .addColumn("PHP", "real")
        .addColumn("PLN", "real")
        .addColumn("RON", "real")
        .addColumn("SEK", "real")
        .addColumn("SGD", "real")
        .addColumn("THB", "real")
        .addColumn("TRY", "real")
        .addColumn("UAH", "real")
        .addColumn("USD", "real")
        .addColumn("ZAR", "real"),
    ),
  ],
  3: [],
  4: [
    b.createTable("_account", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("currency", "text", (col) => col.notNull())
        .addColumn("initialBalance", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("balance", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("labelColor", "text", (col) => col.notNull().defaultTo("#8b5cf6"))
        .addColumn("labelText", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("order", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("createdAt", "integer", (col) => col.notNull()),
    ),
  ],
  5: [
    b.createTable("_transaction_entry", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("type", "text", (col) => col.notNull().defaultTo("expense"))
        .addColumn("accountId", "text", (col) => col.notNull())
        .addColumn("accountCurrency", "text", (col) => col.notNull())
        .addColumn("amount", "real", (col) => col.notNull())
        .addColumn("counterpartyAccountId", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("counterpartyCurrency", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("counterpartyAmount", "real")
        .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("category", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("notes", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("effectiveAt", "integer", (col) => col.notNull())
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  6: [
    b.createTable("_conversation", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  7: [
    b.addColumn({
      table: "_conversation",
      column: "totalCost",
      type: "real",
      defaultValue: 0,
      build: (col) => col.notNull(),
    }),
    b.addColumn({
      table: "_conversation",
      column: "totalTokens",
      type: "integer",
      defaultValue: 0,
      build: (col) => col.notNull(),
    }),
  ],
  8: [
    b.addColumn({
      table: "_item",
      column: "tags",
      type: "text",
      defaultValue: "[]",
      build: (col) => col.notNull(),
    }),
  ],
  9: [
    b.createTable("_memory", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("content", "text", (col) => col.notNull())
        .addColumn("source", "text", (col) => col.notNull().defaultTo("user"))
        .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(true))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  10: [
    b.createTable("_skill", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("name", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("whenToUse", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("instructions", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("source", "text", (col) => col.notNull().defaultTo("user"))
        .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
        .addColumn("lastUsedAt", "integer")
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  11: [
    b.addColumn({
      table: "_conversation",
      column: "model",
      type: "text",
      defaultValue: null,
    }),
  ],
  12: [
    b.createTable("_monobank_connection", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("providerConnectionId", "text", (col) => col.notNull())
        .addColumn("status", "text", (col) => col.notNull().defaultTo("connected"))
        .addColumn("webhookStatus", "text", (col) => col.notNull().defaultTo("pending"))
        .addColumn("displayName", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("lastError", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("connectedAt", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.createTable("_monobank_account", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("providerConnectionId", "text", (col) => col.notNull())
        .addColumn("providerAccountId", "text", (col) => col.notNull())
        .addColumn("displayName", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("accountType", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("currency", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("maskedPan", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("linkedAccountId", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(true))
        .addColumn("lastWebhookAt", "integer")
        .addColumn("lastImportAt", "integer")
        .addColumn("lastError", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.addColumn({
      table: "_transaction_entry",
      column: "providerType",
      type: "text",
      defaultValue: null,
    }),
    b.addColumn({
      table: "_transaction_entry",
      column: "providerId",
      type: "text",
      defaultValue: null,
    }),
  ],
  13: [
    b.createIndex("transaction_entry_provider", (idx) =>
      idx.on("_transaction_entry").columns(["providerType", "providerId"]).where(sql.ref("tombstone"), "=", 0),
    ),
    b.createIndex("transaction_entry_account_effective", (idx) =>
      idx.on("_transaction_entry").columns(["accountId", "effectiveAt"]).where(sql.ref("tombstone"), "=", 0),
    ),
    b.createIndex("transaction_entry_effective", (idx) =>
      idx.on("_transaction_entry").columns(["effectiveAt"]).where(sql.ref("tombstone"), "=", 0),
    ),
  ],
  14: [
    b.addColumn({
      table: "_account",
      column: "excludeFromDashboard",
      type: "boolean",
      defaultValue: false,
      build: (col) => col.notNull(),
    }),
  ],
  15: [
    b.addColumn({
      table: "_transaction_entry",
      column: "importance",
      type: "text",
      defaultValue: null,
    }),
  ],
  16: [
    b.createTable("_dashboard_settings", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("rangeMode", "text", (col) => col.notNull().defaultTo("days"))
        .addColumn("rangeDays", "integer", (col) => col.notNull().defaultTo(30))
        .addColumn("cycleDay", "integer", (col) => col.notNull().defaultTo(25))
        .addColumn("baseCurrency", "text", (col) => col.notNull().defaultTo("USD"))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  17: [
    b.addColumn({
      table: "_item",
      column: "dueAt",
      type: "integer",
      defaultValue: null,
    }),
    b.addColumn({
      table: "_item",
      column: "hasDueTime",
      type: "boolean",
      defaultValue: false,
      build: (col) => col.notNull(),
    }),
    b.addColumn({
      table: "_item",
      column: "completedAt",
      type: "integer",
      defaultValue: null,
    }),
    b.createTable("_habit", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("name", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("scheduleType", "text", (col) => col.notNull().defaultTo("daily"))
        .addColumn("scheduleInterval", "integer", (col) => col.notNull().defaultTo(1))
        .addColumn("scheduleWeekdays", "text", (col) => col.notNull().defaultTo("[]"))
        .addColumn("timeOfDay", "text")
        .addColumn("target", "real", (col) => col.notNull().defaultTo(1))
        .addColumn("unit", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("order", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("archivedAt", "integer")
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.createTable("_habit_entry", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("habitId", "text", (col) => col.notNull())
        .addColumn("date", "text", (col) => col.notNull())
        .addColumn("value", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.createIndex("habit_entry_habit_date", (idx) =>
      idx.on("_habit_entry").columns(["habitId", "date"]).where(sql.ref("tombstone"), "=", 0),
    ),
    b.createIndex("habit_entry_date", (idx) =>
      idx.on("_habit_entry").columns(["date"]).where(sql.ref("tombstone"), "=", 0),
    ),
    b.createIndex("item_due", (idx) => idx.on("_item").columns(["dueAt"]).where(sql.ref("tombstone"), "=", 0)),
  ],
  18: [
    b.createTable("_note_view", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("name", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("include", "text", (col) => col.notNull().defaultTo("[]"))
        .addColumn("exclude", "text", (col) => col.notNull().defaultTo("[]"))
        .addColumn("match", "text", (col) => col.notNull().defaultTo("all"))
        .addColumn("order", "real", (col) => col.notNull().defaultTo(0))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
  ],
  19: [
    b.addColumn({
      table: "_note_view",
      column: "status",
      type: "text",
      defaultValue: null,
    }),
  ],
  20: [
    b.createTable("_calendar_connection", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("providerConnectionId", "text", (col) => col.notNull())
        .addColumn("status", "text", (col) => col.notNull().defaultTo("connected"))
        .addColumn("email", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("connectedAt", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.createTable("_calendar_source", (table) =>
      table
        .addColumn("id", "text", (col) => col.primaryKey().notNull())
        .addColumn("tombstone", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("providerConnectionId", "text", (col) => col.notNull())
        .addColumn("providerCalendarId", "text", (col) => col.notNull())
        .addColumn("displayName", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("color", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("isPrimary", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("timeZone", "text", (col) => col.notNull().defaultTo(""))
        .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(false))
        .addColumn("createdAt", "integer", (col) => col.notNull())
        .addColumn("updatedAt", "integer", (col) => col.notNull()),
    ),
    b.addColumn({
      table: "_item",
      column: "providerType",
      type: "text",
      defaultValue: null,
    }),
    b.addColumn({
      table: "_item",
      column: "providerId",
      type: "text",
      defaultValue: null,
    }),
    b.addColumn({
      table: "_item",
      column: "providerUpdatedAt",
      type: "integer",
      defaultValue: null,
    }),
    // Include tombstones so deleted provider items are not recreated by sync.
    b.createIndex("item_provider", (idx) => idx.on("_item").columns(["providerType", "providerId"])),
  ],
}));

export const MEMORY_INJECTION_LIMIT = 50;
export const SKILL_CATALOG_LIMIT = 50;

const currencyColumn = () => t.real().nullable();

export const syncDbSchema = defineSyncSchema({
  tables: {
    item: t
      .table({
        type: t
          .enum(["note", "task"])
          .default("note")
          .describe('Item kind: "note" for reference material, "task" for an actionable item.'),
        title: t.text().describe("Note or task title (may be empty)."),
        createdAt: t.integer(),
        content: t
          .text()
          .nullable()
          .default("")
          .describe("Note body as markdown. Can be long — avoid selecting it unless needed."),
        order: t.real().nullable().default(0).describe("Manual sort position, ascending."),
        tags: t
          .text()
          .default("[]")
          .describe('JSON array of normalized tag strings, e.g. ["work","idea"]. Defaults to "[]".'),
        dueAt: t
          .integer()
          .nullable()
          .default(null)
          .describe(
            "When a task is scheduled on the agenda (epoch ms). Null means the task is in Inbox. Always null for notes.",
          ),
        hasDueTime: t
          .boolean()
          .default(false)
          .describe(
            "Whether dueAt carries a meaningful time-of-day. False means all-day (only the calendar date of dueAt matters).",
          ),
        completedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Epoch ms when the task was completed, or null when it is still open. Always null for notes."),
        providerType: t
          .text()
          .nullable()
          .default(null)
          .describe(
            'Source that created this task: "google-calendar", "detached" once the user unlinks it, or null for user-created items.',
          ),
        providerId: t
          .text()
          .nullable()
          .default(null)
          .describe("Id of the external record this task mirrors; kept after detaching so it is never re-imported."),
        providerUpdatedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Epoch ms the external record last changed, used to skip unchanged rows on resync."),
      })
      .describe(
        [
          "The user's notes and tasks, distinguished by `type`. Notes are durable reference material and use",
          "title, content, tags, and order. Tasks are actions: a null dueAt puts them in Inbox; a non-null",
          "dueAt schedules them on the agenda; completedAt records completion. Tasks may use content and tags",
          "for supporting details.",
        ].join(" "),
      ),
    currency_rate: t
      .table({
        date: t.text().describe('Rate date as "YYYY-MM-DD".'),
        baseCurrency: t.text().describe('Currently always "USD".'),
        AUD: currencyColumn(),
        BRL: currencyColumn(),
        CAD: currencyColumn(),
        CHF: currencyColumn(),
        CNY: currencyColumn(),
        CZK: currencyColumn(),
        DKK: currencyColumn(),
        EUR: currencyColumn(),
        GBP: currencyColumn(),
        HKD: currencyColumn(),
        HUF: currencyColumn(),
        IDR: currencyColumn(),
        ILS: currencyColumn(),
        INR: currencyColumn(),
        ISK: currencyColumn(),
        JPY: currencyColumn(),
        KRW: currencyColumn(),
        MXN: currencyColumn(),
        MYR: currencyColumn(),
        NOK: currencyColumn(),
        NZD: currencyColumn(),
        PHP: currencyColumn(),
        PLN: currencyColumn(),
        RON: currencyColumn(),
        SEK: currencyColumn(),
        SGD: currencyColumn(),
        THB: currencyColumn(),
        TRY: currencyColumn(),
        UAH: currencyColumn(),
        USD: currencyColumn(),
        ZAR: currencyColumn(),
      })
      .describe(
        [
          "Daily exchange rates, one row per (date, baseCurrency). `baseCurrency` is currently always",
          '"USD"; each currency-code column holds how many units of that currency equal 1 unit of the',
          "base currency on that date (NULL if unavailable). To convert between two non-USD currencies,",
          "go through the base: amountInB = amountInA / rateA * rateB. Rows are appended roughly daily;",
          "use the row with the latest `date` for current rates.",
        ].join(" "),
      ),
    account: t
      .table({
        currency: t.text().describe('ISO 4217 currency code, e.g. "USD".'),
        initialBalance: t.real().default(0).describe("Starting balance in the account currency."),
        balance: t
          .real()
          .default(0)
          .describe("Current balance in the account currency, kept up to date by the app as transactions change."),
        description: t.text().default("").describe("User-provided account name/description."),
        labelColor: t.text().default("#8b5cf6").describe("Hex color of the display label."),
        labelText: t.text().default("").describe("Short display label shown on the account card."),
        order: t.real().default(0).describe("Manual sort position, ascending."),
        excludeFromDashboard: t
          .boolean()
          .default(false)
          .describe("When true, this account is left out of all dashboard metrics (net worth, income/spend, charts)."),
        createdAt: t.integer(),
      })
      .describe("Financial accounts (bank accounts, cash, etc.)."),
    transaction_entry: t
      .table({
        type: t.text().default("expense").describe("expense | income | transfer | adjustment."),
        accountId: t.text().describe("References account.id."),
        accountCurrency: t.text().describe("Currency of `amount` (copied from the account)."),
        amount: t.real().describe("Signed amount — see table description for sign conventions."),
        counterpartyAccountId: t
          .text()
          .default("")
          .describe("Destination account.id for transfers, empty string otherwise."),
        counterpartyCurrency: t.text().default(""),
        counterpartyAmount: t
          .real()
          .nullable()
          .describe("Positive amount received by the destination account (transfers only)."),
        title: t.text().default(""),
        category: t.text().default("").describe("Free-form category for expenses/incomes (empty for transfers)."),
        importance: t
          .enum(["fixed", "flexible", "optional", "investment"])
          .nullable()
          .default(null)
          .describe(
            "Expense importance tier: fixed | flexible | optional | investment; null for other types or unset.",
          ),
        notes: t.text().default("").describe("Free-form notes."),
        effectiveAt: t
          .integer()
          .describe("When the transaction happened — use this for date filtering, not createdAt."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
        providerType: t
          .text()
          .nullable()
          .default(null)
          .describe('External provider that created this transaction, e.g. "monobank"; null for manual entries.'),
        providerId: t
          .text()
          .nullable()
          .default(null)
          .describe("Provider-side id of the source transaction (for Monobank, the statementItem id); null otherwise."),
      })
      .describe(
        [
          "Financial transactions. `type` is one of: expense, income, transfer, adjustment.",
          "`amount` is signed and in the account's currency: negative for expenses and for the source",
          "side of transfers, positive for income, either sign for adjustments. Transfers also set",
          "`counterpartyAccountId` (destination account), `counterpartyCurrency`, and `counterpartyAmount`",
          "(positive, in the destination currency); for all other types `counterpartyAccountId` is an",
          "empty string and `counterpartyAmount` is NULL.",
        ].join(" "),
      ),
    conversation: t
      .table({
        title: t.text().default(""),
        createdAt: t.integer(),
        updatedAt: t.integer(),
        model: t
          .text()
          .nullable()
          .default(null)
          .describe("Model id used for this conversation; fixed once the first message is sent."),
        totalCost: t
          .real()
          .default(0)
          .describe("Cumulative OpenRouter cost in USD across all turns in this conversation."),
        totalTokens: t
          .integer()
          .default(0)
          .describe("Cumulative total tokens used across all turns in this conversation."),
      })
      .describe("Index of the user's conversations with this assistant (titles, timestamps, and usage totals)."),
    memory: t
      .table({
        content: t.text().describe("A short, durable fact or preference about the user, in plain language."),
        source: t
          .enum(["user", "assistant"])
          .default("user")
          .describe('Who created the memory: "user" (added by the user) or "assistant".'),
        enabled: t
          .boolean()
          .default(true)
          .describe("When false the memory is muted: kept but not shown to the assistant."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Small, durable notes the assistant keeps about the user (preferences, recurring facts, rules).",
          "Every enabled memory is injected into the assistant's context each turn, so keep them short and",
          "general. Manage them with the remember/update_memory/forget tools rather than writing here directly.",
        ].join(" "),
      ),
    skill: t
      .table({
        name: t.text().default("").describe("Short title of the skill."),
        whenToUse: t
          .text()
          .default("")
          .describe("Short description of when this skill applies; used to match future requests."),
        instructions: t.text().default("").describe("Step-by-step playbook in markdown for the assistant to follow."),
        source: t.enum(["user", "assistant"]).default("user").describe('Who created the skill: "user" or "assistant".'),
        status: t
          .enum(["pending", "active", "disabled"])
          .default("pending")
          .describe('"active" skills are offered to the assistant; "pending" awaits user review; "disabled" is muted.'),
        lastUsedAt: t.integer().nullable().default(null).describe("Epoch ms the skill was last invoked, or null."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Reusable multi-step playbooks the assistant can follow for recurring tasks. Only `active` skills are",
          "offered to the assistant as loadable skills. New assistant-created skills start as `pending` until the",
          "user reviews and activates them.",
        ].join(" "),
      ),
    monobank_connection: t
      .table({
        providerConnectionId: t.text().describe("Id of the central-D1 Monobank connection row this mirrors."),
        status: t.text().default("connected").describe("connected | disconnected | error."),
        webhookStatus: t.text().default("pending").describe("pending | active | error."),
        displayName: t.text().default("").describe("Client name reported by Monobank."),
        lastError: t.text().default("").describe("Last connection-level error, empty when healthy."),
        connectedAt: t.integer().default(0).describe("Epoch ms the connection was established."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Display/status metadata for the user's Monobank connection. The secret token lives only in",
          "central D1, never here. There is at most one active connection per user.",
        ].join(" "),
      ),
    monobank_account: t
      .table({
        providerConnectionId: t.text().describe("References monobank_connection.providerConnectionId."),
        providerAccountId: t.text().describe("Monobank account id."),
        displayName: t.text().default("").describe("Human-readable label for the remote account."),
        accountType: t.text().default("").describe("Monobank account type (e.g. black, white, fop)."),
        currency: t.text().default("").describe('ISO 4217 alpha currency code, or "" when unsupported.'),
        maskedPan: t.text().default("").describe("Masked card number(s); display string or JSON text."),
        linkedAccountId: t
          .text()
          .default("")
          .describe("References account.id this remote account imports into, or empty when unlinked."),
        enabled: t.boolean().default(true).describe("Whether imports are enabled for this remote account."),
        lastWebhookAt: t.integer().nullable().default(null).describe("Epoch ms of the last received webhook, or null."),
        lastImportAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Epoch ms of the last imported transaction, or null."),
        lastError: t.text().default("").describe("Last import/link error for this account, empty when healthy."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Display/link metadata for the Monobank accounts exposed by the user's connection. Each remote",
          "account links one-to-one to an in-app account via `linkedAccountId`. No balances are stored here.",
        ].join(" "),
      ),
    calendar_connection: t
      .table({
        providerConnectionId: t.text().describe("Id of the central-D1 google_calendar_connection row this mirrors."),
        status: t.text().default("connected").describe("connected | disconnected | error. Written only on change."),
        email: t.text().default("").describe("Google account the calendars belong to."),
        connectedAt: t.integer().default(0),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        "One row per connected Google account. OAuth tokens live in D1, sync diagnostics in DO storage, not here.",
      ),
    calendar_source: t
      .table({
        providerConnectionId: t.text().describe("References calendar_connection.providerConnectionId."),
        providerCalendarId: t.text().describe("Google calendar id."),
        displayName: t.text().default(""),
        color: t.text().default("").describe("Hex colour, or empty."),
        isPrimary: t.boolean().default(false),
        timeZone: t.text().default("").describe("IANA zone the calendar's all-day dates are anchored to."),
        enabled: t.boolean().default(false).describe("Whether this calendar's events are mirrored into tasks."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "One row per calendar visible to a connected Google account. Enabled calendars mirror their events",
          "one-way into `item` tasks with providerType google-calendar; no events are stored here.",
        ].join(" "),
      ),
    dashboard_settings: t
      .table({
        rangeMode: t.enum(["days", "cycle"]).default("days").describe("Dashboard range type: days | cycle."),
        rangeDays: t.integer().default(30).describe('Trailing-window length for rangeMode "days".'),
        cycleDay: t.integer().default(25).describe('Day of month when rangeMode "cycle" starts.'),
        baseCurrency: t.text().default("USD").describe("Currency used to display dashboard totals."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe("Singleton dashboard preferences synced across the user's devices."),
    habit: t
      .table({
        name: t.text().default("").describe("Display name of the habit."),
        scheduleType: t
          .enum(["daily", "weekly", "monthly", "everyNDays", "weekdays"])
          .default("daily")
          .describe(
            [
              'How often the habit is due: "daily" = every day; "weekdays" = only on the ISO weekdays listed',
              'in scheduleWeekdays; "weekly" = target accumulates over the calendar week (Monday-start), shown',
              'until the week sum reaches target; "monthly" = same but over the calendar month;',
              '"everyNDays" = due scheduleInterval days after the last completed day, shown until done.',
            ].join(" "),
          ),
        scheduleInterval: t
          .integer()
          .default(1)
          .describe('The N for scheduleType "everyNDays" (days between completions). Unused for other schedule types.'),
        scheduleWeekdays: t
          .text()
          .default("[]")
          .describe(
            'JSON array of ISO weekday numbers 1 (Mon) through 7 (Sun), used only when scheduleType is "weekdays". Defaults to "[]".',
          ),
        timeOfDay: t
          .enum(["morning", "afternoon", "evening", "night"])
          .nullable()
          .default(null)
          .describe("Preferred time bucket: morning | afternoon | evening | night. Null means anytime."),
        target: t
          .real()
          .default(1)
          .describe(
            "Quantity target. For weekly habits it applies to the whole Monday-start week and for monthly habits to the whole calendar month (done when the period's summed habit_entry.value is >= target); for all other schedules it applies per day. 1 means a simple check-off.",
          ),
        unit: t.text().default("").describe('Optional unit label for the target, e.g. "pages". Empty when unused.'),
        order: t.real().default(0).describe("Manual sort position, ascending."),
        archivedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Epoch ms when the habit was soft-archived, or null if active. Habits are never hard-deleted."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Recurring habits shown on the Today view. Schedule semantics: daily = every day; weekdays = on the",
          "days listed in scheduleWeekdays; weekly = target summed over the Monday-start calendar week (shown",
          "until the week sum reaches target); monthly = the same over the calendar month; everyNDays = due",
          "scheduleInterval days after the last completed day (shown until done). Except for weekly and monthly",
          "habits, done-for-a-day means the sum of habit_entry.value for that date is >= target.",
          "Soft-archive via archivedAt rather than deleting.",
        ].join(" "),
      ),
    note_view: t
      .table({
        name: t.text().default("").describe("Display name of the saved view."),
        include: t
          .text()
          .default("[]")
          .describe(
            'JSON array of tags a note must carry to appear in this view. The pseudo-tag ":untagged" matches notes without any tags.',
          ),
        exclude: t
          .text()
          .default("[]")
          .describe("JSON array of tags that hide a note from this view; always applied regardless of `match`."),
        match: t
          .enum(["all", "any"])
          .default("all")
          .describe("Whether a note must carry all of the included tags or any one of them."),
        status: t
          .enum(["pending", "completed", "overdue"])
          .nullable()
          .default(null)
          .describe(
            "Legacy field retained for sync compatibility. New note views leave it null and the UI ignores it.",
          ),
        order: t.real().default(0).describe("Manual sort position, ascending."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Saved tag-filter presets for the Notes page, shown as one-click view pills above the filter bar.",
          "A view is purely a named filter; it stores no notes itself.",
        ].join(" "),
      ),
    habit_entry: t
      .table({
        habitId: t.text().describe("References habit.id."),
        date: t.text().describe('Local calendar day as "YYYY-MM-DD".'),
        value: t
          .real()
          .default(0)
          .describe(
            "Accumulated amount logged for this habit on this date. Counts toward habit.target per day, or summed over the Monday-start week for weekly habits and the calendar month for monthly habits.",
          ),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Per-day progress toward a habit. One logical entry per (habitId, date); value accumulates toward",
          "habit.target — per day for most schedules, summed across the Monday-start week for weekly habits",
          "and the calendar month for monthly habits.",
        ].join(" "),
      ),
  },
  migrations,
});

export type NoteItem = typeof syncDbSchema.tables.item.$row;
export type TaskItem = typeof syncDbSchema.tables.item.$row;
export type CurrencyRateItem = typeof syncDbSchema.tables.currency_rate.$row;
export type AccountItem = typeof syncDbSchema.tables.account.$row;
export type TransactionEntryItem = typeof syncDbSchema.tables.transaction_entry.$row;
export type ConversationItem = typeof syncDbSchema.tables.conversation.$row;
export type MemoryItem = typeof syncDbSchema.tables.memory.$row;
export type SkillItem = typeof syncDbSchema.tables.skill.$row;
export type MonobankConnectionMetaItem = typeof syncDbSchema.tables.monobank_connection.$row;
export type MonobankAccountItem = typeof syncDbSchema.tables.monobank_account.$row;
export type CalendarConnectionMetaItem = typeof syncDbSchema.tables.calendar_connection.$row;
export type CalendarSourceItem = typeof syncDbSchema.tables.calendar_source.$row;
export type DashboardSettingsItem = typeof syncDbSchema.tables.dashboard_settings.$row;
export type HabitItem = typeof syncDbSchema.tables.habit.$row;
export type NoteViewItem = typeof syncDbSchema.tables.note_view.$row;
export type HabitEntryItem = typeof syncDbSchema.tables.habit_entry.$row;

export type UserDb = (typeof syncDbSchema)["~clientSchema"];

export type UserSyncDbSchema = typeof syncDbSchema;
