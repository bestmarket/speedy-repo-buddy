import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, StickyNote, Trash2, Type, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ProjectVideoAnalysis } from "@/components/ProjectVideoAnalysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ChannelProfile } from "@/lib/studio.functions";
import { addSource, cloneChannel, deleteSource } from "@/lib/studio.functions";
import { useRefreshWorkspace, useWorkspace } from "@/lib/useWorkspace";

export const Route = createFileRoute("/_authenticated/app/sources")({
  head: () => ({
    meta: [
      { title: "Sources — Channel Studio" },
      {
        name: "description",
        content: "Add channel links, sample titles, topics and notes, then clone the channel.",
      },
      { property: "og:title", content: "Sources — Channel Studio" },
      {
        property: "og:description",
        content: "Add channel links, sample titles, topics and notes, then clone the channel.",
      },
    ],
  }),
  component: SourcesPage,
});

const KINDS = [
  { value: "link", label: "Channel or video link", icon: Link2 },
  { value: "titles", label: "Sample titles", icon: Type },
  { value: "topic", label: "Topic", icon: StickyNote },
  { value: "note", label: "Notes", icon: StickyNote },
] as const;

type Kind = (typeof KINDS)[number]["value"];

function SourcesPage() {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const projectId = workspace.data?.project.id;

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("link");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  const add = useMutation({
    mutationFn: useServerFn(addSource),
    onSuccess: async () => {
      setContent("");
      setLabel("");
      setOpen(false);
      await refresh();
      toast.success("Source added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: useServerFn(deleteSource),
    onSuccess: async () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const clone = useMutation({
    mutationFn: useServerFn(cloneChannel),
    onSuccess: async () => {
      await refresh();
      toast.success("Channel cloned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sources = workspace.data?.sources ?? [];
  const profile = workspace.data?.project.channel_profile as ChannelProfile | null | undefined;

  if (workspace.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your channel…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {projectId && sources.some((s) => s.kind === "link") ? (
        <ProjectVideoAnalysis projectId={projectId} />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Channel material</h2>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "+ Add source"}
          </Button>
        </div>

        {open ? (
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!projectId) return;
              add.mutate({ data: { projectId, kind, label: label || undefined, content } });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Label (optional)</Label>
                <Input
                  id="label"
                  value={label}
                  placeholder="e.g. Competitor channel"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                required
                rows={5}
                value={content}
                placeholder={
                  kind === "link"
                    ? "Paste a channel or video link"
                    : kind === "titles"
                      ? "Paste a handful of video titles, one per line"
                      : "Describe the topic, audience and style"
                }
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Save source"}
            </Button>
          </form>
        ) : null}

        {sources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Add a channel link, some sample titles or a few notes.
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li key={source.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {source.kind}
                      {source.label ? ` · ${source.label}` : ""}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground">
                      {source.content}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove source"
                    onClick={() => remove.mutate({ data: { id: source.id } })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <Button
          className="w-full"
          disabled={!projectId || sources.length === 0 || clone.isPending}
          onClick={() => projectId && clone.mutate({ data: { projectId } })}
        >
          {clone.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Studying the channel…
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" /> {profile ? "Re-clone channel" : "Clone channel"}
            </>
          )}
        </Button>

        {profile ? (
          <dl className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
            {(
              [
                ["Niche", profile.niche],
                ["Audience", profile.audience],
                ["Tone", profile.tone],
                ["Hook style", profile.hookStyle],
                ["Pacing", profile.pacing],
                ["Typical length", profile.typicalLength],
                ["Visual style", profile.visualStyle],
              ] as const
            ).map(([term, value]) => (
              <div key={term}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
                <dd className="text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </div>
  );
}
