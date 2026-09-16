/**
 * Browser-side video assembly: turns the generated scene images and narration
 * into a single playable file using canvas capture + MediaRecorder, applying
 * the production ingredients (captions, transitions, motion, music, sound
 * effects, colour grade, title card).
 * Only ever called from a click handler, never during SSR.
 */

import { DEFAULT_INGREDIENTS, type VideoIngredients } from "./videoIngredients";

export type RenderScene = { imageUrl: string; audioUrl: string | null; caption?: string };

// Set per render: 16:9 for longform, 9:16 for shorts.
let WIDTH = 1280;
let HEIGHT = 720;
let FPS = 24;
let BITRATE = 2_500_000;

/** Long edge, frame rate and bitrate per quality setting. */
const QUALITY_PRESETS = {
  draft: { long: 640, fps: 18, bitrate: 900_000 },
  standard: { long: 960, fps: 24, bitrate: 2_200_000 },
  high: { long: 1280, fps: 30, bitrate: 4_000_000 },
} as const;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A scene image could not be loaded."));
    img.src = url;
  });
}

const FILTERS: Record<string, string> = {
  none: "none",
  warm: "saturate(1.15) sepia(0.18) contrast(1.05)",
  cool: "saturate(1.05) hue-rotate(-12deg) brightness(0.97) contrast(1.05)",
  mono: "grayscale(1) contrast(1.15)",
  vivid: "saturate(1.45) contrast(1.1)",
  vhs: "saturate(1.35) contrast(1.15) hue-rotate(4deg)",
};

type Frame = { img: HTMLImageElement; zoom: number; panX: number; alpha: number; offsetX: number };

function drawFrame(ctx: CanvasRenderingContext2D, frame: Frame, grade: string): void {
  const { img, zoom, panX, alpha, offsetX } = frame;
  const scale = Math.max(WIDTH / img.width, HEIGHT / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = FILTERS[grade] ?? "none";
  ctx.drawImage(img, (WIDTH - w) / 2 + panX + offsetX, (HEIGHT - h) / 2, w, h);
  ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = "#000";
  for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 2);
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Splits narration into short on-screen chunks that follow the voice. */
function captionChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 7) chunks.push(words.slice(i, i + 7).join(" "));
  return chunks;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  ingredients: VideoIngredients,
): void {
  if (!text) return;
  const k = Math.max(WIDTH, HEIGHT) / 1280;
  const base = ingredients.captions.size === "sm" ? 34 : ingredients.captions.size === "lg" ? 58 : 44;
  const size = base * k;
  ctx.save();
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapLines(ctx, text, WIDTH * 0.8);
  const lineHeight = size * 1.28;
  const blockHeight = lines.length * lineHeight;
  const centerY =
    ingredients.captions.position === "center" ? HEIGHT / 2 : HEIGHT - 80 * k - blockHeight / 2;

  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const padX = 28 * k;
  const padY = 18 * k;
  ctx.beginPath();
  const boxX = (WIDTH - widest) / 2 - padX;
  const boxY = centerY - blockHeight / 2 - padY;
  const boxW = widest + padX * 2;
  const boxH = blockHeight + padY * 2;
  const r = 16 * k;
  ctx.moveTo(boxX + r, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
  ctx.fill();

  ctx.fillStyle = ingredients.captions.color;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, centerY - blockHeight / 2 + lineHeight * (i + 0.5));
  });
  ctx.restore();
}

