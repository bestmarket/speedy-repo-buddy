import { logUsage, resolveProvider } from "./aiConfig.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project yet.");
  return key;
}

async function gatewayError(res: Response): Promise<Error> {
  let message = `AI request failed (${res.status})`;
  try {
    const body = (await res.json()) as {
      message?: string;
      error?: { message?: string } | string;
    };
    const err = body.error;
    message = (typeof err === "string" ? err : err?.message) ?? body.message ?? message;
  } catch {
    /* keep default */
  }
  if (res.status === 429) return new Error("The AI is busy right now. Try again in a moment.");
  if (res.status === 402)
    return new Error("You've run out of AI credits. Add more credits to keep generating.");
  if (res.status === 403) return new Error(`AI access is blocked: ${message}`);
  return new Error(message);
}

/* ------------------------------------------------------------------ text */

async function gatewayText(system: string, prompt: string, reasoning: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: system,
      input: prompt,
      stream: true,
      reasoning: { effort: reasoning },
    }),
  });

  if (!res.ok || !res.body) throw await gatewayError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        }
      } catch {
        /* ignore partial frames */
      }
    }
  }

  return text.trim();
}

async function geminiText(key: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) throw await gatewayError(res);
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

async function openaiText(key: string, system: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw await gatewayError(res);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (body.choices?.[0]?.message?.content ?? "").trim();
}

async function claudeText(key: string, system: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw await gatewayError(res);
  const body = (await res.json()) as { content?: Array<{ text?: string }> };
  return (body.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

/** Returns a text answer from whichever writing engine the admin panel selected. */
export async function askAI(
  system: string,
  prompt: string,
  opts?: { reasoning?: "low" | "medium" | "high" },
): Promise<string> {
  const provider = await resolveProvider("llm");
  const reasoning = opts?.reasoning ?? "low";
  let text: string;
  try {
    if (provider.id === "openai-gpt4o" && provider.apiKey) {
      text = await openaiText(provider.apiKey, system, prompt);
    } else if (provider.id === "claude-sonnet" && provider.apiKey) {
      text = await claudeText(provider.apiKey, system, prompt);
    } else if (provider.id === "gemini-flash" && provider.apiKey) {
      text = await geminiText(provider.apiKey, system, prompt);
    } else {
      text = await gatewayText(system, prompt, reasoning);
    }
  } catch (error) {
    await logUsage({ category: "llm", provider: provider.id, success: false });
    throw error;
  }
  await logUsage({ category: "llm", provider: provider.id });
  return text;
}

function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end === -1) throw new Error("The AI returned an unexpected answer.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/** Asks the writing model for JSON and parses it. */
export async function askAIJson<T>(
  system: string,
  prompt: string,
  opts?: { reasoning?: "low" | "medium" | "high" },
): Promise<T> {
  const raw = await askAI(
    `${system}\n\nAlways reply with valid JSON only. No markdown fences, no commentary.`,
    prompt,
    opts,
  );
  return extractJson(raw) as T;
}

/* ----------------------------------------------------------------- image */

async function gatewayImage(prompt: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: "lovable/image-fast", prompt, size: "1536x1024", n: 1 }),
  });
  if (!res.ok) throw await gatewayError(res);
  const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image could not be generated.");
  return base64ToBytes(b64);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function bytesFrom(res: Response): Promise<Uint8Array> {
  if (!res.ok) throw await gatewayError(res);
  return new Uint8Array(await res.arrayBuffer());
}

