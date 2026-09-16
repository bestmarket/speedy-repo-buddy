import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CalendarClock, Download, Loader2, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ProductionDialog } from "@/components/ProductionDialog";
import { VideoEditor } from "@/components/VideoEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { publishVideo } from "@/lib/channels.functions";
import { notify, requestNotificationPermission } from "@/lib/notify";
import { renderVideo } from "@/lib/renderVideo";
import type { Scene, VideoStyle } from "@/lib/studio.functions";
import {
  VIDEO_STYLES,
  buildScene,
  deleteVideo,
  scheduleVideo,
  setVideoStatus,
  signAssets,
} from "@/lib/studio.functions";
import { useRefreshWorkspace, useWorkspace } from "@/lib/useWorkspace";
import { requestWakeLock } from "@/lib/wakeLock";
import { cn } from "@/lib/utils";
import { normalizeIngredients } from "@/lib/videoIngredients";

export const Route = createFileRoute("/_authenticated/app/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Channel Studio" },
      {
        name: "description",
        content: "Pick a look and open its production settings to make your video.",
      },
      { property: "og:title", content: "Studio — Channel Studio" },
      {
        property: "og:description",
        content: "Pick a look and open its production settings to make your video.",
      },
    ],
  }),
  component: StudioPage,
});

type VideoRow = {
  id: string;
  title: string;
  language: string;
  style: string | null;
  status: string;
  progress: number;
  error: string | null;
  scenes: unknown;
  settings?: unknown;
  video_path: string | null;
  scheduled_at: string | null;
};

function StudioPage() {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const projectId = workspace.data?.project.id;

  const [openStyle, setOpenStyle] = useState<VideoStyle | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VideoRow | null>(null);
  const [liveProgress, setLiveProgress] = useState<Record<string, number>>({});

  const scripts = workspace.data?.scripts ?? [];
  const videos = (workspace.data?.videos ?? []) as unknown as VideoRow[];

  const runBuildScene = useServerFn(buildScene);
  const runSetStatus = useServerFn(setVideoStatus);
  const runSignAssets = useServerFn(signAssets);
  const runPublish = useServerFn(publishVideo);

  const produce = useCallback(
    async (video: VideoRow) => {
      const scenes = (video.scenes as Scene[]) ?? [];
      if (scenes.length === 0) return;
      setBusyId(video.id);
      void requestNotificationPermission();
      const releaseWakeLock = requestWakeLock();
      try {
        for (let i = 0; i < scenes.length; i += 1) {
          if (scenes[i]?.imagePath && scenes[i]?.audioPath) continue;
          await runBuildScene({ data: { videoId: video.id, index: i, voice: "warm" } });
          notify(
            `Scene ${i + 1} of ${scenes.length} is ready`,
            video.title || "Untitled video",
            "success",
          );
        }

        const fresh = await supabase
          .from("videos")
          .select("scenes,settings")
          .eq("id", video.id)
          .single();
        if (fresh.error) throw new Error(fresh.error.message);
        const built = ((fresh.data.scenes as unknown as Scene[]) ?? []).filter((s) => s.imagePath);
        if (built.length === 0) throw new Error("No scenes were built for this video.");
        const paths = built.flatMap((s) =>
          [s.imagePath, s.audioPath].filter((p): p is string => Boolean(p)),
        );
        const signed = await runSignAssets({ data: { paths } });
        const urlFor = (path: string | null | undefined) =>
          path ? (signed.find((s) => s.path === path)?.url ?? null) : null;

        await runSetStatus({ data: { videoId: video.id, status: "rendering", progress: 60 } });
        const ingredients = normalizeIngredients(
          (fresh.data as { settings?: unknown }).settings ?? video.settings,
        );

        let lastSaved = 0;
        const blob = await renderVideo(
          built.map((s) => ({
            imageUrl: urlFor(s.imagePath)!,
            audioUrl: urlFor(s.audioPath),
            caption: s.narration,
          })),
          ingredients,
          (fraction) => {
            const pct = 60 + Math.round(fraction * 35);
            setLiveProgress((p) => ({ ...p, [video.id]: pct }));
            if (pct - lastSaved >= 10) {
              lastSaved = pct;
              void runSetStatus({
                data: { videoId: video.id, status: "rendering", progress: pct },
              }).catch(() => undefined);
            }
          },
        );

        const { data: userData } = await supabase.auth.getUser();
        const path = `${userData.user!.id}/${video.id}/video.webm`;
        const upload = await supabase.storage
          .from("media")
          .upload(path, blob, { contentType: blob.type || "video/webm", upsert: true });
        if (upload.error) throw new Error(upload.error.message);

        await runSetStatus({
          data: { videoId: video.id, status: "ready", progress: 100, videoPath: path, error: null },
        });

        try {
          const posted = await runPublish({ data: { videoId: video.id } });
          const ok = posted.results.filter((r) => r.status === "posted").length;
          notify(
            "Your video is ready to download",
            ok > 0
              ? `${video.title || "Untitled video"} · posted to ${ok} account(s)`
              : video.title || "Untitled video",
            "success",
          );
        } catch {
          notify(
            "Your video is ready to download",
            "Auto-posting to your channels failed.",
            "success",
          );
        }

        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Production failed";
        await runSetStatus({ data: { videoId: video.id, status: "failed", error: message } }).catch(
          () => undefined,
        );
        await refresh();
        notify("Video failed", message, "error");
      } finally {
        releaseWakeLock();
        setLiveProgress((p) => {
          const next = { ...p };
          delete next[video.id];
          return next;
        });
        setBusyId(null);
      }
    },
    [refresh, runBuildScene, runPublish, runSetStatus, runSignAssets],
  );

  // Keep the list fresh so scheduled videos are picked up.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Pick up any video left unfinished — including one whose render was cut
  // short by a reload or a closed tab.
  const autoRan = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (busyId) return;
    const next = videos.find(
      (v) =>
        ["assembling", "queued", "building", "preparing", "rendering"].includes(v.status) &&
        !autoRan.current.has(v.id),
    );
    if (!next) return;
    autoRan.current.add(next.id);
    void produce(next);
  }, [busyId, produce, videos]);

  const rerender = useCallback(
    async (videoId: string) => {
      autoRan.current.add(videoId);
      const { data, error } = await supabase.from("videos").select("*").eq("id", videoId).single();
      if (error) {
        toast.error(error.message);
        return;
      }
      await produce(data as unknown as VideoRow);
    },
    [produce],
  );

  if (workspace.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your studio…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Video style</h2>
            <p className="text-xs text-muted-foreground">
              Tap a look to open its production settings.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ok = await requestNotificationPermission();
              toast[ok ? "success" : "error"](
                ok ? "Notifications are on" : "Notifications are blocked in your browser settings",
              );
            }}
          >
            <Bell className="mr-2 h-4 w-4" /> Alerts
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {VIDEO_STYLES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setOpenStyle(option)}
              className={cn(
                "overflow-hidden rounded-lg border border-border text-left transition-colors",
                "hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="block h-16 w-full" style={{ background: option.swatch }} />
              <span className="block p-3">
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <VideoLibrary
        videos={videos}
        busyId={busyId}
        liveProgress={liveProgress}
        onChanged={refresh}
        onEdit={setEditing}
        onResume={(video) => void produce(video)}
      />

      <VideoEditor
        video={editing}
        onClose={() => setEditing(null)}
        onChanged={refresh}
        onRerender={(id) => void rerender(id)}
      />

      <ProductionDialog
        style={openStyle}
        projectId={projectId}
        scripts={scripts}
        onClose={() => setOpenStyle(null)}
        onQueued={refresh}
      />
    </div>
  );
}

const IN_PROGRESS = ["queued", "scheduled", "preparing", "assembling", "building", "rendering"];

const STATUS_LABEL: Record<string, string> = {
  queued: "Waiting to start",
  scheduled: "Scheduled",
  preparing: "Preparing",
  assembling: "Assembling scenes",
  building: "Building scenes",
  rendering: "Rendering",
  ready: "Ready",
  failed: "Failed",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function VideoLibrary({
  videos,
  busyId,
  liveProgress,
  onChanged,
  onEdit,
  onResume,
}: {
  videos: VideoRow[];
  busyId: string | null;
  liveProgress: Record<string, number>;
  onChanged: () => void | Promise<unknown>;
  onEdit: (video: VideoRow) => void;
  onResume: (video: VideoRow) => void;
}) {
  const runSign = useServerFn(signAssets);
  const runDelete = useServerFn(deleteVideo);
  const [links, setLinks] = useState<Record<string, string>>({});

  const ready = videos.filter((v) => v.status === "ready");
  const working = videos.filter((v) => IN_PROGRESS.includes(v.status));
  const failed = videos.filter((v) => v.status === "failed");

  const paths = ready
    .map((v) => v.video_path)
    .filter((p): p is string => Boolean(p))
    .join("|");

  useEffect(() => {
    const list = paths ? paths.split("|") : [];
    const missing = list.filter((p) => !links[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    void runSign({ data: { paths: missing } })
      .then((rows) => {
        if (cancelled) return;
        setLinks((prev) => {
          const next = { ...prev };
          for (const row of rows) if (row.path && row.url) next[row.path] = row.url;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  async function remove(id: string) {
    try {
      await runDelete({ data: { id } });
      await onChanged();
      toast.success("Video removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the video");
    }
  }

  if (videos.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Your videos</h2>
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No videos yet. Pick a look above to make your first one.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-foreground">Your videos</h2>
        <p className="text-xs text-muted-foreground">
          Pictures and voice keep being made for you even if you close this page. The final
          assembly needs this page open, and picks up where it left off when you come back.
        </p>
      </div>

      {working.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In progress
          </h3>
          {working.map((video) => {
            const pct = liveProgress[video.id] ?? video.progress;
            return (
              <div key={video.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {video.title || "Untitled video"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {STATUS_LABEL[video.status] ?? video.status}
                      {video.scheduled_at
                        ? ` · ${new Date(video.scheduled_at).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <Loader2
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground",
                      busyId === video.id ? "animate-spin" : "",
                    )}
                  />
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                  />
                </div>
                {busyId !== video.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onResume(video)}>
                      <PlayCircle className="mr-2 h-4 w-4" /> Continue now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(video)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(video.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {ready.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Finished
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {ready.map((video) => {
              const url = video.video_path ? links[video.video_path] : undefined;
              return (
                <div key={video.id} className="overflow-hidden rounded-lg border border-border">
                  {url ? (
                    <video src={url} controls playsInline className="aspect-video w-full bg-black" />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                      Loading preview…
                    </div>
                  )}
                  <div className="space-y-3 p-3">
                    <div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {video.title || "Untitled video"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {video.language}
                        {video.style ? ` · ${video.style}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit(video)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      {url ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={url} download={`${video.title || "video"}.webm`}>
                            <Download className="mr-2 h-4 w-4" /> Download
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(video.id)}
                        aria-label="Delete video"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <ScheduleRow video={video} onChanged={onChanged} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Needs attention
          </h3>
          {failed.map((video) => (
            <div
              key={video.id}
              className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {video.title || "Untitled video"}
                </p>
                <p className="mt-0.5 text-xs text-destructive">
                  {video.error ?? "Something went wrong while making this video."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onResume(video)}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Try again
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(video)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(video.id)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ScheduleRow({
  video,
  onChanged,
}: {
  video: VideoRow;
  onChanged: () => void | Promise<unknown>;
}) {
  const runSchedule = useServerFn(scheduleVideo);
  const [when, setWhen] = useState(() => toLocalInput(video.scheduled_at));
  const [busy, setBusy] = useState(false);

  async function save(value: string | null) {
    setBusy(true);
    try {
      await runSchedule({
        data: {
          videoId: video.id,
          scheduledAt: value ? new Date(value).toISOString() : null,
        },
      });
      await onChanged();
      toast.success(value ? "Posting time saved" : "Posting time cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the time");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> Post at
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          className="h-9 w-auto flex-1"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <Button size="sm" disabled={busy || !when} onClick={() => void save(when)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        {video.scheduled_at ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setWhen("");
              void save(null);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
