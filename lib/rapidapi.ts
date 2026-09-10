export class ProviderError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "ProviderError";
    this.code = code;
  }
}

export function getRapidConfig(): { apiKey: string } {
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY belum di-set");
  }
  return { apiKey };
}

export interface Thumb {
  url: string;
  width?: number;
  height?: number;
}

export interface ChannelInfo {
  id: string;
  name: string;
  handle: string;
  isVerified: boolean;
  isVerifiedArtist: boolean;
  subscriberCountText: string;
  avatar: Thumb[];
}

export interface VideoMeta {
  id: string;
  title: string;
  description: string;
  lengthSeconds: number;
  viewCount: number;
  likeCount: number;
  publishedTime: string;
  publishedTimeText: string;
  commentCountText: string;
  isLiveStream: boolean;
  thumbnails: Thumb[];
  channel: ChannelInfo;
  music: { title: string; artist: string; album: string }[];
}

export interface VideoOption {
  url: string;
  quality: string;
  width: number;
  height: number;
  size: number;
  sizeText: string;
  hasAudio: boolean;
  mimeType: string;
}

export interface AudioOption {
  url: string;
  extension: string;
  size: number;
  sizeText: string;
  mimeType: string;
}

export interface SubtitleOption {
  code: string;
  url: string;
}

export interface RelatedVideo {
  id: string;
  title: string;
  lengthText: string;
  viewCountText: string;
  publishedTimeText: string;
  channelName: string;
  channelHandle: string;
  avatar: string;
  thumbnail: string;
}

export interface DownloadTarget {
  downloadUrl: string;
  filename: string;
  quality?: string;
  sizeText?: string;
  hasAudio?: boolean;
  expiresAt?: number;
}

export interface DetailsResult {
  meta: VideoMeta;
  videos: VideoOption[];
  audios: AudioOption[];
  subtitles: SubtitleOption[];
  related: RelatedVideo[];
  expiresAt: number;
  download: DownloadTarget;
}

interface ResolveInput {
  videoId: string;
  kind: "mp3" | "mp4";
  videoQuality: string;
}

// MP3: "YouTube MP3" (ytjar) — GET /dl?id= → { status: "ok", link, title }.
// MP4: "YouTube Media Downloader" (DataFanatic, host youtube-media-downloader.p.rapidapi.com)
//   — GET /v2/video/details?videoId=&urlAccess=normal&videos=auto&audios=auto
//   → { errorId, title, description, channel{…}, lengthSeconds, viewCount,
//        likeCount, publishedTime*, commentCountText, thumbnails[],
//        musicCredits[], videos{items[],expiration}, audios{items[],expiration},
//        subtitles{items[{code,url}]}, related{items[]} }.
// Satu panggilan details mengembalikan SEMUA yang UI butuhkan: metadata,
// daftar kualitas MP4 (dengan size + penanda bersuara), trek audio,
// subtitle, dan video terkait. Jadi frontend cukup fetch sekali lalu
// ganti kualitas/format secara lokal tanpa menghabiskan kuota.
const MP3_HOST = "youtube-mp36.p.rapidapi.com";
const MEDIA_HOST = "youtube-media-downloader.p.rapidapi.com";
const TIMEOUT_MS = 25000;

