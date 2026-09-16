import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type VideoAnalysis = {
  summary: string;
  hook: string;
  structure: string[];
  topics: string[];
  tone: string;
  pacing: string;
  callToAction: string;
  whatWorks: string;
};

export type SourceVideo = {
  id: string;
  source_id: string;
  video_id: string;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  position: number;
  transcript_source: string | null;
  analysis: VideoAnalysis | null;
  status: string;
  error: string | null;
};

const SELECT =
  "id,source_id,video_id,url,title,thumbnail_url,published_at,position,transcript_source,analysis,status,error";

export const listSourceVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("source_videos")
      .select(SELECT)
      .eq("source_id", data.sourceId)
      .order("position", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as unknown as SourceVideo[];
  });

/** Resolves the source's link into a queue of videos ready to be analysed. */
export const discoverSourceVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        limit: z.number().int().min(1).max(15).default(8),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { discoverVideos } = await import("./youtube.server");

    const source = await supabase
      .from("sources")
      .select("id,project_id,kind,content")
      .eq("id", data.sourceId)
      .single();
    if (source.error) throw new Error(source.error.message);
    if (source.data.kind !== "link") throw new Error("Only link sources can be analysed.");

    // One source can hold several pasted links (one per line or space separated).
    const links = source.data.content
      .split(/[\s,]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const found = new Map<string, Awaited<ReturnType<typeof discoverVideos>>[number]>();
    const problems: string[] = [];
    for (const link of links) {
      try {
        const perLink = await discoverVideos(link, data.limit);
        for (const v of perLink) if (!found.has(v.videoId)) found.set(v.videoId, v);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "link failed");
      }
    }
    if (found.size === 0) {
      throw new Error(problems[0] ?? "No videos were found for that link.");
    }
    const videos = [...found.values()];

    const rows = videos.map((v, index) => ({
      source_id: data.sourceId,
      project_id: source.data.project_id,
      user_id: userId,
      video_id: v.videoId,
      url: v.url,
      title: v.title,
      thumbnail_url: v.thumbnailUrl,
      published_at: v.publishedAt,
      position: index,
    }));

    const res = await supabase
      .from("source_videos")
      .upsert(rows, { onConflict: "source_id,video_id", ignoreDuplicates: true })
      .select(SELECT);
    if (res.error) throw new Error(res.error.message);

    return listAfterDiscover(supabase, data.sourceId);
  });

async function listAfterDiscover(
  supabase: { from: (t: string) => any },
  sourceId: string,
): Promise<SourceVideo[]> {
  const res = await supabase
    .from("source_videos")
    .select(SELECT)
    .eq("source_id", sourceId)
    .order("position", { ascending: true });
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as SourceVideo[];
}

/** Reads one video's transcript and studies it. Called once per video. */
export const analyzeSourceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { fetchTranscript } = await import("./youtube.server");
    const { askAIJson } = await import("./ai.server");

    const row = await supabase
      .from("source_videos")
      .select("id,video_id,title,url")
      .eq("id", data.id)
      .single();
    if (row.error) throw new Error(row.error.message);

    await supabase.from("source_videos").update({ status: "analyzing", error: null }).eq("id", data.id);

    try {
      const transcript = await fetchTranscript(row.data.video_id);
      const clipped = transcript.text.slice(0, 18000);

      const analysis = await askAIJson<VideoAnalysis>(
        "You are a YouTube performance analyst. You study one video and describe exactly how it is built.",
        `Video title: ${transcript.title}\nTranscript source: ${transcript.source}\n\nTranscript:\n${clipped}\n\nReturn JSON with keys: summary (2 sentences), hook (the opening move, one sentence), structure (array of 3-6 short beat labels in order), topics (array of 3-6 short topic tags), tone (one short phrase), pacing (one short phrase), callToAction (one short sentence, or "none"), whatWorks (one sentence on why this video holds attention).`,
      );

      const saved = await supabase
        .from("source_videos")
        .update({
          transcript: clipped,
          transcript_source: transcript.source,
          title: transcript.title || row.data.title,
          analysis,
          status: "done",
          error: null,
        })
        .eq("id", data.id)
        .select(SELECT)
        .single();
      if (saved.error) throw new Error(saved.error.message);
      return saved.data as unknown as SourceVideo;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed.";
      const failed = await supabase
        .from("source_videos")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", data.id)
        .select(SELECT)
        .single();
      if (failed.error) throw new Error(failed.error.message);
      return failed.data as unknown as SourceVideo;
    }
  });

