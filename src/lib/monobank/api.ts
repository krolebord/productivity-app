import { z } from "zod";
import { type MonobankStatementItem, monobankStatementItemSchema } from "./types";

const MONOBANK_API_BASE_URL = "https://api.monobank.ua";

const clientAccountSchema = z.object({
  id: z.string(),
  type: z.string().default(""),
  currencyCode: z.number(),
  maskedPan: z.array(z.string()).default([]),
});

const clientInfoSchema = z.object({
  name: z.string().default(""),
  accounts: z.array(clientAccountSchema).default([]),
});

export type MonobankClientAccount = z.infer<typeof clientAccountSchema>;
export type MonobankClientInfo = z.infer<typeof clientInfoSchema>;

export class MonobankApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MonobankApiError";
  }
}

async function monobankRequest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${MONOBANK_API_BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Token": token,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (error) {
    throw new MonobankApiError(error instanceof Error ? error.message : "Monobank request failed.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const json = (await response.json()) as { errorDescription?: string };
      detail = json?.errorDescription ? `: ${json.errorDescription}` : "";
    } catch {
      // ignore non-JSON error bodies
    }
    throw new MonobankApiError(
      `Monobank API request failed (${response.status} ${response.statusText})${detail}.`,
      response.status,
    );
  }

  // Set-webhook returns an empty-ish body; only parse when there is content.
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Validate a token and fetch the client's accounts. Throws {@link MonobankApiError} on failure. */
export async function fetchMonobankClientInfo(token: string): Promise<MonobankClientInfo> {
  const json = await monobankRequest(token, "/personal/client-info");
  return clientInfoSchema.parse(json);
}

/** Register the statement webhook URL. Monobank verifies the URL with a GET that must return 200. */
export async function setMonobankWebhook(token: string, webHookUrl: string): Promise<void> {
  await monobankRequest(token, "/personal/webhook", {
    method: "POST",
    body: { webHookUrl },
  });
}

/** Best-effort clearing of the statement webhook (an empty URL removes it). */
export async function clearMonobankWebhook(token: string): Promise<void> {
  await monobankRequest(token, "/personal/webhook", {
    method: "POST",
    body: { webHookUrl: "" },
  });
}

/**
 * Fetch a statement window for an account. Monobank caps the range at 31 days + 1 hour and rate
 * limits to one request per 60s (a 429 surfaces as a {@link MonobankApiError} with `status` 429).
 */
export async function fetchMonobankStatement(
  token: string,
  account: string,
  fromSeconds: number,
  toSeconds?: number,
): Promise<MonobankStatementItem[]> {
  const suffix = toSeconds === undefined ? "" : `/${toSeconds}`;
  const json = await monobankRequest(token, `/personal/statement/${account}/${fromSeconds}${suffix}`);
  return z.array(monobankStatementItemSchema).parse(json);
}
