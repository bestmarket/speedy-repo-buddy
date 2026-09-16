/**
 * Public YouTube helpers: resolve a link to a list of videos and pull the
 * spoken transcript. Uses only public endpoints — no API key required.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type DiscoveredVideo = {
  videoId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  thumbnailUrl: string;
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function videoIdFromUrl(raw: string): string | null {
  const watch = raw.match(/[?&]v=([\w-]{11})/);
  if (watch) return watch[1]!;
  const short = raw.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  if (short) return short[1]!;
  return null;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status} for that link.`);
  return res.text();
}

async function channelIdFromPage(url: string): Promise<string | null> {
  const html = await getText(url);
  const meta = html.match(/"channelId":"(UC[\w-]{22})"/) ?? html.match(/channel\/(UC[\w-]{22})/);
  return meta ? meta[1]! : null;
}

async function resolveChannelId(link: string): Promise<string | null> {
  const direct = link.match(/channel\/(UC[\w-]{22})/);
  if (direct) return direct[1]!;
  if (/youtube\.com\/(@|c\/|user\/)/.test(link)) return channelIdFromPage(link.split("?")[0]!);
  const handle = link.trim().match(/^@[\w.-]+$/);
  if (handle) return channelIdFromPage(`https://www.youtube.com/${handle[0]}`);
  return null;
}

function parseFeed(xml: string, limit: number): DiscoveredVideo[] {
  const entries = xml.split("<entry>").slice(1);
  const out: DiscoveredVideo[] = [];
  for (const entry of entries.slice(0, limit)) {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    if (!videoId) continue;
    out.push({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: decodeEntities(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled video"),
      publishedAt: entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
  return out;
}

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; shortDescription?: string; publishDate?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ baseUrl: string; languageCode?: string; kind?: string }>;
    };
  };
};

const CLIENTS = [
  { clientName: "ANDROID", clientVersion: "20.10.38" },
  { clientName: "IOS", clientVersion: "20.10.4" },
  { clientName: "MWEB", clientVersion: "2.20240726.01.00" },
  { clientName: "WEB", clientVersion: "2.20240726.00.00" },
] as const;

async function playerFor(videoId: string, client: (typeof CLIENTS)[number]) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.youtube.com",
    },
    body: JSON.stringify({
      context: { client: { ...client, hl: "en", gl: "US" } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status} for that video.`);
  return (await res.json()) as PlayerResponse;
}

/** Tries each public client until one returns captions or details. */
async function player(videoId: string): Promise<PlayerResponse> {
  let last: PlayerResponse | null = null;
  let reason = "";
  for (const client of CLIENTS) {
    try {
      const data = await playerFor(videoId, client);
      const status = data.playabilityStatus?.status;
      if (status && status !== "OK") {
        reason = data.playabilityStatus?.reason ?? status;
        continue;
      }
      last = data;
      if (data.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) return data;
    } catch {
      /* try the next client */
    }
  }
  if (last) return last;
  throw new Error(reason ? `YouTube blocked this video: ${reason}` : "YouTube did not return this video.");
}

/** Looks up a single video's public details. */
export async function fetchVideoMeta(videoId: string): Promise<DiscoveredVideo> {
  const data = await player(videoId);
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: data.videoDetails?.title ?? "Untitled video",
    publishedAt: data.videoDetails?.publishDate ?? null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/** Resolves a pasted link (channel, handle or single video) to a video list. */
export async function discoverVideos(link: string, limit: number): Promise<DiscoveredVideo[]> {
  const single = videoIdFromUrl(link);
  if (single) return [await fetchVideoMeta(single)];

  const channelId = await resolveChannelId(link);
  if (!channelId) {
    throw new Error("That doesn't look like a YouTube channel or video link.");
  }
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const videos = parseFeed(xml, limit);
  if (videos.length === 0) throw new Error("No public videos were found on that channel.");
  return videos;
}

export type TranscriptResult = {
  text: string;
  /** "captions" when spoken words were available, "description" as a fallback. */
  source: "captions" | "description";
  title: string;
};

/** Pulls the spoken transcript, falling back to the video description. */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const data = await player(videoId);
  const title = data.videoDetails?.title ?? "Untitled video";
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0];

  if (track?.baseUrl) {
    const res = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const xml = await res.text();
      const lines = [...xml.matchAll(/<(?:p|text)\b[^>]*>([\s\S]*?)<\/(?:p|text)>/g)].map((m) =>
        decodeEntities(m[1]!.replace(/<[^>]+>/g, "")).trim(),
      );
      const text = lines.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (text.length > 80) return { text, source: "captions", title };
    }
  }

  const description = (data.videoDetails?.shortDescription ?? "").trim();
  if (!description) throw new Error("This video has no captions and no description to read.");
  return { text: `${title}\n\n${description}`, source: "description", title };
}
