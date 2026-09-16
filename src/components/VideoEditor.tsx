import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Mic, Save, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Scene } from "@/lib/studio.functions";
import {
  editVideoByPrompt,
  regenerateScene,
  signAssets,
  updateVideoSettings,
} from "@/lib/studio.functions";
import { normalizeIngredients, QUALITIES, type VideoIngredients } from "@/lib/videoIngredients";

type EditableVideo = {
  id: string;
  title: string;
  scenes: unknown;
  settings?: unknown;
};

type Props = {
  video: EditableVideo | null;
  onClose: () => void;
  onChanged: () => Promise<unknown> | void;
  onRerender: (videoId: string) => void;
};

export function VideoEditor({ video, onClose, onChanged, onRerender }: Props) {
  const [ingredients, setIngredients] = useState<VideoIngredients>(() =>
    normalizeIngredients(video?.settings),
  );
  const [prompt, setPrompt] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busyScene, setBusyScene] = useState<number | null>(null);

  const runSign = useServerFn(signAssets);

  useEffect(() => {
    if (!video) return;
    setIngredients(normalizeIngredients(video.settings));
    setScenes(((video.scenes as Scene[]) ?? []).map((s) => ({ ...s })));
    setPrompt("");
  }, [video]);

  const imagePaths = useMemo(
    () => scenes.map((s) => s.imagePath).filter((p): p is string => Boolean(p)),
    [scenes],
  );

  useEffect(() => {
    if (imagePaths.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const signed = await runSign({ data: { paths: imagePaths } });
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of signed) if (row.url) map[row.path] = row.url;
        setPreviews((p) => ({ ...p, ...map }));
      } catch {
        /* previews are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePaths, runSign]);

  const set = <K extends keyof VideoIngredients>(key: K, value: VideoIngredients[K]) =>
    setIngredients((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: useServerFn(updateVideoSettings),
    onSuccess: async () => {
      await onChanged();
      toast.success("Ingredients saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const askEdit = useMutation({
    mutationFn: useServerFn(editVideoByPrompt),
    onSuccess: async (raw) => {
      const result = raw as {
        video: { settings?: unknown; scenes?: unknown };
        summary: string;
      };
      setIngredients(normalizeIngredients(result.video.settings));
      setScenes(((result.video.scenes as Scene[]) ?? []).map((s) => ({ ...s })));
      setPrompt("");
      await onChanged();
      toast.success(result.summary);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runRegenerate = useServerFn(regenerateScene);

  const regenerate = async (index: number, kind: "image" | "audio") => {
    if (!video) return;
    setBusyScene(index);
    try {
      const scene = scenes[index]!;
      const updated = await runRegenerate({
        data: {
          videoId: video.id,
          index,
          visual: scene.visual,
          narration: scene.narration,
          image: kind === "image",
          audio: kind === "audio",
        },
      });
      setScenes(((updated.scenes as unknown as Scene[]) ?? []).map((s) => ({ ...s })));
      await onChanged();
      toast.success(kind === "image" ? "New picture generated" : "New voice recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusyScene(null);
    }
  };

  if (!video) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-y-auto p-4 sm:w-full sm:p-6">
        <DialogHeader>
          <DialogTitle className="truncate">Edit “{video.title}”</DialogTitle>
          <DialogDescription>
            Change anything by describing it, or set the ingredients by hand. Re-render when you're
            happy.
          </DialogDescription>
        </DialogHeader>

        {/* Prompt-driven editing */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Label htmlFor="edit-prompt" className="text-xs">
            Describe the change
          </Label>
          <Textarea
            id="edit-prompt"
            rows={2}
            value={prompt}
            placeholder="Add big captions, use tense music, and make scene 2 a night-time city street"
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={prompt.trim().length < 2 || askEdit.isPending}
            onClick={() => askEdit.mutate({ data: { videoId: video.id, prompt } })}
          >
            {askEdit.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Apply with AI
              </>
            )}
          </Button>
        </div>

        <Tabs defaultValue="ingredients">
          <TabsList className="w-full">
            <TabsTrigger value="ingredients" className="flex-1">
              Ingredients
            </TabsTrigger>
            <TabsTrigger value="scenes" className="flex-1">
              Scenes ({scenes.length})
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Ingredients ---------------- */}
          <TabsContent value="ingredients" className="space-y-4 pt-4">
            <Row label="Captions" hint="Burn the spoken words onto the picture.">
              <Switch
                checked={ingredients.captions.enabled}
                onCheckedChange={(v) => set("captions", { ...ingredients.captions, enabled: v })}
              />
            </Row>
            {ingredients.captions.enabled ? (
              <div className="grid grid-cols-2 gap-2 pl-1 sm:grid-cols-3">
                <Picker
                  label="Size"
                  value={ingredients.captions.size}
                  options={[
                    ["sm", "Small"],
                    ["md", "Medium"],
                    ["lg", "Large"],
                  ]}
                  onChange={(v) =>
                    set("captions", { ...ingredients.captions, size: v as "sm" | "md" | "lg" })
                  }
                />
                <Picker
                  label="Position"
                  value={ingredients.captions.position}
                  options={[
                    ["bottom", "Bottom"],
                    ["center", "Middle"],
                  ]}
                  onChange={(v) =>
                    set("captions", {
                      ...ingredients.captions,
                      position: v as "bottom" | "center",
                    })
                  }
                />
                <div className="space-y-1">
                  <Label className="text-xs">Colour</Label>
                  <Input
                    type="color"
                    className="h-9 p-1"
                    value={ingredients.captions.color}
                    onChange={(e) =>
                      set("captions", { ...ingredients.captions, color: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Picker
                label="Transition"
                value={ingredients.transition.type}
                options={[
                  ["cut", "Hard cut"],
                  ["crossfade", "Crossfade"],
                  ["slide", "Slide"],
                  ["zoom", "Zoom"],
                ]}
                onChange={(v) =>
                  set("transition", { ...ingredients.transition, type: v as never })
                }
              />
              <Picker
                label="Camera motion"
                value={ingredients.motion.type}
                options={[
                  ["none", "Still"],
                  ["zoom-in", "Zoom in"],
                  ["zoom-out", "Zoom out"],
                  ["pan-left", "Pan left"],
                  ["pan-right", "Pan right"],
                ]}
                onChange={(v) => set("motion", { ...ingredients.motion, type: v as never })}
              />
            </div>

            <Range
              label="Motion strength"
              value={ingredients.motion.intensity}
              onChange={(v) => set("motion", { ...ingredients.motion, intensity: v })}
            />

            <Row label="Background music" hint="A generated pad under the narration.">
              <Switch
                checked={ingredients.music.enabled}
                onCheckedChange={(v) => set("music", { ...ingredients.music, enabled: v })}
              />
            </Row>
            {ingredients.music.enabled ? (
              <div className="grid grid-cols-1 gap-2 pl-1 sm:grid-cols-2">
                <Picker
                  label="Mood"
                  value={ingredients.music.mood}
                  options={[
                    ["calm", "Calm"],
                    ["uplifting", "Uplifting"],
                    ["tense", "Tense"],
                    ["epic", "Epic"],
                  ]}
                  onChange={(v) => set("music", { ...ingredients.music, mood: v as never })}
                />
                <Range
                  label="Volume"
                  value={ingredients.music.volume}
                  onChange={(v) => set("music", { ...ingredients.music, volume: v })}
                />
              </div>
            ) : null}

            <Row label="Sound effects" hint="A whoosh on every scene change.">
              <Switch
                checked={ingredients.sfx.enabled}
                onCheckedChange={(v) => set("sfx", { ...ingredients.sfx, enabled: v })}
              />
            </Row>
            {ingredients.sfx.enabled ? (
              <div className="pl-1">
                <Range
                  label="Effect volume"
                  value={ingredients.sfx.volume}
                  onChange={(v) => set("sfx", { ...ingredients.sfx, volume: v })}
                />
              </div>
            ) : null}

            <Picker
              label="Colour look"
              value={ingredients.grade}
              options={[
                ["none", "As generated"],
                ["warm", "Warm"],
                ["cool", "Cool"],
                ["mono", "Black & white"],
                ["vivid", "Vivid"],
                ["vhs", "Retro VHS"],
              ]}
              onChange={(v) => set("grade", v as never)}
            />

            <Row label="Opening title card" hint="A title over the first picture.">
              <Switch
                checked={ingredients.titleCard.enabled}
                onCheckedChange={(v) =>
                  set("titleCard", {
                    ...ingredients.titleCard,
                    enabled: v,
                    text: ingredients.titleCard.text || video.title,
                  })
                }
              />
            </Row>
            {ingredients.titleCard.enabled ? (
              <Input
                className="ml-1"
                value={ingredients.titleCard.text}
                placeholder="Title text"
                onChange={(e) =>
                  set("titleCard", { ...ingredients.titleCard, text: e.target.value })
                }
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Shortest scene (seconds)</Label>
                <Input
                  type="number"
                  min={1.5}
                  max={12}
                  step={0.5}
                  value={ingredients.pacing.minSceneSeconds}
                  onChange={(e) =>
                    set("pacing", {
                      ...ingredients.pacing,
                      minSceneSeconds: Number(e.target.value) || 3,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pause between scenes</Label>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={ingredients.pacing.gapSeconds}
                  onChange={(e) =>
                    set("pacing", {
                      ...ingredients.pacing,
                      gapSeconds: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <Picker
              label="Picture quality"
              value={ingredients.quality}
              options={
                QUALITIES.map((q) => [
                  q,
                  q === "draft"
                    ? "Quick draft — fastest"
                    : q === "standard"
                      ? "Standard — balanced"
                      : "High — slowest",
                ]) as Array<[string, string]>
              }
              onChange={(value) => set("quality", value as typeof ingredients.quality)}
            />
          </TabsContent>

          {/* ---------------- Scenes ---------------- */}
          <TabsContent value="scenes" className="space-y-4 pt-4">
            {/* Timeline strip: tap a scene to jump straight to it. */}
            {scenes.length > 1 ? (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {scenes.map((scene, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(`scene-${index}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="relative h-14 w-24 shrink-0 overflow-hidden rounded border border-border bg-muted"
                    aria-label={`Go to scene ${index + 1}`}
                  >
                    {scene.imagePath && previews[scene.imagePath] ? (
                      <img
                        src={previews[scene.imagePath]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <span className="absolute bottom-0 left-0 rounded-tr bg-background/85 px-1.5 text-[10px] font-medium text-foreground">
                      {index + 1}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {scenes.map((scene, index) => (
              <div
                key={index}
                id={`scene-${index}`}
                className="scroll-mt-4 space-y-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  {scene.imagePath && previews[scene.imagePath] ? (
                    <img
                      src={previews[scene.imagePath]}
                      alt={`Scene ${index + 1}`}
                      className="h-32 w-full shrink-0 rounded object-cover sm:h-20 sm:w-32"
                    />
                  ) : (
                    <div className="flex h-32 w-full shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground sm:h-20 sm:w-32">
                      No picture yet
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label className="text-xs">Scene {index + 1} · picture prompt</Label>
                    <Textarea
                      rows={2}
                      value={scene.visual}
                      onChange={(e) =>
                        setScenes((current) =>
                          current.map((s, i) =>
                            i === index ? { ...s, visual: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <Label className="text-xs">Spoken words</Label>
                <Textarea
                  rows={2}
                  value={scene.narration}
                  onChange={(e) =>
                    setScenes((current) =>
                      current.map((s, i) =>
                        i === index ? { ...s, narration: e.target.value } : s,
                      ),
                    )
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyScene !== null}
                    onClick={() => regenerate(index, "image")}
                  >
                    {busyScene === index ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-2 h-4 w-4" />
                    )}
                    New picture
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyScene !== null}
                    onClick={() => regenerate(index, "audio")}
                  >
                    {busyScene === index ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mic className="mr-2 h-4 w-4" />
                    )}
                    New voice
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-border bg-background px-4 pb-1 pt-3 sm:mx-0 sm:px-0 sm:pb-0 sm:pt-4">
          <Button
            variant="outline"
            className="min-h-11 flex-1 sm:flex-none"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ data: { videoId: video.id, settings: ingredients as never } })
            }
          >
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
          <Button
            className="min-h-11 flex-1"
            disabled={save.isPending}
            onClick={async () => {
              await save.mutateAsync({
                data: { videoId: video.id, settings: ingredients as never },
              });
              onClose();
              onRerender(video.id);
            }}
          >
            <Wand2 className="mr-2 h-4 w-4" /> Save & re-render
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Range({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label} · {Math.round(value * 100)}%
      </Label>
      <Slider
        value={[value]}
        min={0}
        max={1}
        step={0.05}
        onValueChange={([v]) => onChange(v ?? 0)}
      />
    </div>
  );
}
