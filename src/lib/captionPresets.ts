import type { VideoIngredients } from "./videoIngredients";

/**
 * Ready-made caption looks. Each one is just a caption configuration, so the
 * renderer needs no extra work — the studio simply applies the preset.
 */
export type CaptionPreset = {
  id: string;
  label: string;
  blurb: string;
  captions: VideoIngredients["captions"];
};

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "none",
    label: "No captions",
    blurb: "Picture and voice only.",
    captions: { enabled: false, size: "md", position: "bottom", color: "#ffffff" },
  },
  {
    id: "clean",
    label: "Clean white",
    blurb: "Subtle, documentary style.",
    captions: { enabled: true, size: "md", position: "bottom", color: "#ffffff" },
  },
  {
    id: "bold",
    label: "Bold centre",
    blurb: "Big words in the middle — made for shorts.",
    captions: { enabled: true, size: "lg", position: "center", color: "#ffffff" },
  },
  {
    id: "gold",
    label: "Gold pop",
    blurb: "Warm highlight that reads on any footage.",
    captions: { enabled: true, size: "lg", position: "bottom", color: "#ffd166" },
  },
  {
    id: "neon",
    label: "Neon",
    blurb: "High-energy green, gaming and tech.",
    captions: { enabled: true, size: "lg", position: "center", color: "#39ff88" },
  },
  {
    id: "sky",
    label: "Sky blue",
    blurb: "Cool and calm, good over warm scenes.",
    captions: { enabled: true, size: "md", position: "bottom", color: "#7dd3fc" },
  },
];

export function captionPresetId(captions: VideoIngredients["captions"]): string {
  if (!captions.enabled) return "none";
  const match = CAPTION_PRESETS.find(
    (p) =>
      p.captions.enabled &&
      p.captions.size === captions.size &&
      p.captions.position === captions.position &&
      p.captions.color.toLowerCase() === captions.color.toLowerCase(),
  );
  return match?.id ?? "custom";
}
