import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Scene = {
  narration: string;
  visual: string;
  imagePath?: string | null;
  audioPath?: string | null;
};

export type ChannelProfile = {
  niche: string;
  audience: string;
  tone: string;
  hookStyle: string;
  pacing: string;
  typicalLength: string;
  visualStyle: string;
};

const VOICES: Record<string, string> = {
  warm: "Kore",
  bright: "Puck",
  deep: "Charon",
  calm: "Aoede",
};

export type VideoStyle = {
  id: string;
  label: string;
  blurb: string;
  look: string;
  swatch: string;
};

/** The looks a video can be produced in. Each one steers every scene image. */
export const VIDEO_STYLES: VideoStyle[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    blurb: "Filmic depth, moody lighting, shallow focus.",
    look: "cinematic photography, 35mm film look, shallow depth of field, dramatic rim lighting, rich contrast",
    swatch: "linear-gradient(135deg, oklch(0.32 0.06 260), oklch(0.55 0.13 30))",
  },
  {
    id: "documentary",
    label: "Documentary",
    blurb: "Natural, journalistic, true to life.",
    look: "documentary photography, natural daylight, candid framing, realistic textures, muted colour grade",
    swatch: "linear-gradient(135deg, oklch(0.45 0.04 150), oklch(0.72 0.07 90))",
  },
  {
    id: "anime",
    label: "Anime",
    blurb: "Hand-drawn cels, bold colour, expressive.",
    look: "anime cel illustration, clean linework, vivid saturated colour, dramatic skies, studio animation quality",
    swatch: "linear-gradient(135deg, oklch(0.62 0.19 300), oklch(0.78 0.15 220))",
  },
  {
    id: "3d",
    label: "3D animation",
    blurb: "Glossy characters, soft studio light.",
    look: "stylised 3D animated render, soft global illumination, glossy surfaces, friendly character design, high detail",
    swatch: "linear-gradient(135deg, oklch(0.6 0.16 30), oklch(0.8 0.14 90))",
  },
  {
    id: "whiteboard",
    label: "Whiteboard",
    blurb: "Explainer sketches on clean white.",
    look: "clean whiteboard explainer illustration, black marker linework, two accent colours, plenty of white space, flat vector",
    swatch: "linear-gradient(135deg, oklch(0.97 0 0), oklch(0.72 0.12 250))",
  },
  {
    id: "retro",
    label: "Retro VHS",
    blurb: "Grain, glow and 80s colour.",
    look: "retro 1980s VHS aesthetic, scanlines, chromatic aberration, neon magenta and cyan glow, analogue grain",
    swatch: "linear-gradient(135deg, oklch(0.5 0.2 330), oklch(0.65 0.15 200))",
  },
];

export function styleLook(id: string | null | undefined): string {
  return (VIDEO_STYLES.find((s) => s.id === id) ?? VIDEO_STYLES[0]!).look;
}

