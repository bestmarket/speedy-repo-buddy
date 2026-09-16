import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PLATFORMS,
  deleteChannel,
  listChannels,
  platformLabel,
  publishVideo,
  saveChannel,
} from "@/lib/channels.functions";
import { useWorkspace } from "@/lib/useWorkspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/channels")({
  head: () => ({
    meta: [
      { title: "Channels — Channel Studio" },
      {
        name: "description",
        content: "List your social accounts and post every finished video to them automatically.",
      },
      { property: "og:title", content: "Channels — Channel Studio" },
      {
        property: "og:description",
        content: "List your social accounts and post every finished video to them automatically.",
      },
    ],
  }),
  component: ChannelsPage,
});

const channelsKey = ["channels"] as const;

function ChannelsPage() {
  const queryClient = useQueryClient();
  const fetchChannels = useServerFn(listChannels);
  const workspace = useWorkspace();
  const projectId = workspace.data?.project.id;
  const data = useQuery({
    queryKey: [...channelsKey, projectId],
    queryFn: () => fetchChannels({ data: { projectId: projectId ?? "" } }),
    enabled: Boolean(projectId),
  });

  const [platform, setPlatform] = useState<string>("youtube");
  const [handle, setHandle] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: channelsKey });

  const save = useMutation({
    mutationFn: useServerFn(saveChannel),
    onSuccess: async () => {
      setHandle("");
      setWebhookUrl("");
      await refresh();
      toast.success("Account added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: useServerFn(deleteChannel),
    onSuccess: async () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: useServerFn(publishVideo),
    onSuccess: async (result: { results: Array<{ status: string; error: string | null }> }) => {
      await refresh();
      const failed = result.results.filter((r) => r.status !== "posted");
      if (failed.length > 0) toast.error(failed[0]?.error ?? "Some posts failed");
      else toast.success("Posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channels = data.data?.channels ?? [];
  const posts = data.data?.posts ?? [];
  const readyVideos = (workspace.data?.videos ?? []).filter(
    (v) => (v as { status: string }).status === "ready",
  ) as Array<{ id: string; title: string }>;

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Add a social account</h2>
          <p className="text-xs text-muted-foreground">
            Give each account a posting link (from Zapier, Make, n8n or your own endpoint). Every
            finished video is sent there automatically with its title, description and tags.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={platform === p.id}
              onClick={() => setPlatform(p.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                platform === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="handle">Account name or handle</Label>
          <Input
            id="handle"
            value={handle}
            placeholder="@mychannel"
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hook">Posting link</Label>
          <Input
            id="hook"
            value={webhookUrl}
            placeholder="https://hooks.zapier.com/…"
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>

        <Button
          className="w-full"
          disabled={handle.trim().length < 2 || save.isPending}
          onClick={() =>
            save.mutate({
              data: {
                projectId: workspace.data?.project.id ?? null,
                platform,
                handle: handle.trim(),
                webhookUrl: webhookUrl.trim() || null,
                autoPost: true,
                active: true,
              },
            })
          }
        >
          {save.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Add account
            </>
          )}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Your accounts</h2>
        {data.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : channels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No accounts yet. Add one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {channels.map((channel) => {
              const history = posts.filter((p) => p.channel_id === channel.id);
              return (
                <li key={channel.id} className="space-y-2 rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {platformLabel(channel.platform)} · {channel.handle}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {channel.webhook_url ?? "No posting link yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={channel.auto_post}
                        onClick={() =>
                          save.mutate({
                            data: {
                              id: channel.id,
                              platform: channel.platform,
                              handle: channel.handle,
                              webhookUrl: channel.webhook_url,
                              autoPost: !channel.auto_post,
                              active: channel.active,
                            },
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          channel.auto_post
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Auto-post {channel.auto_post ? "on" : "off"}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete account"
                        onClick={() => remove.mutate({ data: { id: channel.id } })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {history.length > 0 ? (
                    <ul className="space-y-1 border-t border-border pt-2">
                      {history.slice(0, 5).map((p) => (
                        <li key={p.id} className="text-xs text-muted-foreground">
                          {p.status === "posted" ? "Posted" : "Failed"}
                          {p.posted_at ? ` · ${new Date(p.posted_at).toLocaleString()}` : ""}
                          {p.error ? ` · ${p.error}` : ""}
                          {p.status !== "posted" ? (
                            <button
                              type="button"
                              className="ml-2 underline"
                              onClick={() =>
                                post.mutate({
                                  data: { videoId: p.video_id, channelIds: [channel.id] },
                                })
                              }
                            >
                              Retry
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Post a finished video now</h2>
        {readyVideos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No finished videos yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {readyVideos.map((video) => (
              <li
                key={video.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="min-w-0 truncate text-sm text-foreground">{video.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={post.isPending || channels.length === 0}
                  onClick={() => post.mutate({ data: { videoId: video.id } })}
                >
                  <Send className="mr-2 h-4 w-4" /> Post
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
