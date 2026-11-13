/**
 * Scrapes model metadata from OpenRouter for the models declared in
 * `src/agent/supported-models.ts` and writes a ready-to-use `src/agent/models.gen.ts`.
 *
 * Editorial fields (name, selectable, aliases, reasoningEffort override, default) come
 * from the seed; factual fields (pricing, input modalities, supported reasoning efforts,
 * intelligence score) come from OpenRouter. On any drift, OpenRouter wins silently.
 *
 * Run with `pnpm sync:models`.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SUPPORTED_MODELS, type SupportedModel } from "../src/agent/supported-models";

const seeds: readonly SupportedModel[] = SUPPORTED_MODELS;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OUTPUT_PATH = fileURLToPath(new URL("../src/agent/models.gen.ts", import.meta.url));

const INPUT_MODALITIES = ["text", "image", "file", "audio", "video"] as const;
type InputModality = (typeof INPUT_MODALITIES)[number];

// `max` is deliberately left out: the assistant never needs it, so models top out at `xhigh`.
const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

type OpenRouterModel = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[] };
  pricing?: Record<string, string>;
  reasoning?: { supported_efforts?: string[]; default_effort?: string };
  benchmarks?: { artificial_analysis?: { intelligence_index?: number } };
};

/** OpenRouter prices are per-token strings; scale to per-million and drop float noise. */
function perMillion(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (n === 0) return 0;
  if (!Number.isFinite(n)) return undefined;
  return Number.parseFloat((n * 1_000_000).toPrecision(6));
}

function pickModalities(raw: string[] | undefined): InputModality[] {
  const set = new Set(raw ?? []);
  return INPUT_MODALITIES.filter((m) => set.has(m));
}

function pickEfforts(raw: string[] | undefined): ReasoningEffort[] {
  const set = new Set(raw ?? []);
  return REASONING_EFFORTS.filter((e) => set.has(e));
}

function stripProviderPrefix(name: string): string {
  const idx = name.indexOf(": ");
  return idx === -1 ? name : name.slice(idx + 2);
}

async function fetchOpenRouterModels(): Promise<Map<string, OpenRouterModel>> {
  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data: OpenRouterModel[] };
  return new Map(body.data.map((m) => [m.id, m]));
}

type GeneratedModel = {
  id: string;
  label: string;
  inputModalities: InputModality[];
  pricing: { inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion?: number };
  intelligenceScore?: number;
  supportedReasoningEfforts?: ReasoningEffort[];
  reasoningEffort?: ReasoningEffort;
  selectableReasoning?: boolean;
  selectable?: boolean;
  aliases?: string[];
};

function buildModel(seed: SupportedModel, remote: OpenRouterModel): GeneratedModel {
  const input = perMillion(remote.pricing?.prompt) ?? 0;
  const output = perMillion(remote.pricing?.completion) ?? 0;
  const cacheRead = perMillion(remote.pricing?.input_cache_read);

  const supportedReasoningEfforts = pickEfforts(remote.reasoning?.supported_efforts);
  const defaultEffort =
    pickEfforts(remote.reasoning?.default_effort ? [remote.reasoning.default_effort] : [])[0] ??
    supportedReasoningEfforts.at(-1);
  const intelligenceScore = remote.benchmarks?.artificial_analysis?.intelligence_index;

  const model: GeneratedModel = {
    id: seed.id,
    label: seed.name ?? stripProviderPrefix(remote.name ?? seed.id),
    inputModalities: pickModalities(remote.architecture?.input_modalities),
    pricing:
      cacheRead === undefined
        ? { inputPerMillion: input, outputPerMillion: output }
        : { inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: cacheRead },
  };

  if (typeof intelligenceScore === "number") model.intelligenceScore = intelligenceScore;
  if (supportedReasoningEfforts.length > 0) model.supportedReasoningEfforts = supportedReasoningEfforts;

  const reasoningEffort = seed.reasoningEffort ?? defaultEffort;
  if (reasoningEffort) model.reasoningEffort = reasoningEffort;

  if (seed.selectableReasoning !== undefined) model.selectableReasoning = seed.selectableReasoning;
  if (seed.selectable === false) model.selectable = false;
  if (seed.aliases && seed.aliases.length > 0) model.aliases = [...seed.aliases];

  return model;
}

function defaultModelId(seeds: readonly SupportedModel[]): string {
  const defaults = seeds.filter((m) => m.default);
  const selected = defaults[0];
  if (defaults.length !== 1 || !selected) {
    throw new Error(`Exactly one model must be marked \`default\` in supported-models.ts (found ${defaults.length}).`);
  }
  return selected.id;
}

function validateAliases(seeds: readonly SupportedModel[]): void {
  const catalogIds = new Set(seeds.map((seed) => seed.id));
  const claimed = new Map<string, string>();
  for (const seed of seeds) {
    for (const alias of seed.aliases ?? []) {
      if (catalogIds.has(alias)) {
        throw new Error(`Alias ${JSON.stringify(alias)} on ${seed.id} collides with a catalog id.`);
      }
      const existing = claimed.get(alias);
      if (existing) {
        throw new Error(`Alias ${JSON.stringify(alias)} is claimed by both ${existing} and ${seed.id}.`);
      }
      claimed.set(alias, seed.id);
    }
  }
}

function serialize(models: GeneratedModel[], defaultModelId: string): string {
  const body = JSON.stringify(models, null, 2)
    // Quote only where needed: drop quotes around plain identifier keys.
    .replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, "$1:");

  return `// Generated by scripts/sync-models.ts — do not edit by hand.
// Run \`pnpm sync:models\` to refresh from OpenRouter.
import type { AssistantModel, AssistantModelId } from "./models";

export const ASSISTANT_MODELS = ${body} satisfies AssistantModel[];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = ${JSON.stringify(defaultModelId)};
`;
}

async function main() {
  const remote = await fetchOpenRouterModels();

  const missing = seeds.filter((m) => !remote.has(m.id)).map((m) => m.id);
  if (missing.length > 0) {
    throw new Error(`Models not found on OpenRouter:\n  ${missing.join("\n  ")}`);
  }

  validateAliases(seeds);
  const defaultId = defaultModelId(seeds);

  // biome-ignore lint/style/noNonNullAssertion: presence checked above.
  const models = seeds.map((seed) => buildModel(seed, remote.get(seed.id)!));

  await writeFile(OUTPUT_PATH, serialize(models, defaultId), "utf8");
  console.log(`Wrote ${models.length} models to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
