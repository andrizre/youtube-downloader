"use client";

import { useEffect, useMemo, useState } from "react";
import { extractVideoId, isYouTubeUrl } from "@/lib/youtube";

interface Thumb {
  url: string;
  width?: number;
  height?: number;
}

interface Details {
  meta: {
    id: string;
    title: string;
    description: string;
    lengthSeconds: number;
    viewCount: number;
    likeCount: number;
    publishedTimeText: string;
    commentCountText: string;
    isLiveStream: boolean;
    thumbnails: Thumb[];
    channel: {
      name: string;
      handle: string;
      isVerified: boolean;
      isVerifiedArtist: boolean;
      subscriberCountText: string;
      avatar: Thumb[];
    };
    music: { title: string; artist: string; album: string }[];
  };
  videos: {
    url: string;
    quality: string;
    width: number;
    height: number;
    size: number;
    sizeText: string;
    hasAudio: boolean;
    mimeType: string;
  }[];
  audios: {
    url: string;
    extension: string;
    size: number;
    sizeText: string;
    mimeType: string;
  }[];
  subtitles: { code: string; url: string }[];
  related: {
    id: string;
    title: string;
    lengthText: string;
    viewCountText: string;
    publishedTimeText: string;
    channelName: string;
    thumbnail: string;
  }[];
  expiresAt: number;
  download: {
    downloadUrl: string;
    filename: string;
    quality?: string;
    sizeText?: string;
    hasAudio?: boolean;
    expiresAt?: number;
  };
}

interface HistoryEntry {
  id: string;
  title: string;
  thumbnail: string;
}

const VIDEO_QUALITIES = ["2160", "1440", "1080", "720", "480", "360"];
const HISTORY_KEY = "yt-dl-history";

function biggest(thumbs: Thumb[]): string {
  let best = "";
  let area = -1;
  for (const t of thumbs) {
    const a = (t.width || 0) * (t.height || 0);
    if (t.url && (a > area || (!best && a === 0))) {
      area = a;
      best = t.url;
    }
  }
  return best || thumbs[0]?.url || "";
}

