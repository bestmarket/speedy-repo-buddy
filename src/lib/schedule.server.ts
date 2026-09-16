import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { generateNarration, generateSceneImage } from "./ai.server";
import { styleLook, type Scene } from "./studio.functions";

type DueVideo = {
  id: string;
  user_id: string;
  style: string | null;
  scenes: unknown;
  status: string;
};

/**
 * Builds every scene (image + narration) unattended for videos that are due:
 * scheduled ones whose time has come, and anything simply waiting in the
 * queue. This runs on the server, so the work continues while the person who
 * asked for the video has their browser closed. The final assembly still
 * happens in the browser and resumes automatically next time they open Studio.
 */
export async function prepareDueVideos(limit = 3): Promise<{
  prepared: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const now = new Date().toISOString();
  const due = await supabaseAdmin
    .from("videos")
    .select("id,user_id,style,scenes,status")
    .in("status", ["scheduled", "queued"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (due.error) throw new Error(due.error.message);

  const prepared: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const row of (due.data ?? []) as DueVideo[]) {
    // Claim the row first so overlapping cron runs never double-build it.
    const claim = await supabaseAdmin
      .from("videos")
      .update({ status: "preparing", progress: 5, error: null })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id");
    if (claim.error || (claim.data ?? []).length === 0) continue;

    try {
      const scenes = ((row.scenes as Scene[]) ?? []).slice();
      if (scenes.length === 0) throw new Error("This video has no scenes.");

      for (let i = 0; i < scenes.length; i += 1) {
        const scene = scenes[i]!;
        if (scene.imagePath && scene.audioPath) continue;

        const [image, audio] = await Promise.all([
          generateSceneImage(
            `${scene.visual}. ${styleLook(row.style)}. Single still frame, 16:9, highly detailed, no text, no watermark, no captions.`,
          ),
          generateNarration(scene.narration, "Kore"),
        ]);

        const base = `${row.user_id}/${row.id}/scene-${i}`;
        const up1 = await supabaseAdmin.storage
          .from("media")
          .upload(`${base}.png`, image, { contentType: "image/png", upsert: true });
        if (up1.error) throw new Error(up1.error.message);
        const up2 = await supabaseAdmin.storage
          .from("media")
          .upload(`${base}.wav`, audio, { contentType: "audio/wav", upsert: true });
        if (up2.error) throw new Error(up2.error.message);

        scenes[i] = { ...scene, imagePath: `${base}.png`, audioPath: `${base}.wav` };

        await supabaseAdmin
          .from("videos")
          .update({
            scenes: scenes as never,
            progress: Math.round(((i + 1) / scenes.length) * 55),
          })
          .eq("id", row.id);
      }

      await supabaseAdmin
        .from("videos")
        .update({ status: "assembling", progress: 60, error: null })
        .eq("id", row.id);
      prepared.push(row.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preparation failed";
      await supabaseAdmin
        .from("videos")
        .update({ status: "failed", error: message })
        .eq("id", row.id);
      failed.push({ id: row.id, error: message });
    }
  }

  return { prepared, failed };
}
