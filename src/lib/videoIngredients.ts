/**
 * The production "ingredients" every finished video is assembled with.
 * Stored on the video row (videos.settings) so the editor can change them
 * and re-render without touching the script.
 */

export type CaptionSize = "sm" | "md" | "lg";
export type TransitionType = "cut" | "crossfade" | "slide" | "zoom";
export type MotionType = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type MusicMood = "calm" | "uplifting" | "tense" | "epic";
export type Grade = "none" | "warm" | "cool" | "mono" | "vivid" | "vhs";
export type VideoFormat = "shorts" | "longform";
/** How hard the browser works while putting the video together. */
export type RenderQuality = "draft" | "standard" | "high";

export type VideoIngredients = {
  captions: { enabled: boolean; size: CaptionSize; position: "bottom" | "center"; color: string };
  transition: { type: TransitionType; seconds: number };
  motion: { type: MotionType; intensity: number };
  music: { enabled: boolean; mood: MusicMood; volume: number };
  sfx: { enabled: boolean; volume: number };
  grade: Grade;
  titleCard: { enabled: boolean; text: string; seconds: number };
  pacing: { minSceneSeconds: number; gapSeconds: number };
  /** Shorts render vertical 9:16, longform renders 16:9. */
  format: VideoFormat;
  /** Lower quality finishes much faster — handy on a phone. */
  quality: RenderQuality;
};

export const DEFAULT_INGREDIENTS: VideoIngredients = {
  captions: { enabled: true, size: "md", position: "bottom", color: "#ffffff" },
  transition: { type: "crossfade", seconds: 0.6 },
  motion: { type: "zoom-in", intensity: 0.5 },
  music: { enabled: true, mood: "calm", volume: 0.25 },
  sfx: { enabled: true, volume: 0.35 },
  grade: "none",
  titleCard: { enabled: false, text: "", seconds: 2.5 },
  pacing: { minSceneSeconds: 2.5, gapSeconds: 0.2 },
  format: "longform",
  quality: "standard",
};

const CAPTION_SIZES: CaptionSize[] = ["sm", "md", "lg"];
const TRANSITIONS: TransitionType[] = ["cut", "crossfade", "slide", "zoom"];
const MOTIONS: MotionType[] = ["none", "zoom-in", "zoom-out", "pan-left", "pan-right"];
const MOODS: MusicMood[] = ["calm", "uplifting", "tense", "epic"];
const GRADES: Grade[] = ["none", "warm", "cool", "mono", "vivid", "vhs"];
export const QUALITIES: RenderQuality[] = ["draft", "standard", "high"];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Merges anything stored (or returned by the AI) onto the defaults, safely. */
export function normalizeIngredients(raw: unknown): VideoIngredients {
  const d = DEFAULT_INGREDIENTS;
  const r = (raw ?? {}) as Record<string, any>;
  const captions = r["captions"] ?? {};
  const transition = r["transition"] ?? {};
  const motion = r["motion"] ?? {};
  const music = r["music"] ?? {};
  const sfx = r["sfx"] ?? {};
  const titleCard = r["titleCard"] ?? {};
  const pacing = r["pacing"] ?? {};

  return {
    captions: {
      enabled: bool(captions.enabled, d.captions.enabled),
      size: pick(captions.size, CAPTION_SIZES, d.captions.size),
      position: captions.position === "center" ? "center" : "bottom",
      color: /^#[0-9a-f]{6}$/i.test(String(captions.color)) ? String(captions.color) : d.captions.color,
    },
    transition: {
      type: pick(transition.type, TRANSITIONS, d.transition.type),
      seconds: num(transition.seconds, 0, 2, d.transition.seconds),
    },
    motion: {
      type: pick(motion.type, MOTIONS, d.motion.type),
      intensity: num(motion.intensity, 0, 1, d.motion.intensity),
    },
    music: {
      enabled: bool(music.enabled, d.music.enabled),
      mood: pick(music.mood, MOODS, d.music.mood),
      volume: num(music.volume, 0, 1, d.music.volume),
    },
    sfx: {
      enabled: bool(sfx.enabled, d.sfx.enabled),
      volume: num(sfx.volume, 0, 1, d.sfx.volume),
    },
    grade: pick(r["grade"], GRADES, d.grade),
    titleCard: {
      enabled: bool(titleCard.enabled, d.titleCard.enabled),
      text: String(titleCard.text ?? d.titleCard.text).slice(0, 120),
      seconds: num(titleCard.seconds, 1, 6, d.titleCard.seconds),
    },
    pacing: {
      minSceneSeconds: num(pacing.minSceneSeconds, 1.5, 12, d.pacing.minSceneSeconds),
      gapSeconds: num(pacing.gapSeconds, 0, 2, d.pacing.gapSeconds),
    },
    format: r["format"] === "shorts" ? "shorts" : "longform",
    quality: pick(r["quality"], QUALITIES, d.quality),
  };
}
