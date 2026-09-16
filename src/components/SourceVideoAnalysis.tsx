import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  analyzeSourceVideo,
  clearSourceVideos,
  discoverSourceVideos,
  listSourceVideos,
  type SourceVideo,
} from "@/lib/analysis.functions";

export function SourceVideoAnalysis({ sourceId }: { sourceId: string }) {
  const queryClient = useQueryClient();
  const key = ["source-videos", sourceId] as const;

  const list = useServerFn(listSourceVideos);
  const discover = useServerFn(discoverSourceVideos);
  const analyze = useServerFn(analyzeSourceVideo);
  const clear = useServerFn(clearSourceVideos);

  const [running, setRunning] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const cancelled = useRef(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const videos = useQuery({
    queryKey: key,
    queryFn: () => list({ data: { sourceId } }),
  });

  const rows = videos.data ?? [];
  const done = rows.filter((v) => v.status === "done" || v.status === "failed").length;
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;

  const setRows = (next: SourceVideo[]) => queryClient.setQueryData(key, next);

  async function run() {
    cancelled.current = false;
    setRunning(true);
    try {
      let queue = await discover({ data: { sourceId, limit: 8 } });
      setRows(queue);

      const pending = queue.filter((v) => v.status !== "done");
      for (const video of pending) {
        if (cancelled.current) break;
        setCurrentTitle(video.title ?? "Video");
        const updated = await analyze({ data: { id: video.id } });
        queue = queue.map((v) => (v.id === updated.id ? updated : v));
        setRows(queue);
      }
      setCurrentTitle(null);
      if (!cancelled.current) toast.success("Videos analysed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setCurrentTitle(null);
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    }
  }

  const reset = useMutation({
    mutationFn: () => clear({ data: { sourceId } }),
    onSuccess: () => setRows([]),
  });

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {rows.length ? "Analyse again" : "Analyse videos"}
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
          <Button size="sm" variant="ghost" onClick={() => reset.mutate()}>
            Clear
          </Button>
        ) : null}
      </div>

      {rows.length ? (
        <div className="space-y-2">
          <Progress value={percent} />
          <p className="text-xs text-muted-foreground">
            {done} of {rows.length} videos analysed
            {currentTitle ? ` · reading “${currentTitle}”` : ""}
          </p>
        </div>
      ) : null}

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
    </div>
  );
}