/** Creates the user's channel workspace if they don't have one yet. */
export const getWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid().optional() }).optional().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const projectList = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (projectList.error) throw new Error(projectList.error.message);

    let projects = projectList.data ?? [];
    let project = data?.projectId
      ? projects.find((candidate) => candidate.id === data.projectId) ?? projects[0]
      : projects[0];
    if (!project) {
      const created = await supabase
        .from("projects")
        .insert({ user_id: userId, name: "My channel" })
        .select("*")
        .single();
      if (created.error) throw new Error(created.error.message);
      project = created.data;
      projects = [created.data];
    }

    const [sources, ideas, scripts, videos] = await Promise.all([
      supabase
        .from("sources")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("ideas")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("scripts")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("videos")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      project,
      projects,
      sources: sources.data ?? [],
      ideas: ideas.data ?? [],
      scripts: scripts.data ?? [],
      videos: videos.data ?? [],
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("projects")
      .insert({ user_id: context.userId, name: data.name })
      .select("*")
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const addSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        kind: z.enum(["link", "titles", "topic", "note"]),
        label: z.string().max(200).optional(),
        content: z.string().min(1).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const res = await supabase
      .from("sources")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        kind: data.kind,
        label: data.label ?? null,
        content: data.content,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("sources").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

async function loadSourceText(
  supabase: { from: (t: string) => any },
  projectId: string,
): Promise<string> {
  const res = await supabase.from("sources").select("kind,label,content").eq("project_id", projectId);
  const rows = (res.data ?? []) as Array<{ kind: string; label: string | null; content: string }>;
  if (rows.length === 0) throw new Error("Add at least one source first.");
  const parts = rows.map((r) => `[${r.kind}] ${r.label ?? ""}\n${r.content}`);

  // Fold in per-video analyses so the profile is built from real videos, not just links.
  const analysed = await supabase
    .from("source_videos")
    .select("title,analysis")
    .eq("project_id", projectId)
    .eq("status", "done");
  const videos = (analysed.data ?? []) as Array<{ title: string | null; analysis: unknown }>;
  for (const v of videos) {
    if (!v.analysis) continue;
    parts.push(`[analysed video] ${v.title ?? ""}\n${JSON.stringify(v.analysis)}`);
  }

  return parts.join("\n\n---\n\n");
}

/** Reads every source and builds the reusable channel profile. */
export const cloneChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase } = context;
    const sourceText = await loadSourceText(supabase, data.projectId);

    const profile = await askAIJson<ChannelProfile & { name: string }>(
      "You are a YouTube channel strategist. You study a channel's material and describe its formula precisely.",
      `Study this channel material and describe its formula.\n\n${sourceText}\n\nReturn JSON with keys: name (a short channel name), niche, audience, tone, hookStyle, pacing, typicalLength, visualStyle. Each value is one short sentence.`,
    );

    const res = await supabase
      .from("projects")
      .update({ channel_profile: profile, name: profile.name || "My channel" })
      .eq("id", data.projectId)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

/** Generates fresh video ideas in the cloned channel's voice. */
export const generateIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), count: z.number().int().min(1).max(12) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase, userId } = context;

    const project = await supabase
      .from("projects")
      .select("channel_profile")
      .eq("id", data.projectId)
      .single();
    if (project.error) throw new Error(project.error.message);
    if (!project.data.channel_profile) throw new Error("Clone the channel first.");

    const existing = await supabase.from("ideas").select("title").eq("project_id", data.projectId);
    const avoid = (existing.data ?? []).map((i) => i.title).join("; ");

    const ideas = await askAIJson<Array<{ title: string; hook: string; angle: string }>>(
      "You generate video ideas that match a channel's established formula exactly.",
      `Channel formula:\n${JSON.stringify(project.data.channel_profile)}\n\nGenerate ${data.count} new video ideas in this channel's voice.${avoid ? `\nDo not repeat these existing ideas: ${avoid}` : ""}\n\nReturn a JSON array. Each item: { "title": clickable title under 80 characters, "hook": the first spoken line, "angle": one sentence on what makes it work }.`,
    );

    const rows = ideas.slice(0, data.count).map((i) => ({
      project_id: data.projectId,
      user_id: userId,
      title: String(i.title).slice(0, 200),
      hook: String(i.hook ?? "").slice(0, 500),
      angle: String(i.angle ?? "").slice(0, 500),
    }));

    const res = await supabase.from("ideas").insert(rows).select("*");
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const toggleIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), selected: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("ideas")
      .update({ selected: data.selected })
      .eq("id", data.id)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

/** Turns one idea into a scene-by-scene script. */
export const writeScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        ideaId: z.string().uuid(),
        sceneCount: z.number().int().min(3).max(12).default(6),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase, userId } = context;

    const [project, idea] = await Promise.all([
      supabase.from("projects").select("channel_profile").eq("id", data.projectId).single(),
      supabase.from("ideas").select("*").eq("id", data.ideaId).single(),
    ]);
    if (project.error) throw new Error(project.error.message);
    if (idea.error) throw new Error(idea.error.message);

    const script = await askAIJson<{
      title: string;
      description: string;
      tags: string[];
      scenes: Array<{ narration: string; visual: string }>;
    }>(
      "You write tight, high-retention video scripts broken into scenes.",
      `Channel formula:\n${JSON.stringify(project.data.channel_profile)}\n\nIdea: ${idea.data.title}\nHook: ${idea.data.hook}\nAngle: ${idea.data.angle}\n\nWrite the full script in exactly ${data.sceneCount} scenes. Each scene: 2-3 spoken sentences of narration (no stage directions, no speaker labels), plus a vivid visual description for an image generator describing one still frame, including style and lighting.\n\nReturn JSON: { "title": string, "description": a YouTube description under 500 characters, "tags": array of 8 short tags, "scenes": [{ "narration": string, "visual": string }] }`,
    );

    const res = await supabase
      .from("scripts")
      .insert({
        project_id: data.projectId,
        idea_id: data.ideaId,
        user_id: userId,
        title: String(script.title ?? idea.data.title).slice(0, 200),
        description: String(script.description ?? "").slice(0, 2000),
        tags: (script.tags ?? []).slice(0, 12).map((t) => String(t).slice(0, 40)),
        scenes: (script.scenes ?? []).map((s) => ({
          narration: String(s.narration ?? ""),
          visual: String(s.visual ?? ""),
        })),
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);

    await supabase.from("ideas").update({ selected: true }).eq("id", data.ideaId);
    return res.data;
  });

