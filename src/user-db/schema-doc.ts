import type { SchemaDocContext } from "@sqlite-sync/ai";

export const userDbSchemaDocContext: SchemaDocContext = {
  overview: [
    "# User database schema",
    "",
    "This is a personal productivity app for notes, financial accounts, and transactions.",
    "All `id` columns are UUIDs and all timestamps (`createdAt`, `updatedAt`, `effectiveAt`)",
    "are unix epoch milliseconds.",
  ].join("\n"),
  tables: {
    item: {
      description: "The user's notes.",
      columns: {
        type: 'Currently always "note".',
        title: "Note title (may be empty for untitled notes).",
        content: "Note body as markdown. Can be long — avoid selecting it unless needed.",
        order: "Manual sort position, ascending.",
      },
    },
    account: {
      description: "Financial accounts (bank accounts, cash, etc.).",
      columns: {
        currency: 'ISO 4217 currency code, e.g. "USD".',
        initialBalance: "Starting balance in the account currency.",
        balance: "Current balance in the account currency, kept up to date by the app as transactions change.",
        description: "User-provided account name/description.",
        labelText: "Short display label shown on the account card.",
        labelColor: "Hex color of the display label.",
        order: "Manual sort position, ascending.",
      },
    },
    transaction_entry: {
      description: [
        "Financial transactions. `type` is one of: expense, income, transfer, adjustment.",
        "`amount` is signed and in the account's currency: negative for expenses and for the source",
        "side of transfers, positive for income, either sign for adjustments. Transfers also set",
        "`counterpartyAccountId` (destination account), `counterpartyCurrency`, and `counterpartyAmount`",
        "(positive, in the destination currency); for all other types `counterpartyAccountId` is an",
        "empty string and `counterpartyAmount` is NULL.",
      ].join(" "),
      columns: {
        type: "expense | income | transfer | adjustment.",
        accountId: "References account.id.",
        accountCurrency: "Currency of `amount` (copied from the account).",
        amount: "Signed amount — see table description for sign conventions.",
        counterpartyAccountId: "Destination account.id for transfers, empty string otherwise.",
        counterpartyAmount: "Positive amount received by the destination account (transfers only).",
        category: "Free-form category for expenses/incomes (empty for transfers).",
        notes: "Free-form notes.",
        effectiveAt: "When the transaction happened — use this for date filtering, not createdAt.",
      },
    },
    currency_rate: {
      description: [
        "Daily exchange rates, one row per (date, baseCurrency). `baseCurrency` is currently always",
        '"USD"; each currency-code column holds how many units of that currency equal 1 unit of the',
        "base currency on that date (NULL if unavailable). To convert between two non-USD currencies,",
        "go through the base: amountInB = amountInA / rateA * rateB. Rows are appended roughly daily;",
        "use the row with the latest `date` for current rates.",
      ].join(" "),
      columns: {
        date: 'Rate date as "YYYY-MM-DD".',
        baseCurrency: 'Currently always "USD".',
      },
    },
    conversation: {
      description: "Index of the user's conversations with this assistant (titles and timestamps).",
    },
  },
};
