/**
 * Admin-controlled AI provider configuration.
 * Reads the provider registry, toggles and Zero-Cost Mode set in /admin and
 * resolves which engine every AI call in the app must use.
 */

export type Category = "llm" | "tts" | "image";

export type ProviderRow = {
  id: string;
  category: Category;
  label: string;
  tier: "free" | "premium";
  zero_cost: boolean;
  requires_key: boolean;
  enabled: boolean;
  api_key: string | null;
  sort_order: number;
};

export type ResolvedProvider = {
  id: string;
  label: string;
  category: Category;
  apiKey: string | null;
  zeroCostMode: boolean;
};

const CACHE_MS = 15_000;
let cache: { at: number; providers: ProviderRow[]; defaults: Record<string, string>; zeroCost: boolean } | null =
  null;

const FALLBACK_DEFAULTS: Record<Category, string> = {
  llm: "gemini-flash",
  tts: "edge-tts",
  image: "pollinations",
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadConfig(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;

  const db = await admin();
  const [providers, settings] = await Promise.all([
    db.from("ai_providers").select("*").order("sort_order"),
    db.from("ai_settings").select("*"),
  ]);

  const rows = (providers.data ?? []) as unknown as ProviderRow[];
  const settingsMap = new Map((settings.data ?? []).map((row) => [row.key, row.value as never]));
  const defaults = {
    ...FALLBACK_DEFAULTS,
    ...((settingsMap.get("defaults") as Record<string, string> | undefined) ?? {}),
  };
  const zeroCost = Boolean(
    (settingsMap.get("zero_cost_mode") as { enabled?: boolean } | undefined)?.enabled,
  );

  cache = { at: Date.now(), providers: rows, defaults, zeroCost };
  return cache;
}

export function clearConfigCache() {
  cache = null;
}

/** Picks the provider the admin assigned for a category, honouring toggles and Zero-Cost Mode. */
export async function resolveProvider(category: Category): Promise<ResolvedProvider> {
  const config = await loadConfig();
  const pool = config.providers.filter((p) => p.category === category);

  const usable = (p: ProviderRow | undefined): p is ProviderRow => {
    if (!p || !p.enabled) return false;
    if (config.zeroCost && !p.zero_cost) return false;
    if (p.requires_key && !p.api_key) return false;
    return true;
  };

  const chosenId = config.defaults[category];
  const preferred = pool.find((p) => p.id === chosenId);
  const winner =
    (usable(preferred) ? preferred : undefined) ??
    pool.find((p) => usable(p) && p.zero_cost) ??
    pool.find(usable);

  if (winner) {
    return {
      id: winner.id,
      label: winner.label,
      category,
      apiKey: winner.api_key,
      zeroCostMode: config.zeroCost,
    };
  }

  // Nothing configured/usable: fall back to the built-in Lovable AI engines.
  return {
    id: "lovable",
    label: "Lovable AI (built-in)",
    category,
    apiKey: null,
    zeroCostMode: config.zeroCost,
  };
}

const UNIT_COST: Record<string, number> = {
  "openai-gpt4o": 0.01,
  "claude-sonnet": 0.012,
  "gemini-flash": 0,
  elevenlabs: 0.03,
  "edge-tts": 0,
  kokoro: 0,
  pollinations: 0,
  huggingface: 0,
  "fal-flux": 0.008,
  replicate: 0.012,
  lovable: 0.004,
};

/** Records one AI call for the admin telemetry dashboard. */
export async function logUsage(params: {
  category: Category | "render";
  provider: string;
  userId?: string | null;
  units?: number;
  success?: boolean;
}) {
  try {
    const db = await admin();
    await db.from("usage_events").insert({
      category: params.category,
      provider: params.provider,
      user_id: params.userId ?? null,
      units: params.units ?? 1,
      cost_usd: (UNIT_COST[params.provider] ?? 0) * (params.units ?? 1),
      success: params.success ?? true,
    });
  } catch {
    /* telemetry must never break a generation */
  }
}