async function fetchVendor(
  url: string,
  apiKey: string,
  host: string,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("RapidAPI timeout");
    }
    throw err;
  }
  if (res.status === 429 || res.status === 403) {
    throw new ProviderError(
      "rapidapi-quota",
      "Kuota RapidAPI habis atau key ditolak",
    );
  }
  if (!res.ok) {
    throw new ProviderError("rapidapi-http", `RapidAPI HTTP ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function cleanTitle(raw: unknown, fallback: string): string {
  const t =
    typeof raw === "string"
      ? raw.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 120)
      : "";
  return t || fallback;
}

function thumbs(v: unknown): Thumb[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (t): t is Record<string, unknown> =>
        !!t && typeof t === "object" && typeof (t as { url?: unknown }).url === "string",
    )
    .map((t) => ({
      url: (t as { url: string }).url,
      width: num((t as { width?: unknown }).width),
      height: num((t as { height?: unknown }).height),
    }));
}

function biggest(list: Thumb[]): string {
  let best = list[0]?.url ?? "";
  let area = -1;
  for (const t of list) {
    const a = (t.width || 0) * (t.height || 0);
    if (a > area) {
      area = a;
      best = t.url;
    }
  }
  return best;
}

interface DetailsWire {
  json: Record<string, unknown>;
  videos: VideoOption[];
  audios: AudioOption[];
  subtitles: SubtitleOption[];
  expiresAt: number;
}

async function fetchDetails(
  videoId: string,
  apiKey: string,
): Promise<DetailsWire> {
  const json = await fetchVendor(
    `https://${MEDIA_HOST}/v2/video/details?videoId=${videoId}&urlAccess=normal&videos=auto&audios=auto`,
    apiKey,
    MEDIA_HOST,
  );
  if (typeof json.errorId === "string" && json.errorId !== "Success") {
    const reason =
      typeof json.reason === "string" && json.reason.length > 0
        ? json.reason
        : "Video tidak ditemukan atau dibatasi";
    throw new ProviderError("youtube-convert-failed", reason);
  }

  const videosNode =
    json.videos && typeof json.videos === "object"
      ? (json.videos as { items?: unknown; expiration?: unknown })
      : null;
  const audiosNode =
    json.audios && typeof json.audios === "object"
      ? (json.audios as { items?: unknown; expiration?: unknown })
      : null;
  const rawVideos = Array.isArray(videosNode?.items) ? videosNode!.items! : [];
  const rawAudios = Array.isArray(audiosNode?.items) ? audiosNode!.items! : [];

  const videos: VideoOption[] = (
    rawVideos as Record<string, unknown>[]
  )
    .filter(
      (f) =>
        typeof f.url === "string" &&
        f.extension === "mp4" &&
        typeof f.quality === "string" &&
        /^\d+p/.test(f.quality as string),
    )
    .map((f) => ({
      url: f.url as string,
      quality: f.quality as string,
      width: num(f.width),
      height: num(f.height),
      size: num(f.size),
      sizeText: str(f.sizeText),
      hasAudio: bool(f.hasAudio),
      mimeType: str(f.mimeType),
    }))
    .sort(
      (a, b) =>
        Number.parseInt(b.quality, 10) - Number.parseInt(a.quality, 10) ||
        Number(b.hasAudio) - Number(a.hasAudio) ||
        b.size - a.size,
    );

  const audios: AudioOption[] = (rawAudios as Record<string, unknown>[])
    .filter((f) => typeof f.url === "string")
    .map((f) => ({
      url: f.url as string,
      extension: str(f.extension, "m4a"),
      size: num(f.size),
      sizeText: str(f.sizeText),
      mimeType: str(f.mimeType),
    }))
    .sort((a, b) => b.size - a.size);

  const subsNode =
    json.subtitles && typeof json.subtitles === "object"
      ? (json.subtitles as { items?: unknown })
      : null;
  const subtitles: SubtitleOption[] = (
    Array.isArray(subsNode?.items) ? (subsNode!.items as Record<string, unknown>[]) : []
  )
    .filter((s) => typeof s.url === "string" && typeof s.code === "string")
    .map((s) => ({ code: s.code as string, url: s.url as string }));

  if (videos.length === 0 && audios.length === 0) {
    throw new ProviderError(
      "youtube-no-format",
      "Tidak ada format yang bisa diunduh untuk video ini",
    );
  }

  return {
    json,
    videos,
    audios,
    subtitles,
    expiresAt: num(videosNode?.expiration, num(audiosNode?.expiration)),
  };
}

function buildMeta(
  videoId: string,
  json: Record<string, unknown>,
): VideoMeta {
  const ch =
    json.channel && typeof json.channel === "object"
      ? (json.channel as Record<string, unknown>)
      : {};
  const music = Array.isArray(json.musicCredits)
    ? (json.musicCredits as Record<string, unknown>[])
        .filter((m) => m && typeof m === "object")
        .map((m) => ({
          title: str(m.title),
          artist: str(m.artist),
          album: str(m.album),
        }))
    : [];
  return {
    id: str(json.id, videoId),
    title: str(json.title, videoId),
    description: str(json.description),
    lengthSeconds: num(json.lengthSeconds),
    viewCount: num(json.viewCount),
    likeCount: num(json.likeCount),
    publishedTime: str(json.publishedTime),
    publishedTimeText: str(json.publishedTimeText),
    commentCountText: str(json.commentCountText),
    isLiveStream: bool(json.isLiveStream) || bool(json.isLiveNow),
    thumbnails: thumbs(json.thumbnails),
    channel: {
      id: str(ch.id),
      name: str(ch.name, "Unknown channel"),
      handle: str(ch.handle),
      isVerified: bool(ch.isVerified),
      isVerifiedArtist: bool(ch.isVerifiedArtist),
      subscriberCountText: str(ch.subscriberCountText),
      avatar: thumbs(ch.avatar),
    },
    music,
  };
}

