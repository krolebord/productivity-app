import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ServerSyncDb } from "@sqlite-sync/cloudflare";
import type { SQLiteTransactionWrapper } from "@sqlite-sync/core";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { ImportanceTier } from "@/lib/transactions";
import type { UserDb, UserSyncDbSchema } from "@/user-db/migrations";
import type { MappedMonobankTransaction } from "./mapping";
import { MONOBANK_PROVIDER_TYPE } from "./types";

type ClientMonobankDb = Pick<SQLiteTransactionWrapper<UserDb>, "executeKysely">;
type ServerMonobankDb = Pick<ServerSyncDb<UserSyncDbSchema>, "executeKysely">;
type MonobankClassificationEnv = Pick<Env, "OPENROUTER_API_KEY">;

const MONOBANK_CATEGORY_MODEL = "deepseek/deepseek-v4-flash";
const OTHER_CATEGORY = "Other";

export type MonobankClassification = {
  category: string;
  importance: ImportanceTier | null;
};

type MonobankClassificationCandidate = {
  category: string;
};

export function inferClientMonobankClassification(
  db: ClientMonobankDb,
  transaction: Pick<MappedMonobankTransaction, "title">,
): MonobankClassification {
  const candidate = findLatestClientCategoryCandidateByTitle(db, transaction.title);

  return classifyMonobankTransaction(candidate);
}

export async function inferServerMonobankClassification(
  db: ServerMonobankDb,
  env: MonobankClassificationEnv,
  transaction: Pick<MappedMonobankTransaction, "title" | "type" | "amount" | "mcc">,
): Promise<MonobankClassification> {
  const candidate = findLatestServerCategoryCandidateByTitle(db, transaction.title);
  if (candidate) {
    return classifyMonobankTransaction(candidate);
  }

  const category = await inferCategoryWithLlm(db, env, transaction);

  return classifyMonobankTransaction(category ? { category } : null);
}

function classifyMonobankTransaction(candidate: MonobankClassificationCandidate | null): MonobankClassification {
  return {
    category: candidate?.category.trim() ?? "",
    importance: null,
  };
}

function findLatestClientCategoryCandidateByTitle(
  db: ClientMonobankDb,
  title: string,
): MonobankClassificationCandidate | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return null;
  }

  const { rows } = db.executeKysely((q) =>
    q
      .selectFrom("transaction_entry")
      .select(["category"])
      .where("providerType", "=", MONOBANK_PROVIDER_TYPE)
      .where("title", "=", trimmedTitle)
      .where("category", "!=", "")
      .orderBy("effectiveAt", "desc")
      .limit(1),
  );

  return rows[0] ?? null;
}

function findLatestServerCategoryCandidateByTitle(
  db: ServerMonobankDb,
  title: string,
): MonobankClassificationCandidate | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return null;
  }

  const { rows } = db.executeKysely((q) =>
    q
      .selectFrom("transaction_entry")
      .select(["category"])
      .where("providerType", "=", MONOBANK_PROVIDER_TYPE)
      .where("title", "=", trimmedTitle)
      .where("category", "!=", "")
      .orderBy("effectiveAt", "desc")
      .limit(1),
  );

  return rows[0] ?? null;
}

function getExistingCategories(db: ServerMonobankDb): string[] {
  return db
    .executeKysely((q) =>
      q
        .selectFrom("transaction_entry")
        .select("category")
        .where("category", "!=", "")
        .groupBy("category")
        .orderBy("category", "asc"),
    )
    .rows.map((row) => row.category);
}

async function inferCategoryWithLlm(
  db: ServerMonobankDb,
  env: MonobankClassificationEnv,
  transaction: Pick<MappedMonobankTransaction, "title" | "type" | "amount" | "mcc">,
): Promise<string> {
  const categories = getExistingCategories(db).filter((category) => category !== OTHER_CATEGORY);
  if (categories.length === 0 || !transaction.title.trim()) {
    return "";
  }

  const categoryOptions = [OTHER_CATEGORY, ...categories] as [string, ...string[]];

  try {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const { output } = await generateText({
      model: openrouter.chat(MONOBANK_CATEGORY_MODEL),
      output: Output.object({
        schema: z.object({
          category: z.enum(categoryOptions),
        }),
      }),
      system:
        "Classify Monobank card transactions. Return an existing category only when it clearly fits. Return Other when none fit.",
      prompt: JSON.stringify({
        transaction: {
          title: transaction.title,
          type: transaction.type,
          amount: transaction.amount,
          mcc: transaction.mcc ?? null,
        },
        allowedCategories: categoryOptions,
      }),
    });

    return output.category === OTHER_CATEGORY ? "" : output.category;
  } catch (error) {
    console.warn("[monobank-import] category inference failed", {
      title: transaction.title,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}
