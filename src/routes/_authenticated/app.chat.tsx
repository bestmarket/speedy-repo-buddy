import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clapperboard, FileText, Loader2, Lightbulb, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  deleteScript,
  generateIdeas,
  saveChatScript,
  studioChat,
  toggleIdea,
  writeScript,
} from "@/lib/studio.functions";
import { useRefreshWorkspace, useWorkspace } from "@/lib/useWorkspace";

export const Route = createFileRoute("/_authenticated/app/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Channel Studio" },
      {
        name: "description",
        content: "Talk to your channel assistant, generate ideas and turn them into scripts.",
      },
      { property: "og:title", content: "Chat — Channel Studio" },
      {
        property: "og:description",
        content: "Talk to your channel assistant, generate ideas and turn them into scripts.",
      },
    ],
  }),
  component: ChatPage,
});

type ChatMessage = { role: "user" | "assistant"; content: string };

function ChatPage() {
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const projectId = workspace.data?.project.id;
  const hasProfile = Boolean(workspace.data?.project.channel_profile);

  const brainstorm = workspace.data?.project.brainstorm ?? null;
  const brainstormAt = workspace.data?.project.brainstorm_at ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");

  const send = useMutation({
    mutationFn: useServerFn(studioChat),
    onSuccess: (res: unknown) =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: String((res as { reply?: string })?.reply ?? "") },
      ]),
    onError: (e: Error) => toast.error(e.message),
  });

  const makeIdeas = useMutation({
    mutationFn: useServerFn(generateIdeas),
    onSuccess: async () => {
      await refresh();
      toast.success("New ideas ready");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = useMutation({
    mutationFn: useServerFn(toggleIdea),
    onSuccess: () => refresh(),
  });

  const [scriptingId, setScriptingId] = useState<string | null>(null);
  const script = useMutation({
    mutationFn: useServerFn(writeScript),
    onSuccess: async () => {
      setScriptingId(null);
      await refresh();
      toast.success("Script written");
    },
    onError: (e: Error) => {
      setScriptingId(null);
      toast.error(e.message);
    },
  });

  const removeScript = useMutation({
    mutationFn: useServerFn(deleteScript),
    onSuccess: () => refresh(),
  });

  // Send a script the assistant just wrote (and any image prompts in it)
  // straight into the Studio production settings.
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const runSaveChatScript = useServerFn(saveChatScript);
  const saveFromChat = useMutation({
    mutationFn: runSaveChatScript,
    onSuccess: async () => {
      setSavingIndex(null);
      await refresh();
      toast.success("Saved — pick it in Studio under a video style");
    },
    onError: (e: Error) => {
      setSavingIndex(null);
      toast.error(e.message);
    },
  });

  const ideas = workspace.data?.ideas ?? [];
  const scripts = workspace.data?.scripts ?? [];

  function submit(value: string) {
    const content = value.trim();
    if (!content || !projectId) return;
    const history = messages.slice(-10);
    setMessages((m) => [...m, { role: "user", content }]);
    setText("");
    send.mutate({ data: { projectId, message: content, history } });
  }

  if (workspace.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your channel…
      </div>
    );
  }

  const quickSteps = [
    {
      label: "Channel name ideas",
      prompt:
        "Let's build my channel. Give me channel name ideas that fit this niche and tone, with the reasoning for each.",
    },
    {
      label: "Unique video ideas",
      prompt:
        "Give me original video ideas in this channel's exact style — unique angles from the gaps the reference channel leaves open.",
    },
    {
      label: "High-CTR titles & thumbnails",
      prompt:
        "Give me high-CTR titles and thumbnail concepts for my best ideas — title formulas, thumbnail composition, text and emotion.",
    },
    {
      label: "Script in the channel's style",
      prompt:
        "Write a full high-quality script modeling this channel's style — hook, open loops, payoff placement and CTA. Use my top kept idea.",
    },
    {
      label: "Growth plan",
      prompt:
        "Give me a growth plan for this channel: upload cadence, series formats, and how videos should funnel into each other.",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex h-[30rem] flex-col rounded-lg border border-border">
        <Conversation>
          <ConversationContent>
            {brainstorm ? (
              <Message from="assistant">
                <MessageContent>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Channel intelligence report — how the whole channel wins
                    {brainstormAt ? ` · ${new Date(brainstormAt).toLocaleString()}` : ""}
                  </p>
                  <MessageResponse>{brainstorm}</MessageResponse>
                </MessageContent>
              </Message>
            ) : null}
            {messages.length === 0 && !brainstorm ? (
              <div className="m-auto max-w-sm space-y-2 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Your channel strategist</p>
                <p>
                  I model the whole reference channel — its virality, voice, hooks, visuals and
                  growth — then walk you step by step: name, ideas, titles, thumbnails and scripts
                  in that channel's style.
                </p>
                <p className="text-xs">
                  Analyse the reference videos on the Sources tab first, then pick a step below.
                </p>
              </div>
            ) : (
              messages.map((message, i) => (
                <Message from={message.role} key={i}>
                  <MessageContent>
                    <MessageResponse>{message.content}</MessageResponse>
                    {message.role === "assistant" && message.content.trim().length > 200 ? (
                      <div className="mt-3 border-t border-border pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!projectId || saveFromChat.isPending}
                          onClick={() => {
                            if (!projectId) return;
                            setSavingIndex(i);
                            saveFromChat.mutate({
                              data: { projectId, text: message.content },
                            });
                          }}
                        >
                          {savingIndex === i ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                            </>
                          ) : (
                            <>
                              <Clapperboard className="mr-2 h-4 w-4" /> Use this in Studio
                            </>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </MessageContent>
                </Message>
              ))
            )}
            {send.isPending ? <Shimmer>Studying your channel…</Shimmer> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {quickSteps.map((step) => (
              <button
                key={step.label}
                type="button"
                disabled={send.isPending || !projectId}
                onClick={() => submit(step.prompt)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {step.label}
              </button>
            ))}
          </div>
          <PromptInput
            onSubmit={(_message, event) => {
              event.preventDefault();
              submit(text);
            }}
          >
            <PromptInputTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your channel's strategy, ideas, titles, thumbnails, scripts…"
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                {...(send.isPending ? { status: "submitted" as const } : {})}
                disabled={!text.trim() || send.isPending}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Ideas</h2>
          <Button
            size="sm"
            variant="outline"
            disabled={!projectId || !hasProfile || makeIdeas.isPending}
            onClick={() => projectId && makeIdeas.mutate({ data: { projectId, count: 6 } })}
          >
            {makeIdeas.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-4 w-4" /> Generate ideas
              </>
            )}
          </Button>
        </div>

        {!hasProfile ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Clone your channel on the Sources tab first, then ideas will match its voice.
          </p>
        ) : ideas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No ideas yet. Generate a batch to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {ideas.map((idea) => (
              <li key={idea.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{idea.title}</p>
                    {idea.hook ? (
                      <p className="mt-1 text-sm text-muted-foreground">“{idea.hook}”</p>
                    ) : null}
                    {idea.angle ? (
                      <p className="mt-1 text-xs text-muted-foreground">{idea.angle}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant={idea.selected ? "secondary" : "ghost"}
                      onClick={() =>
                        pick.mutate({ data: { id: idea.id, selected: !idea.selected } })
                      }
                    >
                      {idea.selected ? <Check className="h-4 w-4" /> : "Keep"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={script.isPending}
                      onClick={() => {
                        if (!projectId) return;
                        setScriptingId(idea.id);
                        script.mutate({
                          data: { projectId, ideaId: idea.id, sceneCount: 6 },
                        });
                      }}
                    >
                      {scriptingId === idea.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Write script"
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Scripts</h2>
        {scripts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Scripts you write from ideas will appear here, ready for the Studio tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {scripts.map((row) => {
              const scenes = (row.scenes as unknown as Array<{ narration: string }>) ?? [];
              return (
                <li key={row.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FileText className="h-4 w-4 shrink-0" />
                        {row.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scenes.length} scenes
                        {row.tags?.length ? ` · ${row.tags.slice(0, 4).join(", ")}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete script"
                      onClick={() => removeScript.mutate({ data: { id: row.id } })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Read the script
                    </summary>
                    <ol className="mt-2 space-y-2">
                      {scenes.map((scene, i) => (
                        <li key={i} className="text-sm text-foreground">
                          <span className="text-muted-foreground">{i + 1}. </span>
                          {scene.narration}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
