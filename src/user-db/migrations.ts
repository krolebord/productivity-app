import { createMigrations, defineSyncSchema, t } from "@sqlite-sync/core";

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
}));

const currencyColumn = () => t.real().nullable();

export const syncDbSchema = defineSyncSchema({
  tables: {
    item: t
      .table({
        type: t.text().default("note").describe('Currently always "note".'),
        title: t.text().describe("Note title (may be empty for untitled notes)."),
        createdAt: t.integer(),
        content: t
          .text()
          .nullable()
          .default("")
          .describe("Note body as markdown. Can be long — avoid selecting it unless needed."),
        order: t.real().nullable().default(0).describe("Manual sort position, ascending."),
      })
      .describe("The user's notes."),
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
        notes: t.text().default("").describe("Free-form notes."),
        effectiveAt: t
          .integer()
          .describe("When the transaction happened — use this for date filtering, not createdAt."),
        createdAt: t.integer(),
        updatedAt: t.integer(),
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
      })
      .describe("Index of the user's conversations with this assistant (titles and timestamps)."),
  },
  migrations,
});

export type NoteItem = typeof syncDbSchema.tables.item.$row;
export type CurrencyRateItem = typeof syncDbSchema.tables.currency_rate.$row;
export type AccountItem = typeof syncDbSchema.tables.account.$row;
export type TransactionEntryItem = typeof syncDbSchema.tables.transaction_entry.$row;
export type ConversationItem = typeof syncDbSchema.tables.conversation.$row;

export type UserDb = (typeof syncDbSchema)["~clientSchema"];

export type UserSyncDbSchema = typeof syncDbSchema;