function buildRelated(json: Record<string, unknown>): RelatedVideo[] {
  const node =
    json.related && typeof json.related === "object"
      ? (json.related as { items?: unknown })
      : null;
  if (!node || !Array.isArray(node.items)) return [];
  return (node.items as Record<string, unknown>[])
    .filter((r) => r && typeof r === "object" && typeof r.id === "string")
    .slice(0, 12)
    .map((r) => {
      const ch =
        r.channel && typeof r.channel === "object"
          ? (r.channel as Record<string, unknown>)
          : {};
      const th = thumbs(r.thumbnails);
      const av = thumbs(
        (ch as { avatar?: unknown }).avatar,
      );
      return {
        id: r.id as string,
        title: str(r.title, r.id as string),
        lengthText: str(r.lengthText),
        viewCountText: str(r.viewCountText),
        publishedTimeText: str(r.publishedTimeText),
        channelName: str(ch.name),
        channelHandle: str(ch.handle),
        avatar: av[0]?.url ?? "",
        thumbnail: biggest(th),
      };
    });
}

function pickMp4(
  videos: VideoOption[],
  videoQuality: string,
): VideoOption {
  const height = (label: string) => Number.parseInt(label, 10);
  const parsed = Number.parseInt(videoQuality, 10);
  const cap =
    videoQuality === "max" || Number.isNaN(parsed) ? Infinity : parsed;
  // Hanya 360p yang progresif (ada audio). Kualitas di atasnya video-only
  // (tanpa suara), jadi utamakan file bersuara dalam batas kualitas.
  const withinCap = videos.filter((f) => height(f.quality) <= cap);
  const withAudio = (list: VideoOption[]) => list.filter((f) => f.hasAudio);
  const pool =
    withAudio(withinCap).length > 0
      ? withAudio(withinCap)
      : withinCap.length > 0
        ? withinCap
        : withAudio(videos).length > 0
          ? withAudio(videos)
          : videos;
  let best = pool[0];
  for (const f of pool) {
    if (height(f.quality) > height(best.quality)) best = f;
  }
  return best;
}

export async function resolveDownload(
  input: ResolveInput,
): Promise<DetailsResult> {
  const { apiKey } = getRapidConfig();
  // Satu panggilan details memberi metadata + semua varian unduhan,
  // jadi UI bisa render semuanya tanpa request tambahan.
  const { json, videos, audios, subtitles, expiresAt } = await fetchDetails(
    input.videoId,
    apiKey,
  );
  const meta = buildMeta(input.videoId, json);
  const related = buildRelated(json);

  if (input.kind === "mp3") {
    const dl = await fetchVendor(
      `https://${MP3_HOST}/dl?id=${input.videoId}`,
      apiKey,
      MP3_HOST,
    );
    if (dl.status !== "ok" || typeof dl.link !== "string") {
      throw new ProviderError(
        "youtube-convert-failed",
        typeof dl.msg === "string" ? dl.msg : "Gagal konversi MP3",
      );
    }
    const filename = `${cleanTitle(meta.title !== input.videoId ? meta.title : dl.title, input.videoId)}.mp3`;
    return {
      meta,
      videos,
      audios,
      subtitles,
      related,
      expiresAt,
      download: { downloadUrl: dl.link, filename, expiresAt },
    };
  }

  const best = pickMp4(videos, input.videoQuality);
  return {
    meta,
    videos,
    audios,
    subtitles,
    related,
    expiresAt,
    download: {
      downloadUrl: best.url,
      filename: `${cleanTitle(meta.title, input.videoId)}.mp4`,
      quality: best.quality,
      sizeText: best.sizeText,
      hasAudio: best.hasAudio,
      expiresAt,
    },
  };
}

/** Pilih ulang rekomendasi MP4 murni dari data yang sudah ada (tanpa kuota). */
export function pickMp4Local(
  videos: VideoOption[],
  videoQuality: string,
): VideoOption | null {
  if (videos.length === 0) return null;
  return pickMp4(videos, videoQuality);
}
