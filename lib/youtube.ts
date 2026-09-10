const YOUTUBE_HOSTS: Record<string, true> = {
  "youtube.com": true,
  "www.youtube.com": true,
  "m.youtube.com": true,
  "music.youtube.com": true,
  "youtu.be": true,
  "www.youtu.be": true,
  "youtube-nocookie.com": true,
  "www.youtube-nocookie.com": true,
};

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

export function isYouTubeUrl(raw: string): boolean {
  const parsed = parseUrl(raw);
  if (!parsed) return false;
  return YOUTUBE_HOSTS[parsed.hostname.toLowerCase()] === true;
}

export function normalizeYouTubeUrl(raw: string): string {
  const trimmed = raw.trim();
  const parsed = parseUrl(trimmed);
  if (!parsed) return trimmed;
  const host = parsed.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    const out = new URL("https://www.youtube.com/watch");
    out.searchParams.set("v", id);
    for (const [key, value] of parsed.searchParams) {
      if (key !== "v") out.searchParams.append(key, value);
    }
    return out.toString();
  }
  return trimmed;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(raw: string): string | null {
  const parsed = parseUrl(raw);
  if (!parsed || YOUTUBE_HOSTS[parsed.hostname.toLowerCase()] !== true) {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }
  const v = parsed.searchParams.get("v") ?? "";
  if (VIDEO_ID_PATTERN.test(v)) return v;
  const match = parsed.pathname.match(
    /^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
  );
  return match ? match[2] : null;
}