/**
 * Turns a script the assistant wrote in the chat into a real script row, so it
 * shows up in the Studio production settings. Any image prompts the assistant
 * suggested are kept as each scene's picture prompt.
 */
export const saveChatScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        text: z.string().min(20).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase, userId } = context;

    const project = await supabase
      .from("projects")
      .select("channel_profile")
      .eq("id", data.projectId)
      .single();

    const built = await askAIJson<{
      title: string;
      description: string;
      tags: string[];
      scenes: Array<{ narration: string; visual: string }>;
    }>(
      "You convert a chat answer that contains a video script into a clean scene-by-scene production script. You never invent a different story: you keep the writer's words.",
      `Channel formula (for tone only):\n${JSON.stringify(project.data?.channel_profile ?? "unknown")}\n\nThis is the assistant's chat answer. Extract the script it contains and split it into scenes.\n\n"""\n${data.text}\n"""\n\nRules:\n- Keep the spoken words as written wherever possible; only trim stage directions, headings and speaker labels out of "narration".\n- If the answer already contains image prompts, visual directions or shot descriptions, use them verbatim as that scene's "visual".\n- If a scene has no visual given, write one vivid single-frame image description for it.\n- Between 3 and 12 scenes.\n\nReturn JSON: { "title": string, "description": a YouTube description under 500 characters, "tags": array of up to 8 short tags, "scenes": [{ "narration": string, "visual": string }] }`,
      { reasoning: "low" },
    );

    const scenes = (built.scenes ?? [])
      .slice(0, 12)
      .map((s) => ({
        narration: String(s.narration ?? "").slice(0, 2000),
        visual: String(s.visual ?? "").slice(0, 1200),
      }))
      .filter((s) => s.narration || s.visual);
    if (scenes.length === 0) throw new Error("I couldn't find a script in that message.");

    const res = await supabase
      .from("scripts")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        title: String(built.title ?? "Script from chat").slice(0, 200),
        description: String(built.description ?? "").slice(0, 2000),
        tags: (built.tags ?? []).slice(0, 12).map((t) => String(t).slice(0, 40)),
        scenes: scenes as never,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const deleteScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("scripts").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/** Queues one production job per script per language, translating as needed. */
