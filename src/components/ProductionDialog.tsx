import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarClock, Clapperboard, Loader2, Play } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { CAPTION_PRESETS } from "@/lib/captionPresets";
import type { Scene, VideoStyle } from "@/lib/studio.functions";
import { queueFromPrompts, queueVideos } from "@/lib/studio.functions";
import { cn } from "@/lib/utils";
import type { VideoIngredients } from "@/lib/videoIngredients";

const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Hindi"];

const TRANSITIONS: Array<[VideoIngredients["transition"]["type"], string]> = [
  ["cut", "Hard cut"],
  ["crossfade", "Crossfade"],
  ["slide", "Slide"],
  ["zoom", "Zoom"],
];

const MOTIONS: Array<[VideoIngredients["motion"]["type"], string]> = [
  ["none", "Still"],
  ["zoom-in", "Zoom in"],
  ["zoom-out", "Zoom out"],
  ["pan-left", "Pan left"],
  ["pan-right", "Pan right"],
];

const MOODS: Array<[VideoIngredients["music"]["mood"], string]> = [
  ["calm", "Calm"],
  ["uplifting", "Uplifting"],
  ["tense", "Tense"],
  ["epic", "Epic"],
];

const GRADES: Array<[VideoIngredients["grade"], string]> = [
  ["none", "As generated"],
  ["warm", "Warm"],
  ["cool", "Cool"],
  ["mono", "Black & white"],
  ["vivid", "Vivid"],
  ["vhs", "Retro VHS"],
];

type ScriptRow = { id: string; title: string; scenes: unknown };

