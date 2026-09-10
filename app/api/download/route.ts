import { NextResponse } from "next/server";
import { ProviderError, resolveDownload } from "@/lib/rapidapi";
import { extractVideoId, isYouTubeUrl } from "@/lib/youtube";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan, coba lagi nanti" },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Body harus JSON valid");
  }
  body ??= {};

  const { url } = body;

  if (typeof url !== "string" || !isYouTubeUrl(url)) {
    return badRequest("URL harus link YouTube");
  }
  const videoId = extractVideoId(url);
  if (!videoId) {
    return badRequest("Link tidak mengandung ID video");
  }

  try {
    const result = await resolveDownload({ videoId });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ProviderError) {
      if (err.code === "rapidapi-quota") {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 429 },
        );
      }
      if (err.code === "rapidapi-http") {
        console.error("Vendor HTTP error:", err.message);
        return NextResponse.json(
          { error: "Gagal menghubungi layanan unduh", code: err.code },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 502 },
      );
    }
    console.error("Download route error:", err);
    return NextResponse.json({ error: "Gagal memproses link" }, { status: 500 });
  }
}