async function pollinationsImage(prompt: string): Promise<Uint8Array> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1536&height=1024&nologo=true`;
  return bytesFrom(await fetch(url));
}

async function huggingFaceImage(key: string, prompt: string): Promise<Uint8Array> {
  const res = await fetch(
    "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ inputs: prompt }),
    },
  );
  return bytesFrom(res);
}

async function falImage(key: string, prompt: string): Promise<Uint8Array> {
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
    body: JSON.stringify({ prompt, image_size: "landscape_16_9" }),
  });
  if (!res.ok) throw await gatewayError(res);
  const body = (await res.json()) as { images?: Array<{ url?: string }> };
  const url = body.images?.[0]?.url;
  if (!url) throw new Error("The image could not be generated.");
  return bytesFrom(await fetch(url));
}

async function replicateImage(key: string, prompt: string): Promise<Uint8Array> {
  const start = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Prefer: "wait",
    },
    body: JSON.stringify({ input: { prompt, aspect_ratio: "16:9", output_format: "png" } }),
  });
  if (!start.ok) throw await gatewayError(start);
  let prediction = (await start.json()) as {
    id: string;
    status: string;
    output?: string | string[];
  };

  for (let attempt = 0; attempt < 60 && !["succeeded", "failed", "canceled"].includes(prediction.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!poll.ok) throw await gatewayError(poll);
    prediction = (await poll.json()) as typeof prediction;
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (prediction.status !== "succeeded" || !output) throw new Error("The image could not be generated.");
  return bytesFrom(await fetch(output));
}

/** Generates one scene image with the engine selected in the admin panel. */
export async function generateSceneImage(prompt: string): Promise<Uint8Array> {
  const provider = await resolveProvider("image");
  try {
    let bytes: Uint8Array;
    if (provider.id === "pollinations") bytes = await pollinationsImage(prompt);
    else if (provider.id === "huggingface" && provider.apiKey)
      bytes = await huggingFaceImage(provider.apiKey, prompt);
    else if (provider.id === "fal-flux" && provider.apiKey)
      bytes = await falImage(provider.apiKey, prompt);
    else if (provider.id === "replicate" && provider.apiKey)
      bytes = await replicateImage(provider.apiKey, prompt);
    else bytes = await gatewayImage(prompt);
    await logUsage({ category: "image", provider: provider.id });
    return bytes;
  } catch (error) {
    await logUsage({ category: "image", provider: provider.id, success: false });
    throw error;
  }
}

/* ----------------------------------------------------------------- audio */

async function gatewayNarration(text: string, voice: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-tts",
      contents: [
        {
          role: "user",
          parts: [{ text: `Read this aloud in a warm, confident narrator voice:\n\n${text}` }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) throw await gatewayError(res);
  return new Uint8Array(await res.arrayBuffer());
}

/** Wraps raw 16-bit mono PCM in a WAV container so the editor can play it. */
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length, true);

  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

const ELEVEN_VOICES: Record<string, string> = {
  Kore: "9BWtsMINqrJLrRacOk9x", // Aria
  Puck: "TX3LPaxmHKxFdv7VOQHJ", // Liam
  Charon: "onwK4e9ZLuTAKqWW03F9", // Daniel
  Aoede: "EXAVITQu4vr4xnSDxMaL", // Sarah
};

async function elevenLabsNarration(key: string, text: string, voice: string): Promise<Uint8Array> {
  const voiceId = ELEVEN_VOICES[voice] ?? ELEVEN_VOICES["Kore"]!;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
    },
  );
  const pcm = await bytesFrom(res);
  return pcmToWav(pcm, 24000);
}

/** Generates narration audio (WAV) with the voice engine selected in the admin panel. */
export async function generateNarration(text: string, voice: string): Promise<Uint8Array> {
  const provider = await resolveProvider("tts");
  try {
    let bytes: Uint8Array;
    if (provider.id === "elevenlabs" && provider.apiKey) {
      bytes = await elevenLabsNarration(provider.apiKey, text, voice);
    } else {
      // edge-tts / Kokoro run locally and are unavailable in this hosted runtime,
      // so free voices are served by the built-in zero-cost voice engine.
      bytes = await gatewayNarration(text, voice);
    }
    await logUsage({ category: "tts", provider: provider.id });
    return bytes;
  } catch (error) {
    await logUsage({ category: "tts", provider: provider.id, success: false });
    throw error;
  }
}