export const clearSourceVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("source_videos")
      .delete()
      .eq("source_id", data.sourceId);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Whole-project analysis
 * ------------------------------------------------------------------ */

export type LinkSource = { id: string; label: string | null; content: string };

/** Every saved link source in the project, in the order they were added. */
export const listLinkSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("sources")
      .select("id,label,content")
      .eq("project_id", data.projectId)
      .eq("kind", "link")
      .order("created_at", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as LinkSource[];
  });

/** Every discovered video across all of the project's links. */
export const listProjectVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase
      .from("source_videos")
      .select(SELECT)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true })
      .order("position", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as unknown as SourceVideo[];
  });

/**
 * Turns every analysed video into a channel-level intelligence report.
 * The report models the reference channel as a whole — its virality, voice,
 * hooks, visuals, thumbnails and growth engine — so the user's own channel
 * can produce original content with the same winning DNA.
 */
export const buildBrainstorm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { askAI } = await import("./ai.server");
    const { supabase } = context;

    const [rows, project] = await Promise.all([
      supabase
        .from("source_videos")
        .select("title,url,analysis,thumbnail_url,published_at")
        .eq("project_id", data.projectId)
        .eq("status", "done")
        .limit(60),
      supabase
        .from("projects")
        .select("name,channel_profile")
        .eq("id", data.projectId)
        .single(),
    ]);
    if (rows.error) throw new Error(rows.error.message);

    const analysed = (rows.data ?? []).filter((r) => r.analysis);
    if (analysed.length === 0) throw new Error("Analyse some videos first.");

    const digest = analysed
      .map((r, i) => `${i + 1}. ${r.title ?? r.url} (${r.published_at ?? "unknown date"})\n${JSON.stringify(r.analysis)}`)
      .join("\n\n");

    const brainstorm = await askAI(
      `You are an elite YouTube channel strategist who reverse-engineers why channels grow. You study every analysed video from one reference channel and model the CHANNEL as a whole — not individual videos. Your analysis is specific, evidence-based (quote real titles and moments), and written for a creator who wants 100% monetisation-safe, high-watchtime content. Write clean markdown, no preamble, no filler.`,
      `Reference channel: "${project.data?.name ?? "unknown"}".\nExisting channel formula (if any): ${JSON.stringify(project.data?.channel_profile ?? "none")}.\n\nHere are ${analysed.length} analysed videos from this channel:\n\n${digest}\n\nWrite the channel intelligence report with exactly these sections:\n## Channel DNA\nThe niche, the exact audience, the promise every video makes, and the channel owner's on-camera persona and relationship with viewers.\n## Why this channel goes viral\nThe retention mechanics and emotional triggers it exploits — curiosity gaps, stakes, payoff timing — with examples from the titles above.\n## Hook playbook\nThe 3-5 recurring opening patterns, each with a one-line template the user can reuse.\n## Winning story structure\nThe beat-by-beat blueprint most videos follow, with typical pacing and length.\n## Visual & thumbnail language\nRecurring visual style, imagery, framing and thumbnail patterns (subjects, colours, text treatment, emotion) that earn the click.\n## Voice & tone fingerprint\nSentence rhythm, vocabulary level, humour, how it speaks to the viewer — so writing can match it.\n## Growth engine\nUpload cadence signals, series/formats that repeat, how videos funnel into each other, and what compounds the channel's growth.\n## Monetisation & watchtime levers\nWhat keeps the content advertiser-safe and what stretches watch time (open loops, chaptering, payoff placement).\n## Gaps this channel leaves open\nUnderserved angles and topics in this niche the user can own.\n## 10 original video ideas in this channel's style\nEach: a high-CTR title plus a one-line hook. Original ideas — not copies of the analysed titles.\nKeep bullets short and concrete. Every claim must trace back to the analysed videos.`,
      { reasoning: "medium" },
    );

    const saved = await supabase
      .from("projects")
      .update({ brainstorm, brainstorm_at: new Date().toISOString() })
      .eq("id", data.projectId)
      .select("brainstorm,brainstorm_at")
      .single();
    if (saved.error) throw new Error(saved.error.message);

    return { brainstorm, videoCount: analysed.length };
  });