export const queueVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        scriptIds: z.array(z.string().uuid()).min(1).max(10),
        languages: z.array(z.string().min(2).max(40)).min(1).max(6),
        style: z.string().min(1).max(40).default("cinematic"),
        formats: z
          .array(z.enum(["shorts", "longform"]))
          .min(1)
          .max(2)
          .default(["longform"]),
        settings: z.record(z.string(), z.unknown()).optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase, userId } = context;

    const scripts = await supabase
      .from("scripts")
      .select("*")
      .in("id", data.scriptIds)
      .eq("project_id", data.projectId);
    if (scripts.error) throw new Error(scripts.error.message);

    const rows: Array<Record<string, unknown>> = [];

    for (const script of scripts.data ?? []) {
      const scenes = (script.scenes as unknown as Scene[]) ?? [];
      for (const language of data.languages) {
        let localized = scenes;
        let title = script.title;

        if (language.toLowerCase() !== "english") {
          const translated = await askAIJson<{
            title: string;
            scenes: Array<{ narration: string }>;
          }>(
            "You localise video narration so it sounds native, not translated.",
            `Rewrite this script's title and narration in ${language}. Keep the same number of scenes and the same meaning and rhythm.\n\n${JSON.stringify(
              { title: script.title, scenes: scenes.map((s) => ({ narration: s.narration })) },
            )}\n\nReturn JSON: { "title": string, "scenes": [{ "narration": string }] }`,
          );
          title = String(translated.title ?? script.title);
          localized = scenes.map((s, i) => ({
            ...s,
            narration: String(translated.scenes?.[i]?.narration ?? s.narration),
          }));
        }

        for (const format of data.formats) {
          const short = format === "shorts";
          // Shorts stay punchy: the first few scenes only, faster pacing, vertical frame.
          const cut = short ? localized.slice(0, 5) : localized;
          rows.push({
            project_id: data.projectId,
            script_id: script.id,
            user_id: userId,
            language,
            title: `${title}${short ? " (Short)" : ""}`.slice(0, 200),
            style: data.style,
            status: data.scheduledAt ? "scheduled" : "queued",
            scheduled_at: data.scheduledAt ?? null,
            scenes: cut,
            settings: {
              captions: {
                enabled: true,
                size: short ? "lg" : "md",
                position: short ? "center" : "bottom",
                color: "#ffffff",
              },
              pacing: short
                ? { minSceneSeconds: 2.5, gapSeconds: 0.15 }
                : { minSceneSeconds: 3, gapSeconds: 0.35 },
              // Anything chosen in the production layout wins, but the frame
              // shape always follows the format this row is being made for.
              ...(data.settings ?? {}),
              format,
            },
          });
        }
      }
    }

    const res = await supabase.from("videos").insert(rows as never).select("*");
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

/**
 * Queues a video straight from written prompts (for example the image prompts
 * the assistant suggested in chat), without needing a full script first.
 */
export const queueFromPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200).default("Prompt video"),
        prompts: z.string().min(3).max(6000),
        language: z.string().min(2).max(40).default("English"),
        style: z.string().min(1).max(40).default("cinematic"),
        format: z.enum(["shorts", "longform"]).default("longform"),
        settings: z.record(z.string(), z.unknown()).optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { supabase, userId } = context;

    const lines = data.prompts
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 12);
    if (lines.length === 0) throw new Error("Add at least one prompt.");

    const built = await askAIJson<{
      title: string;
      scenes: Array<{ narration: string; visual: string }>;
    }>(
      "You turn raw image prompts into a short narrated video, scene by scene.",
      `Turn these ${lines.length} prompts into ${lines.length} scenes of a short video in ${data.language}.\n\n${lines
        .map((l, i) => `${i + 1}. ${l}`)
        .join(
          "\n",
        )}\n\nKeep the order. For each scene write "narration" (1-2 spoken sentences in ${data.language}, no stage directions) and "visual" (a vivid single-frame image description based on the prompt).\n\nReturn JSON: { "title": a short title in ${data.language}, "scenes": [{ "narration": string, "visual": string }] }`,
    );

    const scenes = (built.scenes ?? []).slice(0, lines.length).map((s, i) => ({
      narration: String(s.narration ?? lines[i] ?? ""),
      visual: String(s.visual ?? lines[i] ?? ""),
    }));
    if (scenes.length === 0) throw new Error("Those prompts could not be turned into scenes.");

    const script = await supabase
      .from("scripts")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        title: String(built.title ?? data.title).slice(0, 200),
        description: "Built from prompts",
        tags: [],
        scenes: scenes as never,
      })
      .select("*")
      .single();
    if (script.error) throw new Error(script.error.message);

    const res = await supabase
      .from("videos")
      .insert({
        project_id: data.projectId,
        script_id: script.data.id,
        user_id: userId,
        language: data.language,
        title: script.data.title,
        style: data.style,
        status: data.scheduledAt ? "scheduled" : "queued",
        scheduled_at: data.scheduledAt ?? null,
        scenes: scenes as never,
        settings: {
          captions: {
            enabled: true,
            size: data.format === "shorts" ? "lg" : "md",
            position: data.format === "shorts" ? "center" : "bottom",
            color: "#ffffff",
          },
          pacing:
            data.format === "shorts"
              ? { minSceneSeconds: 2.5, gapSeconds: 0.15 }
              : { minSceneSeconds: 3, gapSeconds: 0.35 },
          ...(data.settings ?? {}),
          format: data.format,
        } as never,
      })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });


