import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const PLATFORMS = [
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

export function platformLabel(id: string | null | undefined): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? "Channel";
}

/** Every social account the user has added, plus the post history. */
export const listChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [channels, posts] = await Promise.all([
      supabase
        .from("channels")
        .select("*")
        .eq("user_id", userId)
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("posts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (channels.error) throw new Error(channels.error.message);
    if (posts.error) throw new Error(posts.error.message);
    const channelIds = new Set((channels.data ?? []).map((channel) => channel.id));
    return {
      channels: channels.data ?? [],
      posts: (posts.data ?? []).filter((post) => channelIds.has(post.channel_id)),
    };
  });

export const saveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        projectId: z.string().uuid().nullable().optional(),
        platform: z.string().min(1).max(40),
        handle: z.string().min(1).max(120),
        webhookUrl: z.string().url().max(600).nullable().optional(),
        autoPost: z.boolean().default(true),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const values = {
      platform: data.platform,
      handle: data.handle,
      webhook_url: data.webhookUrl ?? null,
      auto_post: data.autoPost,
      active: data.active,
    };

    const res = data.id
      ? await supabase.from("channels").update(values).eq("id", data.id).select("*").single()
      : await supabase
          .from("channels")
          .insert({ ...values, user_id: userId, project_id: data.projectId ?? null })
          .select("*")
          .single();

    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const res = await context.supabase.from("channels").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

type PostResult = { channelId: string; status: string; error: string | null };

/**
 * Sends a finished video to every auto-posting account. Each account receives
 * a signed link to the file plus the title, description and tags.
 */
export const publishVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        channelIds: z.array(z.string().uuid()).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const video = await supabase.from("videos").select("*").eq("id", data.videoId).single();
    if (video.error) throw new Error(video.error.message);
    if (!video.data.video_path) throw new Error("This video is not finished yet.");

    const script = video.data.script_id
      ? await supabase
          .from("scripts")
          .select("description,tags")
          .eq("id", video.data.script_id)
          .maybeSingle()
      : null;

    let query = supabase.from("channels").select("*").eq("user_id", userId).eq("active", true);
    if (data.channelIds?.length) query = query.in("id", data.channelIds);
    else query = query.eq("auto_post", true);

    const channels = await query;
    if (channels.error) throw new Error(channels.error.message);
    const targets = channels.data ?? [];
    if (targets.length === 0) return { results: [] as PostResult[] };

    const signed = await supabase.storage
      .from("media")
      .createSignedUrl(video.data.video_path, 60 * 60 * 24 * 7);
    if (signed.error) throw new Error(signed.error.message);

    const results: PostResult[] = [];

    for (const channel of targets) {
      let status = "posted";
      let error: string | null = null;
      let externalUrl: string | null = null;

      if (!channel.webhook_url) {
        status = "failed";
        error = "This account has no posting link yet.";
      } else {
        try {
          const res = await fetch(channel.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform: channel.platform,
              handle: channel.handle,
              title: video.data.title,
              description: script?.data?.description ?? "",
              tags: script?.data?.tags ?? [],
              language: video.data.language,
              videoUrl: signed.data.signedUrl,
              videoId: video.data.id,
              scheduledAt: video.data.scheduled_at,
            }),
          });
          if (!res.ok) {
            status = "failed";
            error = `The account rejected the post (${res.status}).`;
          } else {
            externalUrl = channel.webhook_url;
          }
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : "The post could not be delivered.";
        }
      }

      await supabase.from("posts").upsert(
        {
          user_id: userId,
          video_id: video.data.id,
          channel_id: channel.id,
          status,
          external_url: externalUrl,
          error,
          posted_at: status === "posted" ? new Date().toISOString() : null,
        },
        { onConflict: "video_id,channel_id" },
      );

      results.push({ channelId: channel.id, status, error });
    }

    return { results };
  });
