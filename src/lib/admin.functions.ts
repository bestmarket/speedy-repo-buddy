/**
 * Admin panel server actions: AI provider registry, engine defaults,
 * Zero-Cost Mode and usage telemetry. Every action is admin-gated.
 */
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminProvider = {
  id: string;
  category: "llm" | "tts" | "image";
  label: string;
  tier: "free" | "premium";
  zero_cost: boolean;
  requires_key: boolean;
  enabled: boolean;
  has_key: boolean;
  sort_order: number;
};

export type AdminTelemetry = {
  totalCalls: number;
  failedCalls: number;
  totalCostUsd: number;
  last30dCalls: number;
  byCategory: { category: string; calls: number; costUsd: number }[];
  byProvider: { provider: string; calls: number; costUsd: number }[];
};

export type AdminData = {
  providers: AdminProvider[];
  defaults: { llm: string; tts: string; image: string };
  zeroCostMode: boolean;
  telemetry: AdminTelemetry;
};

async function isAdminUser(
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => unknown },
  userId: string,
) {
  const { data } = (await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  })) as { data: boolean | null };
  return data === true;
}

async function assertAdmin(context: { supabase: never; userId: string }) {
  const ok = await isAdminUser(context.supabase, context.userId);
  if (!ok) throw new Error("Admins only.");
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Tells the UI whether the signed-in person is an admin, and whether the first admin seat is still free. */
export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);

    const admin = await db();
    const { count } = await admin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    return { isAdmin, canClaim: !isAdmin && (count ?? 0) === 0 };
  });

/** Grants the admin role to the signed-in account, but only while no admin exists yet. */
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await db();
    const { count } = await admin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) throw new Error("An admin already exists for this app.");

    const { error } = await admin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);

    return { isAdmin: true };
  });

/** Everything the admin dashboard renders: providers, defaults, Zero-Cost Mode and telemetry. */
export const getAdminData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminData> => {
    await assertAdmin(context);
    const admin = await db();

    const [providersRes, settingsRes, eventsRes] = await Promise.all([
      admin.from("ai_providers").select("*").order("sort_order"),
      admin.from("ai_settings").select("*"),
      admin
        .from("usage_events")
        .select("category, provider, cost_usd, success, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    const providers: AdminProvider[] = (providersRes.data ?? []).map((row) => {
      const p = row as Record<string, unknown>;
      return {
        id: String(p["id"]),
        category: p["category"] as AdminProvider["category"],
        label: String(p["label"]),
        tier: p["tier"] as AdminProvider["tier"],
        zero_cost: Boolean(p["zero_cost"]),
        requires_key: Boolean(p["requires_key"]),
        enabled: Boolean(p["enabled"]),
        has_key: Boolean(p["api_key"]),
        sort_order: Number(p["sort_order"] ?? 0),
      };
    });

    const settings = new Map(
      (settingsRes.data ?? []).map((row) => {
        const s = row as Record<string, unknown>;
        return [String(s["key"]), s["value"]];
      }),
    );
    const rawDefaults = (settings.get("defaults") ?? {}) as Record<string, string>;
    const defaults = {
      llm: rawDefaults["llm"] ?? "gemini-flash",
      tts: rawDefaults["tts"] ?? "edge-tts",
      image: rawDefaults["image"] ?? "pollinations",
    };
    const zeroCostMode = Boolean(
      (settings.get("zero_cost_mode") as { enabled?: boolean } | undefined)?.enabled,
    );

    const events = (eventsRes.data ?? []) as {
      category: string;
      provider: string;
      cost_usd: number | string;
      success: boolean;
      created_at: string;
    }[];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const byCategory = new Map<string, { calls: number; costUsd: number }>();
    const byProvider = new Map<string, { calls: number; costUsd: number }>();
    let totalCostUsd = 0;
    let failedCalls = 0;
    let last30dCalls = 0;

    for (const event of events) {
      const cost = Number(event.cost_usd ?? 0);
      totalCostUsd += cost;
      if (!event.success) failedCalls += 1;
      if (new Date(event.created_at).getTime() >= cutoff) last30dCalls += 1;

      const cat = byCategory.get(event.category) ?? { calls: 0, costUsd: 0 };
      byCategory.set(event.category, { calls: cat.calls + 1, costUsd: cat.costUsd + cost });
      const prov = byProvider.get(event.provider) ?? { calls: 0, costUsd: 0 };
      byProvider.set(event.provider, { calls: prov.calls + 1, costUsd: prov.costUsd + cost });
    }

    return {
      providers,
      defaults,
      zeroCostMode,
      telemetry: {
        totalCalls: events.length,
        failedCalls,
        totalCostUsd,
        last30dCalls,
        byCategory: [...byCategory].map(([category, v]) => ({ category, ...v })),
        byProvider: [...byProvider]
          .map(([provider, v]) => ({ provider, ...v }))
          .sort((a, b) => b.calls - a.calls),
      },
    };
  });

const SaveProvider = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  apiKey: z.string().optional(),
  clearKey: z.boolean().optional(),
});

/** Saves one provider's on/off switch and its API key. */
export const saveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveProvider.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await db();

    const patch: { updated_at: string; enabled?: boolean; api_key?: string | null } = {
      updated_at: new Date().toISOString(),
    };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (data.clearKey) patch.api_key = null;
    else if (data.apiKey && data.apiKey.trim()) patch.api_key = data.apiKey.trim();

    const { error } = await admin.from("ai_providers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    const { clearConfigCache } = await import("./aiConfig.server");
    clearConfigCache();
    return { ok: true };
  });

const SetDefaults = z.object({
  llm: z.string().min(1),
  tts: z.string().min(1),
  image: z.string().min(1),
});

/** Chooses which engine each kind of AI work uses. */
export const setEngineDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetDefaults.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await db();
    const { error } = await admin
      .from("ai_settings")
      .upsert({ key: "defaults", value: data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);

    const { clearConfigCache } = await import("./aiConfig.server");
    clearConfigCache();
    return { ok: true };
  });

/** Turns Zero-Cost Mode on or off (free engines only). */
export const setZeroCostMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await db();
    const { error } = await admin.from("ai_settings").upsert({
      key: "zero_cost_mode",
      value: { enabled: data.enabled },
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    const { clearConfigCache } = await import("./aiConfig.server");
    clearConfigCache();
    return { ok: true };
  });

/** Sends one tiny request through the current writing engine so the admin can confirm routing works. */
export const testAiRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { resolveProvider } = await import("./aiConfig.server");
    const { askAI } = await import("./ai.server");
    const provider = await resolveProvider("llm");
    const started = Date.now();
    const reply = await askAI(
      "You are a test probe. Answer with a single short sentence.",
      "Reply with: routing works.",
    );
    return {
      provider: provider.label,
      zeroCostMode: provider.zeroCostMode,
      ms: Date.now() - started,
      reply: reply.slice(0, 200),
    };
  });