/** Generates the image and narration for a single scene of a queued video. */
export const buildScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        index: z.number().int().min(0).max(30),
        voice: z.enum(["warm", "bright", "deep", "calm"]).default("warm"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateSceneImage, generateNarration } = await import("./ai.server");
    const { supabase, userId } = context;

    const video = await supabase.from("videos").select("*").eq("id", data.videoId).single();
    if (video.error) throw new Error(video.error.message);

    const scenes = (video.data.scenes as unknown as Scene[]) ?? [];
    const scene = scenes[data.index];
    if (!scene) throw new Error("That scene doesn't exist.");

    try {
      const [image, audio] = await Promise.all([
        generateSceneImage(
          `${scene.visual}. ${styleLook(video.data.style)}. Single still frame, 16:9, highly detailed, no text, no watermark, no captions.`,
        ),
        generateNarration(scene.narration, VOICES[data.voice] ?? "Kore"),
      ]);

      const base = `${userId}/${data.videoId}/scene-${data.index}`;
      const up1 = await supabase.storage
        .from("media")
        .upload(`${base}.png`, image, { contentType: "image/png", upsert: true });
      if (up1.error) throw new Error(up1.error.message);
      const up2 = await supabase.storage
        .from("media")
        .upload(`${base}.wav`, audio, { contentType: "audio/wav", upsert: true });
      if (up2.error) throw new Error(up2.error.message);

      scenes[data.index] = { ...scene, imagePath: `${base}.png`, audioPath: `${base}.wav` };

      const done = scenes.filter((s) => s.imagePath).length;
      const res = await supabase
        .from("videos")
        .update({
          scenes: scenes as never,
          status: "building",
          progress: Math.round((done / scenes.length) * 90),
          error: null,
        })
        .eq("id", data.videoId)
        .select("*")
        .single();
      if (res.error) throw new Error(res.error.message);
      return res.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scene failed";
      await supabase
        .from("videos")
        .update({ status: "failed", error: message })
        .eq("id", data.videoId);
      throw new Error(message);
    }
  });

/** Creates short-lived links so the browser can read the generated assets. */
export const signAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ paths: z.array(z.string().min(1)).min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.storage.from("media").createSignedUrls(data.paths, 3600);
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []).map((row) => ({ path: row.path ?? "", url: row.signedUrl }));
  });

export const setVideoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        status: z.enum([
          "queued",
          "scheduled",
          "preparing",
          "assembling",
          "building",
          "rendering",
          "ready",
          "failed",
        ]),
        progress: z.number().int().min(0).max(100).optional(),
        videoPath: z.string().nullable().optional(),
        error: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = { status: data.status };
    if (data.progress !== undefined) update["progress"] = data.progress;
    if (data.videoPath !== undefined) update["video_path"] = data.videoPath;
    if (data.error !== undefined) update["error"] = data.error;

    const res = await context.supabase
      .from("videos")
      .update(update as never)
      .eq("id", data.videoId)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

/** Sets (or clears) the time a finished/pending video should go out. */
export const scheduleVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ videoId: z.string().uuid(), scheduledAt: z.string().datetime().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("videos")
      .update({ scheduled_at: data.scheduledAt } as never)
      .eq("id", data.videoId)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("videos").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/** Channel strategist chat: models the whole channel and guides the creator step by step. */