type Props = {
  style: VideoStyle | null;
  projectId: string | undefined;
  scripts: ScriptRow[];
  onClose: () => void;
  onQueued: () => Promise<unknown> | void;
};

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ProductionDialog({ style, projectId, scripts, onClose, onQueued }: Props) {
  const [scriptIds, setScriptIds] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [formats, setFormats] = useState<Array<"shorts" | "longform">>(["longform"]);
  const [captionPreset, setCaptionPreset] = useState("bold");
  const [transition, setTransition] =
    useState<VideoIngredients["transition"]["type"]>("crossfade");
  const [motion, setMotion] = useState<VideoIngredients["motion"]["type"]>("zoom-in");
  const [grade, setGrade] = useState<VideoIngredients["grade"]>("none");
  const [music, setMusic] = useState(true);
  const [mood, setMood] = useState<VideoIngredients["music"]["mood"]>("calm");
  const [sfx, setSfx] = useState(true);
  const [prompts, setPrompts] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<null | "now" | "later">(null);

  const runQueue = useServerFn(queueVideos);
  const runQueuePrompts = useServerFn(queueFromPrompts);

  const suggestions = useMemo(() => {
    const chosen = scripts.filter((s) => scriptIds.includes(s.id));
    return chosen.flatMap((s) => ((s.scenes as Scene[]) ?? []).map((scene) => scene.visual));
  }, [scripts, scriptIds]);

  if (!style) return null;

  const preset = CAPTION_PRESETS.find((p) => p.id === captionPreset) ?? CAPTION_PRESETS[1]!;
  const hasWork = scriptIds.length > 0 || prompts.trim().length > 2;
  const ready = Boolean(projectId) && hasWork && languages.length > 0 && formats.length > 0;

  const settings = {
    captions: preset.captions,
    transition: { type: transition, seconds: transition === "cut" ? 0 : 0.6 },
    motion: { type: motion, intensity: 0.5 },
    music: { enabled: music, mood, volume: 0.25 },
    sfx: { enabled: sfx, volume: 0.35 },
    grade,
  } as Record<string, unknown>;

  const start = async (when: "now" | "later") => {
    if (!projectId) return;
    const iso = when === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null;
    setBusy(when);
    try {
      if (scriptIds.length > 0) {
        await runQueue({
          data: { projectId, scriptIds, languages, style: style.id, formats, settings, scheduledAt: iso },
        });
      }
      if (prompts.trim().length > 2) {
        for (const format of formats) {
          await runQueuePrompts({
            data: {
              projectId,
              title: "Prompt video",
              prompts,
              language: languages[0] ?? "English",
              style: style.id,
              format,
              settings,
              scheduledAt: iso,
            },
          });
        }
      }
      await onQueued();
      toast.success(iso ? "Scheduled" : "Production started");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-5 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 shrink-0"
              onClick={onClose}
              aria-label="Back to video styles"
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <span
              className="h-10 w-16 shrink-0 rounded"
              style={{ background: style.swatch }}
              aria-hidden
            />
            <div className="min-w-0 text-left">
              <DialogTitle>{style.label} production</DialogTitle>
              <DialogDescription>{style.blurb}</DialogDescription>
            </div>
          </div>
        </DialogHeader>


        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Scripts from chat */}
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Scripts from your chat</h3>
              <p className="text-xs text-muted-foreground">
                Pick one or several. Each becomes its own video.
              </p>
            </div>
            {scripts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No scripts yet — write one from an idea in the chat first.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {scripts.map((script) => {
                  const on = scriptIds.includes(script.id);
                  const count = ((script.scenes as Scene[]) ?? []).length;
                  return (
                    <li key={script.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setScriptIds((current) =>
                            current.includes(script.id)
                              ? current.filter((id) => id !== script.id)
                              : [...current, script.id],
                          )
                        }
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          on ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                        )}
                      >
                        <span className="block truncate text-sm font-medium text-foreground">
                          {script.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {count} scenes
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Picture suggestions coming from the chosen scripts */}
          {suggestions.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Picture suggestions from the chat ({suggestions.length})
              </h3>
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs text-muted-foreground">
                {suggestions.slice(0, 40).map((visual, i) => (
                  <li key={i} className="truncate">
                    {i + 1}. {visual}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                These are the images that will be generated in the {style.label.toLowerCase()} look.
              </p>
            </section>
          ) : null}

          {/* Extra prompts */}
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Extra picture prompts</h3>
              <p className="text-xs text-muted-foreground">
                Paste image prompts from the chat — one per line — and they become an extra video.
              </p>
            </div>
            <Textarea
              rows={3}
              value={prompts}
              placeholder={"A lone hiker at dawn on a ridge\nClose-up of frost on a compass"}
              onChange={(e) => setPrompts(e.target.value)}
            />
          </section>

          {/* Language + format */}
          <section className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Languages</Label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((language) => (
                  <Chip
                    key={language}
                    on={languages.includes(language)}
                    onClick={() =>
                      setLanguages((current) =>
                        current.includes(language)
                          ? current.filter((l) => l !== language)
                          : [...current, language],
                      )
                    }
                  >
                    {language}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Length</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["shorts", "Shorts (9:16)"],
                    ["longform", "Long form (16:9)"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    on={formats.includes(value)}
                    onClick={() =>
                      setFormats((current) =>
                        current.includes(value)
                          ? current.filter((f) => f !== value)
                          : [...current, value],
                      )
                    }
                  >
                    {label}
                  </Chip>
                ))}
                <Chip
                  on={formats.length === 2}
                  onClick={() => setFormats(["shorts", "longform"])}
                >
                  Both
                </Chip>
              </div>
            </div>
          </section>

          {/* Premium captions */}
          <section className="space-y-2">
            <Label>Premium captions</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {CAPTION_PRESETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={captionPreset === option.id}
                  onClick={() => setCaptionPreset(option.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    captionPreset === option.id
                      ? "border-primary bg-accent"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: option.captions.enabled ? option.captions.color : undefined }}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.blurb}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Look and sound */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Transition</Label>
              <div className="flex flex-wrap gap-2">
                {TRANSITIONS.map(([value, label]) => (
                  <Chip key={value} on={transition === value} onClick={() => setTransition(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Camera motion</Label>
              <div className="flex flex-wrap gap-2">
                {MOTIONS.map(([value, label]) => (
                  <Chip key={value} on={motion === value} onClick={() => setMotion(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Colour look</Label>
              <div className="flex flex-wrap gap-2">
                {GRADES.map(([value, label]) => (
                  <Chip key={value} on={grade === value} onClick={() => setGrade(value)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sound</Label>
              <div className="flex flex-wrap gap-2">
                <Chip on={music} onClick={() => setMusic((v) => !v)}>
                  Background music
                </Chip>
                <Chip on={sfx} onClick={() => setSfx((v) => !v)}>
                  Sound effects
                </Chip>
              </div>
              {music ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {MOODS.map(([value, label]) => (
                    <Chip key={value} on={mood === value} onClick={() => setMood(value)}>
                      {label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Bottom bar */}
        <div className="space-y-3 border-t border-border bg-background p-5">
          <div className="space-y-1">
            <Label htmlFor="when" className="text-xs">
              Publish time (for “Generate later”)
            </Label>
            <Input
              id="when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!ready || !scheduledAt || busy !== null}
              onClick={() => start("later")}
            >
              {busy === "later" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="mr-2 h-4 w-4" />
              )}
              Generate later
            </Button>
            <Button className="flex-1" disabled={!ready || busy !== null} onClick={() => start("now")}>
              {busy === "now" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Generate now
            </Button>
          </div>
          {!hasWork ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clapperboard className="h-3.5 w-3.5" /> Pick at least one script, or paste some
              picture prompts.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