function formatCount(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} rb`;
  return String(n);
}

function formatDuration(total: number): string {
  if (!total) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Rekomendasi lokal dari daftar yang sudah ada — tanpa request baru (hemat kuota). */
function pickLocal(
  videos: Details["videos"],
  want: string,
): Details["videos"][number] | null {
  if (videos.length === 0) return null;
  const heightOf = (q: string) => Number.parseInt(q, 10);
  const cap = Number.isNaN(Number.parseInt(want, 10))
    ? Infinity
    : Number.parseInt(want, 10);
  const within = videos.filter((v) => heightOf(v.quality) <= cap);
  const audible = (list: Details["videos"]) => list.filter((v) => v.hasAudio);
  const pool =
    audible(within).length > 0
      ? audible(within)
      : within.length > 0
        ? within
        : audible(videos).length > 0
          ? audible(videos)
          : videos;
  let best = pool[0];
  for (const v of pool) {
    if (heightOf(v.quality) > heightOf(best.quality)) best = v;
  }
  return best;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"mp3" | "mp4">("mp4");
  const [videoQuality, setVideoQuality] = useState("1080");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState<{ error: string; code?: string } | null>(
    null,
  );
  const [showDesc, setShowDesc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const trimmed = url.trim();
  const valid = trimmed.length > 0 && isYouTubeUrl(trimmed);
  const showInvalidHint = trimmed.length > 0 && !isYouTubeUrl(trimmed);
  const videoId = useMemo(
    () => (valid ? extractVideoId(trimmed) : null),
    [trimmed, valid],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw) as HistoryEntry[]);
    } catch {
      setHistory([]);
    }
  }, []);

  function pushHistory(d: Details) {
    setHistory((prev) => {
      const next = [
        { id: d.meta.id, title: d.meta.title, thumbnail: biggest(d.meta.thumbnails) },
        ...prev.filter((h) => h.id !== d.meta.id),
      ].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
  }

  async function run(targetUrl: string, targetKind: typeof kind, targetQ: string) {
    if (loading) return;
    setLoading(true);
    setData(null);
    setError(null);
    setShowDesc(false);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, kind: targetKind, videoQuality: targetQ }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError({ error: json.error ?? "Gagal memproses link", code: json.code });
      } else {
        const d = json as Details;
        setData(d);
        pushHistory(d);
      }
    } catch {
      setError({ error: "Tidak bisa menghubungi server" });
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!valid || loading) return;
    run(trimmed, kind, videoQuality);
  }

  function handleRelated(id: string) {
    const next = `https://www.youtube.com/watch?v=${id}`;
    setUrl(next);
    run(next, kind, videoQuality);
  }

  /** Ganti kualitas MP4 tanpa request baru kalau datanya sudah ada. */
  function handleQuality(q: string) {
    setVideoQuality(q);
    if (data && kind === "mp4" && data.meta.id === videoId) {
      const best = pickLocal(data.videos, q);
      if (best) {
        setData({
          ...data,
          download: {
            downloadUrl: best.url,
            filename: data.download.filename,
            quality: best.quality,
            sizeText: best.sizeText,
            hasAudio: best.hasAudio,
            expiresAt: data.expiresAt,
          },
        });
      }
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      setError({ error: "Gagal membaca clipboard" });
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* abaikan */
    }
  }

  const thumb = data ? biggest(data.meta.thumbnails) : "";
  const avatar = data?.meta.channel.avatar.length
    ? biggest(data.meta.channel.avatar)
    : "";
  const mutedPick =
    data && kind === "mp4" && data.download.hasAudio === false;
  const expiry =
    data?.expiresAt && data.expiresAt > 0
      ? new Date(data.expiresAt * 1000).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const metaLine = data
    ? [
        formatDuration(data.meta.lengthSeconds),
        `${formatCount(data.meta.viewCount)} ditonton`,
        data.meta.publishedTimeText,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* top bar */}
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 pt-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-100" />
          unduh
        </p>
        <p className="text-xs text-zinc-600">youtube · mp4 / mp3</p>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-14 pb-20 sm:pt-20">
        {!data && !loading && (
          <div className="rise mb-8 text-center">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
              simpan yang kamu suka.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
              tempel tautan youtube di bawah, pratinjau dulu, lalu unduh. tanpa iklan, tanpa bertele-tele.
            </p>
          </div>
        )}

        {/* input */}
        <div className="rise rise-1">
          <div
            className={`flex items-center gap-1.5 rounded-2xl border bg-white/[0.04] p-2 pl-4 transition-colors ${
              showInvalidHint
                ? "border-red-500/40"
                : "border-white/10 focus-within:border-white/25"
            }`}
          >
            <span className="shrink-0 text-zinc-600">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDownload();
              }}
              placeholder="tempel tautan youtube di sini…"
              spellCheck={false}
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-zinc-100 outline-none"
            />
            {url ? (
              <button
                type="button"
                onClick={() => {
                  setUrl("");
                  setData(null);
                  setError(null);
                }}
                aria-label="Bersihkan"
                className="shrink-0 rounded-lg px-2 py-2 text-sm text-zinc-600 transition-colors hover:text-zinc-300"
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePaste}
                className="shrink-0 rounded-lg px-2.5 py-2 text-[13px] text-zinc-500 transition-colors hover:text-zinc-200"
              >
                tempel
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!valid || loading}
              aria-label="Proses"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950 transition-all hover:bg-white disabled:opacity-20"
            >
              {loading ? (
                <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              )}
            </button>
          </div>

          {/* mode + kualitas */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-white/[0.05] p-1 text-[13px]">
              {(
                [
                  { id: "mp4", label: "video" },
                  { id: "mp3", label: "audio" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setKind(o.id)}
                  aria-pressed={kind === o.id}
                  className={`rounded-full px-4 py-1.5 transition-all ${
                    kind === o.id
                      ? "bg-zinc-100 font-medium text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {kind === "mp4" && (
              <div className="flex flex-wrap items-center gap-1">
                {VIDEO_QUALITIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuality(q)}
                    className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      videoQuality === q
                        ? "bg-white/10 text-zinc-100"
                        : "text-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {q}p
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2.5 min-h-4 text-xs">
            {showInvalidHint ? (
              <p className="text-red-400/90">itu bukan tautan youtube yang valid.</p>
            ) : error ? (
              <p className="text-red-400/90">
                {error.error}{" "}
                <button type="button" onClick={handleDownload} className="underline underline-offset-2 hover:text-red-300">
                  coba lagi
                </button>
              </p>
            ) : loading ? (
              <p className="text-zinc-600">mengambil pratinjau…</p>
            ) : (
              <p className="text-zinc-700">
                {kind === "mp4"
                  ? "ganti kualitas kapan pun — tidak makan kuota tambahan."
                  : "audio dikonversi ke mp3, metadata tetap ditampilkan."}
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div className="rise mt-6 flex flex-col gap-4">
            <div className="aspect-video w-full animate-pulse rounded-2xl bg-white/[0.05]" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.05]" />
            </div>
          </div>
        )}

        {data && (
          <div className="rise mt-6 flex flex-col">
            {/* pratinjau */}
            <div className="relative overflow-hidden rounded-2xl bg-white/[0.03]">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="aspect-video w-full bg-white/[0.04]" />
              )}
              <span className="absolute right-3 bottom-3 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                {formatDuration(data.meta.lengthSeconds)}
              </span>
            </div>

            <div className="mt-4">
              <h2 className="text-[16px] leading-snug font-medium tracking-tight text-zinc-100">
                {data.meta.title}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                )}
                <p className="truncate text-[13px] text-zinc-400">
                  {data.meta.channel.name}
                  {(data.meta.channel.isVerified || data.meta.channel.isVerifiedArtist) && (
                    <span className="ml-1 text-zinc-600">✓</span>
                  )}
                  <span className="text-zinc-600">
                    {"  "}· {data.meta.channel.subscriberCountText}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">{metaLine}</p>
              {data.meta.description && (
                <div className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                  <p className={`whitespace-pre-line ${showDesc ? "" : "line-clamp-2"}`}>
                    {data.meta.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDesc((s) => !s)}
                    className="mt-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    {showDesc ? "tutup" : "selengkapnya"}
                  </button>
                </div>
              )}
            </div>

            {/* unduhan utama */}
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 pl-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200" title={data.download.filename}>
                  {data.download.filename}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-600">
                  {[data.download.quality, data.download.sizeText].filter(Boolean).join(" · ")}
                  {kind === "mp4" && data.download.hasAudio === false && " · tanpa suara"}
                </p>
              </div>
              <a
                href={data.download.downloadUrl}
                download={data.download.filename}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                unduh
              </a>
            </div>
            <div className="mt-2 flex items-center gap-4 px-1 text-xs text-zinc-600">
              <button type="button" onClick={() => handleCopy(data.download.downloadUrl)} className="transition-colors hover:text-zinc-300">
                {copied ? "tersalin ✓" : "salin tautan"}
              </button>
              <a href={data.download.downloadUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-zinc-300">
                buka tab baru
              </a>
              {expiry && <span className="ml-auto">kedaluwarsa ± {expiry}</span>}
            </div>

            {mutedPick && (
              <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-200/80">
                kualitas {data.download.quality} ini video-only, tanpa suara. pilih 360p untuk yang langsung bersuara, atau unduh trek audio di bawah.
              </p>
            )}

            {/* semua kualitas */}
            {kind === "mp4" && data.videos.length > 0 && (
              <div className="mt-8">
                <p className="mb-1 text-xs text-zinc-600">
                  semua kualitas · {data.videos.length}
                </p>
                <ul className="divide-y divide-white/[0.06]">
                  {data.videos.map((v) => {
                    const active = data.download.downloadUrl === v.url;
                    return (
                      <li key={`${v.quality}-${v.width}-${v.size}`} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className={`w-12 shrink-0 font-mono text-[13px] ${active ? "text-zinc-100" : "text-zinc-300"}`}>
                          {v.quality}
                        </span>
                        <span className="hidden font-mono text-[11px] text-zinc-700 sm:inline">
                          {v.width}×{v.height}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-600">{v.sizeText}</span>
                        <span className={`flex items-center gap-1.5 text-[11px] ${v.hasAudio ? "text-zinc-500" : "text-zinc-700"}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${v.hasAudio ? "bg-emerald-400/70" : "bg-zinc-700"}`} />
                          {v.hasAudio ? "bersuara" : "tanpa suara"}
                        </span>
                        <a
                          href={v.url}
                          download
                          className={`ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? "bg-white/10 text-zinc-100"
                              : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                          }`}
                        >
                          unduh
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* audio */}
            {data.audios.length > 0 && (
              <div className="mt-8">
                <p className="mb-1 text-xs text-zinc-600">
                  trek audio · {data.audios.length}
                </p>
                <ul className="flex flex-col gap-3">
                  {data.audios.map((a) => (
                    <li key={`${a.extension}-${a.size}`} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-zinc-300 uppercase">.{a.extension}</span>
                        <span className="font-mono text-[11px] text-zinc-600">{a.sizeText}</span>
                        <a
                          href={a.url}
                          download
                          className="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                          unduh
                        </a>
                      </div>
                      <audio controls preload="none" src={a.url} className="h-8 w-full opacity-70" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* subtitle */}
            <div className="mt-8">
              <p className="mb-2 text-xs text-zinc-600">
                subtitle{data.subtitles.length > 0 ? ` · ${data.subtitles.length}` : ""}
              </p>
              {data.subtitles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.subtitles.map((s) => (
                    <a
                      key={s.code}
                      href={s.url}
                      download={`subtitle-${data.meta.id}.${s.code}.xml`}
                      className="rounded-lg bg-white/[0.05] px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                    >
                      {s.code}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-700">tidak ada subtitle untuk video ini.</p>
              )}
            </div>

            {/* terkait */}
            {data.related.length > 0 && (
              <div className="mt-8">
                <p className="mb-1 text-xs text-zinc-600">terkait</p>
                <ul className="flex flex-col">
                  {data.related.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleRelated(r.id)}
                        className="group flex w-full items-center gap-3 rounded-xl py-2 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        {r.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnail}
                            alt=""
                            loading="lazy"
                            className="aspect-video w-28 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="aspect-video w-28 shrink-0 rounded-lg bg-white/[0.05]" />
                        )}
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[13px] leading-snug text-zinc-300 group-hover:text-zinc-100">
                            {r.title}
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-zinc-600">
                            {[r.channelName, r.viewCountText, r.publishedTimeText].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-700">
                          {r.lengthText}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* riwayat */}
        {!loading && history.length > 0 && (
          <div className="rise mt-10">
            <div className="mb-1 flex items-center">
              <p className="text-xs text-zinc-600">terakhir diproses</p>
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  try {
                    localStorage.removeItem(HISTORY_KEY);
                  } catch {
                    /* abaikan */
                  }
                }}
                className="ml-auto text-[11px] text-zinc-700 transition-colors hover:text-zinc-400"
              >
                hapus
              </button>
            </div>
            <ul className="flex flex-col">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => handleRelated(h.id)}
                    className="group flex w-full items-center gap-3 rounded-xl py-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    {h.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.thumbnail} alt="" loading="lazy" className="h-10 w-[72px] shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-10 w-[72px] shrink-0 rounded-md bg-white/[0.05]" />
                    )}
                    <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-zinc-500 group-hover:text-zinc-200">
                      {h.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!data && !loading && history.length === 0 && (
          <p className="mt-10 text-center font-mono text-[11px] text-zinc-700">
            watch · youtu.be · shorts · embed · live
          </p>
        )}

        <footer className="mt-auto pt-16 text-center text-[11px] leading-relaxed text-zinc-700">
          hanya untuk konten publik yang bebas diunduh.
          <br />
          kamu bertanggung jawab atas apa yang disimpan.
        </footer>
      </main>
    </div>
  );
}