export const studioChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        message: z.string().min(1).max(4000),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(20)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAI } = await import("./ai.server");
    const { supabase } = context;

    const [project, ideas, scripts, videoStats] = await Promise.all([
      supabase
        .from("projects")
        .select("name,channel_profile,brainstorm")
        .eq("id", data.projectId)
        .single(),
      supabase.from("ideas").select("title,hook,angle,selected").eq("project_id", data.projectId).limit(20),
      supabase.from("scripts").select("title").eq("project_id", data.projectId).limit(20),
      supabase
        .from("source_videos")
        .select("title,analysis")
        .eq("project_id", data.projectId)
        .eq("status", "done")
        .limit(30),
    ]);

    const analysedVideos = (videoStats.data ?? []) as Array<{ title: string | null; analysis: unknown }>;

    const transcript = data.history
      .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
      .join("\n");

    const reply = await askAI(
      `You are the elite channel strategist for "${project.data?.name ?? "this channel"}" — a premium consultant who has reverse-engineered the reference channel it models. You think deeply before answering and every answer is specific, actionable and grounded in the channel intelligence below. Never give generic YouTube advice; always tie guidance back to this channel's DNA, hooks, visuals and audience.

CHANNEL INTELLIGENCE
Channel formula: ${JSON.stringify(project.data?.channel_profile ?? "not built yet")}
${
  project.data?.brainstorm
    ? `Channel intelligence report (built from the analysed reference videos — treat this as the source of truth about the channel's virality, style, tone, hook patterns, visuals, thumbnails and growth):\n${project.data.brainstorm}`
    : "No channel intelligence report yet. If the user asks for ideas, titles or scripts, first tell them to analyse the reference videos on the Sources tab and build the report."
}
Reference videos analysed: ${analysedVideos.length}. Titles: ${analysedVideos.map((v) => v.title ?? "untitled").join("; ") || "none"}.
Existing ideas: ${(ideas.data ?? []).map((i) => `${i.title}${i.selected ? " (kept)" : ""}`).join("; ") || "none"}.
Existing scripts: ${(scripts.data ?? []).map((s) => s.title).join("; ") || "none"}.

HOW YOU GUIDE THE CREATOR
You walk the creator through building their channel, one step at a time. Proactively offer the next step at the end of each reply, in this order:
1. Channel name ideas that fit the modelled niche and tone (offer 5-8 with the reasoning for each).
2. Original video ideas in the channel's exact style (unique angles from the gaps the reference channel leaves open).
3. High-CTR titles and thumbnail concepts for the chosen ideas (title formulas, thumbnail composition, text, emotion).
4. Full scripts written in the channel's voice — hook, open loops, payoff placement, CTA — built for retention and advertiser-safe monetisation.
5. Growth plan: cadence, series, and how videos funnel into each other.
When the user asks for any of these, deliver the full premium answer immediately (not an outline) in clean markdown, then offer the next step. When they ask something else, answer it with the same depth. Keep momentum: end with one clear question about what to do next.`,
      `${transcript ? `${transcript}\n` : ""}User: ${data.message}`,
      { reasoning: "medium" },
    );

    return { reply };
  });

/* ------------------------------------------------------------------ *
 * Editing a finished video
 * ------------------------------------------------------------------ */

/** Saves the production ingredients (captions, music, transitions, …). */
export const updateVideoSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ videoId: z.string().uuid(), settings: z.record(z.string(), z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { normalizeIngredients } = await import("./videoIngredients");
    const res = await context.supabase
      .from("videos")
      .update({ settings: normalizeIngredients(data.settings) as never })
      .eq("id", data.videoId)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

/** Rewrites scene text and/or the production ingredients from a plain prompt. */
export const editVideoByPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ videoId: z.string().uuid(), prompt: z.string().min(2).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { askAIJson } = await import("./ai.server");
    const { normalizeIngredients } = await import("./videoIngredients");
    const { supabase } = context;

    const video = await supabase.from("videos").select("*").eq("id", data.videoId).single();
    if (video.error) throw new Error(video.error.message);

    const scenes = ((video.data.scenes as unknown as Scene[]) ?? []).map((s) => ({ ...s }));
    const current = normalizeIngredients((video.data as { settings?: unknown }).settings);

    const result = await askAIJson<{
      settings?: Record<string, unknown>;
      title?: string;
      sceneEdits?: Array<{ index: number; visual?: string; narration?: string }>;
      summary?: string;
    }>(
      "You are a video editor. You translate a plain-language edit request into concrete changes to a video's production settings and its scenes. Only change what the request asks for.",
      `Current title: ${video.data.title}\nLanguage: ${video.data.language}\n\nCurrent production settings (JSON):\n${JSON.stringify(current)}\n\nScenes:\n${scenes
        .map((s, i) => `${i}. visual: ${s.visual}\n   narration: ${s.narration}`)
        .join("\n")}\n\nEdit request: ${data.prompt}\n\nReturn JSON:\n{\n  "settings": an object with ONLY the settings keys that must change, same shape as the current settings,\n  "title": new title (only if asked),\n  "sceneEdits": [{ "index": number, "visual": new image prompt (only if the picture must change), "narration": new spoken line (only if the words must change) }],\n  "summary": one short sentence describing what you changed\n}\nUse an empty array or omit keys when nothing changes there. Valid values — transition.type: cut|crossfade|slide|zoom; motion.type: none|zoom-in|zoom-out|pan-left|pan-right; music.mood: calm|uplifting|tense|epic; grade: none|warm|cool|mono|vivid|vhs; captions.size: sm|md|lg; captions.position: bottom|center.`,
    );

    const merged = normalizeIngredients({ ...current, ...(result.settings ?? {}) });
    const deepMerged = normalizeIngredients({
      ...merged,
      captions: { ...current.captions, ...((result.settings?.["captions"] as object) ?? {}) },
      transition: { ...current.transition, ...((result.settings?.["transition"] as object) ?? {}) },
      motion: { ...current.motion, ...((result.settings?.["motion"] as object) ?? {}) },
      music: { ...current.music, ...((result.settings?.["music"] as object) ?? {}) },
      sfx: { ...current.sfx, ...((result.settings?.["sfx"] as object) ?? {}) },
      titleCard: { ...current.titleCard, ...((result.settings?.["titleCard"] as object) ?? {}) },
      pacing: { ...current.pacing, ...((result.settings?.["pacing"] as object) ?? {}) },
    });

    let touched = 0;
    for (const edit of result.sceneEdits ?? []) {
      const scene = scenes[edit.index];
      if (!scene) continue;
      if (edit.visual && edit.visual !== scene.visual) {
        scene.visual = String(edit.visual).slice(0, 1200);
        scene.imagePath = null; // regenerate the picture on the next production run
        touched += 1;
      }
      if (edit.narration && edit.narration !== scene.narration) {
        scene.narration = String(edit.narration).slice(0, 2000);
        scene.audioPath = null; // regenerate the voice on the next production run
        touched += 1;
      }
    }

    const update: Record<string, unknown> = { settings: deepMerged, scenes };
    if (result.title) update["title"] = String(result.title).slice(0, 200);

    const saved = await supabase
      .from("videos")
      .update(update as never)
      .eq("id", data.videoId)
      .select("*")
      .single();
    if (saved.error) throw new Error(saved.error.message);

    return {
      video: saved.data,
      summary: result.summary ?? "Applied your changes.",
      scenesTouched: touched,
    };
  });

/** Regenerates one scene's picture and/or voice, optionally from a new prompt. */
export const regenerateScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        index: z.number().int().min(0).max(30),
        visual: z.string().max(1200).optional(),
        narration: z.string().max(2000).optional(),
        image: z.boolean().default(true),
        audio: z.boolean().default(false),
        voice: z.enum(["warm", "bright", "deep", "calm"]).default("warm"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateSceneImage, generateNarration } = await import("./ai.server");
    const { supabase, userId } = context;

    const video = await supabase.from("videos").select("*").eq("id", data.videoId).single();
    if (video.error) throw new Error(video.error.message);

    const scenes = ((video.data.scenes as unknown as Scene[]) ?? []).map((s) => ({ ...s }));
    const scene = scenes[data.index];
    if (!scene) throw new Error("That scene doesn't exist.");

    if (data.visual !== undefined && data.visual.trim()) scene.visual = data.visual.trim();
    if (data.narration !== undefined && data.narration.trim()) scene.narration = data.narration.trim();

    const stamp = Date.now();
    const base = `${userId}/${data.videoId}/scene-${data.index}-${stamp}`;

    if (data.image) {
      const bytes = await generateSceneImage(
        `${scene.visual}. ${styleLook(video.data.style)}. Single still frame, 16:9, highly detailed, no text, no watermark, no captions.`,
      );
      const up = await supabase.storage
        .from("media")
        .upload(`${base}.png`, bytes, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(up.error.message);
      scene.imagePath = `${base}.png`;
    }

    if (data.audio) {
      const bytes = await generateNarration(scene.narration, VOICES[data.voice] ?? "Kore");
      const up = await supabase.storage
        .from("media")
        .upload(`${base}.wav`, bytes, { contentType: "audio/wav", upsert: true });
      if (up.error) throw new Error(up.error.message);
      scene.audioPath = `${base}.wav`;
    }

    scenes[data.index] = scene;
    const res = await supabase
      .from("videos")
      .update({ scenes: scenes as never, error: null })
      .eq("id", data.videoId)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });
