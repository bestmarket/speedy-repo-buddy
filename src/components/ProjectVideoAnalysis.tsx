import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  analyzeSourceVideo,
  buildBrainstorm,
  clearSourceVideos,
  discoverSourceVideos,
  listLinkSources,
  listProjectVideos,
  type SourceVideo,
} from "@/lib/analysis.functions";

/** Runs the analysis across every saved link in the channel, one video at a time. */
export function ProjectVideoAnalysis({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const key = ["project-videos", projectId] as const;

  const listSources = useServerFn(listLinkSources);
  const listVideos = useServerFn(listProjectVideos);
  const discover = useServerFn(discoverSourceVideos);
  const analyze = useServerFn(analyzeSourceVideo);
  const brainstorm = useServerFn(buildBrainstorm);
  const clear = useServerFn(clearSourceVideos);

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cancelled = useRef(false);

  const videos = useQuery({
    queryKey: key,
    queryFn: () => listVideos({ data: { projectId } }),
  });

  const rows = videos.data ?? [];
  const done = rows.filter((v) => v.status === "done" || v.status === "failed").length;
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;

  const setRows = (next: SourceVideo[]) => queryClient.setQueryData(key, next);

  async function run() {
    cancelled.current = false;
    setRunning(true);
    try {
      const sources = await listSources({ data: { projectId } });
      if (sources.length === 0) {
        toast.error("Add at least one channel or video link first.");
        return;
      }

      let queue: SourceVideo[] = [];
      for (const [i, source] of sources.entries()) {
        if (cancelled.current) break;
        setStage(`Finding videos (link ${i + 1} of ${sources.length})…`);
        try {
          const found = await discover({ data: { sourceId: source.id, limit: 8 } });
          const known = new Set(queue.map((v) => v.id));
          queue = [...queue, ...found.filter((v) => !known.has(v.id))];
          setRows(queue);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "A link could not be read.");
        }
      }

      const pending = queue.filter((v) => v.status !== "done");
      for (const [i, video] of pending.entries()) {
        if (cancelled.current) break;
        setStage(`Reading “${video.title ?? "video"}” (${i + 1} of ${pending.length})…`);
        const updated = await analyze({ data: { id: video.id } });
        queue = queue.map((v) => (v.id === updated.id ? updated : v));
        setRows(queue);
      }

      if (cancelled.current) return;

      if (queue.some((v) => v.status === "done")) {
        setStage("Writing your brainstorm…");
        const result = await brainstorm({ data: { projectId } });
        await queryClient.invalidateQueries({ queryKey: ["workspace"] });
        toast.success(`Brainstorm ready from ${result.videoCount} videos — open Chat to read it.`);
      } else {
        toast.error("None of the videos could be read.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setStage(null);
      setRunning(false);
    }
  }

  async function reset() {
    const sources = await listSources({ data: { projectId } });
    for (const source of sources) await clear({ data: { sourceId: source.id } });
    setRows([]);
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">Analyse your links</h2>
          <p className="text-xs text-muted-foreground">
            Reads every saved link, studies each video one by one, then writes a brainstorm into
            Chat.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysing…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {rows.length ? "Analyse again" : "Analyse all links"}
              </>
            )}
          </Button>
          {running ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                cancelled.current = true;
              }}
            >
              Stop
            </Button>
          ) : rows.length ? (
            <Button size="sm" variant="ghost" onClick={() => void reset()}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {rows.length ? (
        <div className="space-y-2">
          <Progress value={percent} />
          <p className="text-xs text-muted-foreground">
            {done} of {rows.length} videos analysed{stage ? ` · ${stage}` : ""}
          </p>
        </div>
      ) : stage ? (
        <p className="text-xs text-muted-foreground">{stage}</p>
      ) : null}

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((video) => {
            const open = expanded === video.id;
            return (
              <li key={video.id} className="rounded-md border border-border/70 bg-muted/30 p-2">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => setExpanded(open ? null : video.id)}
                >
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="h-10 w-16 shrink-0 rounded object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-sm text-foreground">
                      {video.title ?? video.url}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {video.status === "done" ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Analysed
                          {video.transcript_source === "description" ? " (no captions)" : ""}
                        </>
                      ) : video.status === "analyzing" ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Reading transcript…
                        </>
                      ) : video.status === "failed" ? (
                        <>
                          <AlertCircle className="h-3 w-3" /> {video.error ?? "Failed"}
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-3 w-3" /> Queued
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {open && video.analysis ? (
                  <div className="mt-2 space-y-2 border-t border-border/70 pt-2 text-sm">
                    <p className="text-foreground">{video.analysis.summary}</p>
                    <p className="text-muted-foreground">
                      <span className="text-foreground">Hook:</span> {video.analysis.hook}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-foreground">Structure:</span>{" "}
                      {video.analysis.structure?.join(" → ")}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-foreground">Tone:</span> {video.analysis.tone} ·{" "}
                      <span className="text-foreground">Pacing:</span> {video.analysis.pacing}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="text-foreground">Why it works:</span>{" "}
                      {video.analysis.whatWorks}
                    </p>
                    {video.analysis.topics?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {video.analysis.topics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {rows.some((v) => v.status === "done") ? (
        <Link
          to="/app/chat"
          className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open the brainstorm in Chat →
        </Link>
      ) : null}
    </section>
  );
}
