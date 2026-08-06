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
  21: [
    // Serves the undated task inbox and the notes list, both of which filter on
    // type + a null dueAt and sort by order.
    b.createIndex("item_type_due_order", (idx) =>
      idx.on("_item").columns(["type", "dueAt", "order"]).where(sql.ref("tombstone"), "=", 0),
    ),
  ],
  22: [
    b.addColumn({
      table: "_conversation",
      column: "reasoningEffort",
      type: "text",
      defaultValue: null,
    }),
  ],
  23: [
    b.addColumn({
      table: "_habit",
      column: "scheduleMonthDays",
      type: "text",
      defaultValue: "[]",
      build: (col) => col.notNull(),
    }),
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
        title: t.text(),
        createdAt: t.integer(),
        content: t.text().nullable().default("").describe("Markdown body; may be large."),
        order: t.real().nullable().default(0),
        tags: t.text().default("[]").describe('JSON array of normalized tags; default "[]".'),
        dueAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Task schedule time; null means Inbox. Always null for notes."),
        hasDueTime: t.boolean().default(false).describe("Whether dueAt has a time; false means all-day."),
        completedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Completion time; null when open. Always null for notes."),
        providerType: t
          .text()
          .nullable()
          .default(null)
          .describe('"google-calendar", "detached" after unlinking, or null for user-created items.'),
        providerId: t
          .text()
          .nullable()
          .default(null)
          .describe("External record id; retained after detaching to prevent re-import."),
        providerUpdatedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("External record update time; used to skip unchanged rows."),
      })
      .describe(
        ["Notes are reference material; tasks are actionable. Use `dueAt` and `completedAt` for task state."].join(" "),
      ),
    currency_rate: t
      .table({
        date: t.text().describe('Rate date, "YYYY-MM-DD".'),
        baseCurrency: t.text(),
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
          "Daily rates, one row per (date, baseCurrency). Each code is units per base unit (null if unavailable).",
          "Use the latest date for current rates; A→B: amount / rateA * rateB.",
        ].join(" "),
      ),
    account: t
      .table({
        currency: t.text().describe('ISO 4217 currency code, e.g. "USD".'),
        initialBalance: t.real().default(0),
        balance: t.real().default(0).describe("App-maintained current balance."),
        description: t.text().default(""),
        labelColor: t.text().default("#8b5cf6"),
        labelText: t.text().default(""),
        order: t.real().default(0),
        excludeFromDashboard: t.boolean().default(false).describe("Exclude from dashboard metrics."),
        createdAt: t.integer(),
      })
      .describe("Financial accounts."),
    transaction_entry: t
      .table({
        type: t.text().default("expense").describe("expense | income | transfer | adjustment."),
        accountId: t.text().describe("References account.id."),
        accountCurrency: t.text().describe("Currency of `amount`, copied from the account."),
        amount: t.real().describe("Signed amount — see table description for sign conventions."),
        counterpartyAccountId: t.text().default("").describe("Destination account.id for transfers; empty otherwise."),
        counterpartyCurrency: t.text().default(""),
        counterpartyAmount: t.real().nullable().describe("Positive destination amount for transfers."),
        title: t.text().default(""),
        category: t.text().default("").describe("Category; empty for transfers."),
        importance: t
          .enum(["fixed", "flexible", "optional", "investment"])
          .nullable()
          .default(null)
          .describe("Expense tier; null for other types or unset."),
        notes: t.text().default(""),
        effectiveAt: t.integer().describe("Transaction time; use for date filtering."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
        providerType: t
          .text()
          .nullable()
          .default(null)
          .describe('External provider (e.g. "monobank"); null for manual entries.'),
        providerId: t.text().nullable().default(null).describe("Provider-side transaction id; null otherwise."),
      })
      .describe(
        [
          "Financial transactions. Amount is in the account currency: negative for expenses and transfer sources,",
          "positive for income, either sign for adjustments. Transfers set counterparty fields; otherwise",
          "counterpartyAccountId is empty and counterpartyAmount is null.",
        ].join(" "),
      ),
    conversation: t
      .table({
        title: t.text().default(""),
        createdAt: t.integer(),
        updatedAt: t.integer(),
        model: t.text().nullable().default(null).describe("Model id, fixed after the first message."),
        reasoningEffort: t.text().nullable().default(null).describe("Optional reasoning effort override."),
        totalCost: t.real().default(0).describe("Cumulative cost in USD."),
        totalTokens: t.integer().default(0).describe("Cumulative tokens."),
      })
      .describe("Assistant conversations and usage."),
    memory: t
      .table({
        content: t.text().describe("Short, durable user fact or preference."),
        source: t.enum(["user", "assistant"]).default("user").describe("Who created it."),
        enabled: t.boolean().default(true).describe("False keeps it but omits it from assistant context."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Durable user facts and preferences. Enabled rows enter every assistant turn; use memory tools, not mutateDb.",
        ].join(" "),
      ),
    skill: t
      .table({
        name: t.text().default(""),
        whenToUse: t.text().default("").describe("When this skill applies."),
        instructions: t.text().default("").describe("Markdown playbook."),
        source: t.enum(["user", "assistant"]).default("user"),
        status: t
          .enum(["pending", "active", "disabled"])
          .default("pending")
          .describe("active is loadable; pending awaits review; disabled is muted."),
        lastUsedAt: t.integer().nullable().default(null),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Reusable assistant playbooks. New assistant-created skills start pending; only active skills are loadable.",
        ].join(" "),
      ),
    monobank_connection: t
      .table({
        providerConnectionId: t.text().describe("Mirrors the central-D1 Monobank connection id."),
        status: t.text().default("connected").describe("connected | disconnected | error."),
        webhookStatus: t.text().default("pending").describe("pending | active | error."),
        displayName: t.text().default(""),
        lastError: t.text().default("").describe("Latest error; empty when healthy."),
        connectedAt: t.integer().default(0),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        ["Monobank connection metadata. Tokens are only in central D1; at most one is active per user."].join(" "),
      ),
    monobank_account: t
      .table({
        providerConnectionId: t.text().describe("References monobank_connection.providerConnectionId."),
        providerAccountId: t.text().describe("Monobank account id."),
        displayName: t.text().default(""),
        accountType: t.text().default(""),
        currency: t.text().default("").describe('ISO 4217 code, or "" when unsupported.'),
        maskedPan: t.text().default(""),
        linkedAccountId: t.text().default("").describe("In-app account.id to import into; empty when unlinked."),
        enabled: t.boolean().default(true).describe("Whether imports are enabled."),
        lastWebhookAt: t.integer().nullable().default(null),
        lastImportAt: t.integer().nullable().default(null).describe("Last transaction import time."),
        lastError: t.text().default("").describe("Latest import/link error; empty when healthy."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Monobank account metadata. Each remote account links to one in-app account; no balances are stored here.",
        ].join(" "),
      ),
    calendar_connection: t
      .table({
        providerConnectionId: t.text().describe("Mirrors the central-D1 Google Calendar connection id."),
        status: t.text().default("connected").describe("connected | disconnected | error."),
        email: t.text().default(""),
        connectedAt: t.integer().default(0),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe("One row per Google account. OAuth tokens are in D1; sync diagnostics are in DO storage."),
    calendar_source: t
      .table({
        providerConnectionId: t.text().describe("References calendar_connection.providerConnectionId."),
        providerCalendarId: t.text().describe("Google calendar id."),
        displayName: t.text().default(""),
        color: t.text().default(""),
        isPrimary: t.boolean().default(false),
        timeZone: t.text().default("").describe("IANA zone for all-day dates."),
        enabled: t.boolean().default(false).describe("Mirror events into tasks."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Calendars visible to a Google account. Enabled rows mirror events one-way into item tasks; events are not stored here.",
        ].join(" "),
      ),
    dashboard_settings: t
      .table({
        rangeMode: t.enum(["days", "cycle"]).default("days"),
        rangeDays: t.integer().default(30).describe('Trailing length when rangeMode is "days".'),
        cycleDay: t.integer().default(25).describe("Cycle start day of month."),
        baseCurrency: t.text().default("USD").describe("Dashboard totals currency."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe("Synced singleton dashboard preferences."),
    habit: t
      .table({
        name: t.text().default(""),
        scheduleType: t
          .enum(["daily", "weekly", "monthly", "everyNDays", "weekdays", "monthDays"])
          .default("daily")
          .describe(
            [
              'Due cadence; "weekdays" uses scheduleWeekdays, "monthDays" uses scheduleMonthDays,',
              'and "everyNDays" uses scheduleInterval.',
            ].join(" "),
          ),
        scheduleInterval: t.integer().default(1).describe('Days between completions for "everyNDays".'),
        scheduleWeekdays: t.text().default("[]").describe('ISO weekday numbers (1=Mon … 7=Sun) for "weekdays".'),
        scheduleMonthDays: t
          .text()
          .default("[]")
          .describe(
            [
              'Day-of-month numbers (1–31) for "monthDays". Days past the end of a short month',
              "clamp to that month's last day.",
            ].join(" "),
          ),
        timeOfDay: t
          .enum(["morning", "afternoon", "evening", "night"])
          .nullable()
          .default(null)
          .describe("Preferred time; null means anytime."),
        target: t
          .real()
          .default(1)
          .describe("Goal: per day except weekly/monthly, which sum the calendar period. 1 is a check-off."),
        unit: t.text().default("").describe("Optional target unit."),
        order: t.real().default(0),
        archivedAt: t
          .integer()
          .nullable()
          .default(null)
          .describe("Archive time; null if active. Habits are never hard-deleted."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(
        [
          "Recurring habits. habit_entry values count toward target per day, except weekly/monthly habits, which",
          "accumulate over their calendar period. Archive with archivedAt.",
        ].join(" "),
      ),
    note_view: t
      .table({
        name: t.text().default(""),
        include: t.text().default("[]").describe('Required tags. Pseudo-tag ":untagged" matches notes without tags.'),
        exclude: t.text().default("[]").describe("Tags that always hide a note."),
        match: t.enum(["all", "any"]).default("all").describe("Whether include requires all tags or any tag."),
        status: t
          .enum(["pending", "completed", "overdue"])
          .nullable()
          .default(null)
          .describe("Legacy sync field; leave null."),
        order: t.real().default(0),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(["Saved named tag filters for notes; stores no notes."].join(" ")),
    habit_entry: t
      .table({
        habitId: t.text().describe("References habit.id."),
        date: t.text().describe('Local calendar day as "YYYY-MM-DD".'),
        value: t.real().default(0).describe("Amount logged on this date."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
      })
      .describe(["Per-day habit progress; one logical entry per (habitId, date)."].join(" ")),
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