function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  title: string,
  t: number,
  duration: number,
  grade: string,
): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (img) drawFrame(ctx, { img, zoom: 1.08 - (t / duration) * 0.04, panX: 0, alpha: 1, offsetX: 0 }, grade);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const fade = Math.min(1, t / 0.5) * Math.min(1, (duration - t) / 0.5);
  ctx.globalAlpha = Math.max(0, fade);
  const k = Math.max(WIDTH, HEIGHT) / 1280;
  ctx.font = `800 ${72 * k}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const lines = wrapLines(ctx, title, WIDTH * 0.8);
  const lh = 88 * k;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, HEIGHT / 2 - ((lines.length - 1) * lh) / 2 + i * lh);
  });
  ctx.restore();
}

const MOOD_CHORDS: Record<string, number[]> = {
  calm: [196, 246.94, 293.66],
  uplifting: [261.63, 329.63, 392],
  tense: [146.83, 174.61, 220],
  epic: [130.81, 196, 261.63],
};

/** A simple generated pad so every video has a bed of background music. */
function startMusic(
  ctx: AudioContext,
  destination: AudioNode,
  mood: string,
  volume: number,
): () => void {
  const master = ctx.createGain();
  master.gain.value = volume * 0.18;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.connect(master);
  master.connect(destination);

  const nodes: OscillatorNode[] = [];
  for (const freq of MOOD_CHORDS[mood] ?? MOOD_CHORDS["calm"]!) {
    for (const [type, detune, gain] of [
      ["sine", 0, 0.5],
      ["triangle", 6, 0.22],
    ] as Array<[OscillatorType, number, number]>) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start();
      nodes.push(osc);
    }
  }

  // Slow breathing movement so the pad doesn't sit flat.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = volume * 0.06;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();

  return () => {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    window.setTimeout(() => {
      for (const n of nodes) n.stop();
      lfo.stop();
    }, 1200);
  };
}

/** A short filtered noise sweep played on every scene change. */
function playWhoosh(ctx: AudioContext, destination: AudioNode, volume: number): void {
  const length = Math.floor(ctx.sampleRate * 0.7);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(320, ctx.currentTime);
  band.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + 0.5);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.5), ctx.currentTime + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
  source.connect(band).connect(gain).connect(destination);
  source.start();
}

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

export async function renderVideo(
  scenes: RenderScene[],
  ingredients: VideoIngredients = DEFAULT_INGREDIENTS,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser can't assemble the video. Try Chrome on desktop.");
  }

  const preset = QUALITY_PRESETS[ingredients.quality] ?? QUALITY_PRESETS.standard;
  const long = Math.round(preset.long / 2) * 2;
  const short = Math.round((long * 9) / 16 / 2) * 2;
  if (ingredients.format === "shorts") {
    WIDTH = short;
    HEIGHT = long;
  } else {
    WIDTH = long;
    HEIGHT = short;
  }
  FPS = preset.fps;
  BITRATE = preset.bitrate;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't assemble the video.");

  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();

  // Decode narration up front so scene lengths are known.
  const buffers: Array<AudioBuffer | null> = [];
  for (const scene of scenes) {
    if (!scene.audioUrl) {
      buffers.push(null);
      continue;
    }
    try {
      const bytes = await (await fetch(scene.audioUrl)).arrayBuffer();
      buffers.push(await audioCtx.decodeAudioData(bytes));
    } catch {
      buffers.push(null);
    }
  }

  const images = await Promise.all(scenes.map((s) => loadImage(s.imageUrl)));

  const stream = canvas.captureStream(FPS);
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);

  const chunks: BlobPart[] = [];
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const { minSceneSeconds, gapSeconds } = ingredients.pacing;
  const durations = scenes.map((_s, i) =>
    Math.max(buffers[i]?.duration ?? 4, minSceneSeconds) + gapSeconds,
  );
  const titleSeconds =
    ingredients.titleCard.enabled && ingredients.titleCard.text ? ingredients.titleCard.seconds : 0;
  const total = durations.reduce((a, b) => a + b, 0) + titleSeconds;

  await audioCtx.resume();
  const stopMusic = ingredients.music.enabled
    ? startMusic(audioCtx, destination, ingredients.music.mood, ingredients.music.volume)
    : null;
  recorder.start();

  let elapsed = 0;

  // Drive frames with requestAnimationFrame, but always keep a timer fallback
  // running: browsers freeze rAF in a background tab, which used to leave a
  // render stuck forever at "rendering".
  const animate = (duration: number, draw: (t: number) => void) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      let done = false;
      const step = () => {
        if (done) return;
        const t = (performance.now() - start) / 1000;
        if (t >= duration) {
          done = true;
          resolve();
          return;
        }
        draw(t);
        onProgress?.(Math.min(0.99, (elapsed + t) / total));
        schedule();
      };
      const schedule = () => {
        let fired = false;
        const once = () => {
          if (fired) return;
          fired = true;
          step();
        };
        requestAnimationFrame(once);
        window.setTimeout(once, 120);
      };
      schedule();
    });

  if (titleSeconds > 0) {
    await animate(titleSeconds, (t) =>
      drawTitleCard(ctx, images[0], ingredients.titleCard.text, t, titleSeconds, ingredients.grade),
    );
    elapsed += titleSeconds;
  }

  for (let i = 0; i < scenes.length; i += 1) {
    const buffer = buffers[i] ?? null;
    const duration = durations[i]!;

    if (buffer) {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.start();
    }
    if (ingredients.sfx.enabled && (i > 0 || titleSeconds > 0)) {
      playWhoosh(audioCtx, destination, ingredients.sfx.volume);
    }

    const image = images[i]!;
    const previous = i > 0 ? images[i - 1] : undefined;
    const chunksText = ingredients.captions.enabled ? captionChunks(scenes[i]?.caption ?? "") : [];
    const trans = ingredients.transition;
    const transSeconds = trans.type === "cut" ? 0 : Math.min(trans.seconds, duration / 2);
    const amp = 0.14 * ingredients.motion.intensity;

    await animate(duration, (t) => {
      const p = t / duration;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      let zoom = 1;
      let panX = 0;
      if (ingredients.motion.type === "zoom-in") zoom = 1 + p * amp;
      else if (ingredients.motion.type === "zoom-out") zoom = 1 + amp - p * amp;
      else if (ingredients.motion.type === "pan-left") {
        zoom = 1 + amp;
        panX = p * amp * WIDTH * 0.5;
      } else if (ingredients.motion.type === "pan-right") {
        zoom = 1 + amp;
        panX = -p * amp * WIDTH * 0.5;
      }

      const inTransition = transSeconds > 0 && t < transSeconds && (previous || titleSeconds > 0);
      const k = inTransition ? t / transSeconds : 1;

      if (inTransition && previous && trans.type === "crossfade") {
        drawFrame(ctx, { img: previous, zoom: 1 + amp, panX: 0, alpha: 1, offsetX: 0 }, ingredients.grade);
        drawFrame(ctx, { img: image, zoom, panX, alpha: k, offsetX: 0 }, ingredients.grade);
      } else if (inTransition && previous && trans.type === "slide") {
        drawFrame(
          ctx,
          { img: previous, zoom: 1 + amp, panX: 0, alpha: 1, offsetX: -k * WIDTH },
          ingredients.grade,
        );
        drawFrame(
          ctx,
          { img: image, zoom, panX, alpha: 1, offsetX: (1 - k) * WIDTH },
          ingredients.grade,
        );
      } else if (inTransition && trans.type === "zoom") {
        if (previous)
          drawFrame(ctx, { img: previous, zoom: 1 + amp, panX: 0, alpha: 1, offsetX: 0 }, ingredients.grade);
        drawFrame(
          ctx,
          { img: image, zoom: zoom * (1.18 - k * 0.18), panX, alpha: k, offsetX: 0 },
          ingredients.grade,
        );
      } else {
        drawFrame(ctx, { img: image, zoom, panX, alpha: 1, offsetX: 0 }, ingredients.grade);
      }

      if (ingredients.grade === "vhs") drawScanlines(ctx);

      if (chunksText.length > 0) {
        const spoken = Math.max(0.5, duration - gapSeconds);
        const index = Math.min(chunksText.length - 1, Math.floor((t / spoken) * chunksText.length));
        drawCaption(ctx, chunksText[index] ?? "", ingredients);
      }
    });

    elapsed += duration;
  }

  recorder.stop();
  const blob = await finished;
  stopMusic?.();
  await audioCtx.close();
  onProgress?.(1);
  return blob;
}
