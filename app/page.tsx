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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      {/* Hero */}
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-red-600 uppercase">
          YouTube Downloader
        </p>
        <h1 className="text-3xl font-bold text-balance">
          Tempel link, lihat isinya, baru unduh.
        </h1>
        <p className="max-w-2xl text-sm opacity-70">
          Pratinjau metadata, channel, dan semua pilihan kualitas (dengan ukuran
          file + penanda bersuara) sebelum mengunduh MP4, audio, atau subtitle.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          {["Pratinjau 4K–144p", "Ukuran file", "Audio & subtitle", "Video terkait", "Riwayat lokal"].map(
            (c) => (
              <span
                key={c}
                className="rounded-full border border-zinc-300 px-2.5 py-1 opacity-80 dark:border-zinc-700"
              >
                {c}
              </span>
            ),
          )}
        </div>
      </header>

      {/* Converter */}
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDownload();
            }}
            placeholder="https://www.youtube.com/watch?v=…  /  youtu.be/…  /  /shorts/…"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePaste}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Paste
            </button>
            {url && (
              <button
                type="button"
                onClick={() => {
                  setUrl("");
                  setData(null);
                  setError(null);
                }}
                aria-label="Bersihkan"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {showInvalidHint && (
          <p className="text-sm text-red-600">
            URL harus link YouTube (youtube.com, youtu.be, /shorts, /embed, /live).
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-2" role="tablist" aria-label="Format">
            {(
              [
                { id: "mp4", label: "🎬 Video MP4" },
                { id: "mp3", label: "🎵 Audio MP3" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={kind === o.id}
                onClick={() => setKind(o.id)}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium sm:flex-none ${
                  kind === o.id
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {kind === "mp4" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs opacity-60">Maksimal:</span>
              {VIDEO_QUALITIES.map((q) => {
                const opt = data ? pickLocal(data.videos, q) : null;
                const missing = data && !data.videos.some((v) => Number.parseInt(v.quality, 10) >= Number.parseInt(q, 10));
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuality(q)}
                    title={opt ? `${opt.quality} · ${opt.sizeText}${opt.hasAudio ? " · bersuara" : " · tanpa suara"}` : `${q}p`}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      videoQuality === q
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
                        : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    } ${missing ? "opacity-40" : ""}`}
                  >
                    {q}p
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs opacity-70">
              MP3 dikonversi via penyedia (1 request) + metadata tetap diambil dari
              host media — judul & pratinjau ikut tampil.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!valid || loading}
          className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Memproses… ⏳" : "Proses & Pratinjau"}
        </button>
        <p className="text-[11px] opacity-50">
          1× Proses = 1 request kuota (MP3: 2×). Ganti kualitas MP4 setelah
          pratinjau tidak memakan kuota.
        </p>
      </section>

      {loading && (
        <section className="grid animate-pulse gap-4 md:grid-cols-[2fr_1fr]">
          <div className="aspect-video rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex flex-col gap-2">
            <div className="h-5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </section>
      )}

      {mutedPick && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ Kualitas {data.download.quality} yang terpilih adalah{" "}
          <strong>video-only (tanpa suara)</strong>. Pilih 360p untuk file
          bersuara langsung, atau unduh trek audio di bawah dan gabungkan manual.
        </p>
      )}

      {data && (
        <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
          {/* Kolom kiri: pratinjau + daftar */}
          <div className="flex min-w-0 flex-col gap-4">
            <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt={data.meta.title} className="aspect-video w-full object-cover" />
              ) : (
                <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-900" />
              )}
              <div className="flex flex-col gap-3 p-4">
                <h2 className="text-lg leading-snug font-semibold">{data.meta.title}</h2>
                <div className="flex items-center gap-2.5">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-9 w-9 rounded-full" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {data.meta.channel.name}{" "}
                      {(data.meta.channel.isVerified || data.meta.channel.isVerifiedArtist) && (
                        <span title="Terverifikasi">✓</span>
                      )}
                    </p>
                    <p className="text-xs opacity-60">
                      {data.meta.channel.handle} · {data.meta.channel.subscriberCountText}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {[
                    `⏱ ${formatDuration(data.meta.lengthSeconds)}`,
                    `👁 ${formatCount(data.meta.viewCount)}`,
                    `👍 ${formatCount(data.meta.likeCount)}`,
                    `📅 ${data.meta.publishedTimeText}`,
                    data.meta.commentCountText ? `💬 ${data.meta.commentCountText}` : "",
                    data.meta.isLiveStream ? "🔴 Live" : "",
                  ]
                    .filter(Boolean)
                    .map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900"
                      >
                        {chip}
                      </span>
                    ))}
                </div>
                {data.meta.music.length > 0 && (
                  <p className="text-xs opacity-70">
                    🎼 {data.meta.music[0].title} — {data.meta.music[0].artist}
                    {data.meta.music[0].album ? ` · ${data.meta.music[0].album}` : ""}
                  </p>
                )}
                {data.meta.description && (
                  <div className="text-sm">
                    <p className={`whitespace-pre-line opacity-80 ${showDesc ? "" : "line-clamp-3"}`}>
                      {data.meta.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDesc((s) => !s)}
                      className="mt-1 text-xs font-medium text-red-600 hover:underline"
                    >
                      {showDesc ? "Tutup deskripsi" : "Lihat deskripsi"}
                    </button>
                  </div>
                )}
              </div>
            </section>

            {kind === "mp4" && (
              <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <h3 className="mb-1 text-sm font-semibold">
                  Semua kualitas MP4 ({data.videos.length})
                </h3>
                <p className="mb-3 text-xs opacity-60">
                  Unduh langsung per baris — tanpa request baru.
                </p>
                <ul className="flex flex-col gap-2">
                  {data.videos.map((v) => (
                    <li
                      key={`${v.quality}-${v.width}-${v.size}`}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        data.download.downloadUrl === v.url
                          ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                          : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <span className="w-14 shrink-0 font-semibold">{v.quality}</span>
                      <span className="hidden text-xs opacity-60 sm:inline">
                        {v.width}×{v.height}
                      </span>
                      <span className="text-xs opacity-60">{v.sizeText}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          v.hasAudio
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {v.hasAudio ? "🔊 bersuara" : "🔇 tanpa suara"}
                      </span>
                      <a
                        href={v.url}
                        download
                        className="ml-auto shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        Unduh
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="mb-1 text-sm font-semibold">
                Trek audio ({data.audios.length})
              </h3>
              <p className="mb-3 text-xs opacity-60">
                Alternatif ringan — bisa diputar dulu sebelum diunduh.
              </p>
              <ul className="flex flex-col gap-2">
                {data.audios.map((a) => (
                  <li
                    key={`${a.extension}-${a.size}`}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold uppercase">
                        .{a.extension}
                      </span>
                      <span className="text-xs opacity-60">{a.sizeText}</span>
                      <a
                        href={a.url}
                        download
                        className="ml-auto shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        Unduh
                      </a>
                    </div>
                    <audio controls preload="none" src={a.url} className="h-8 w-full" />
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="mb-1 text-sm font-semibold">
                Subtitle ({data.subtitles.length || "tidak ada"})
              </h3>
              {data.subtitles.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.subtitles.map((s) => (
                    <li key={s.code}>
                      <a
                        href={s.url}
                        download={`subtitle-${data.meta.id}.${s.code}.xml`}
                        className="block rounded-md border border-zinc-300 px-3 py-1.5 font-mono text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        {s.code} ⬇
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs opacity-60">Video ini tidak menyediakan subtitle.</p>
              )}
            </section>

            {data.related.length > 0 && (
              <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <h3 className="mb-3 text-sm font-semibold">Video terkait</h3>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.related.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleRelated(r.id)}
                        className="group flex w-full gap-2.5 text-left"
                      >
                        {r.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnail}
                            alt=""
                            loading="lazy"
                            className="aspect-video w-32 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="aspect-video w-32 shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                        )}
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-xs font-medium group-hover:underline">
                            {r.title}
                          </span>
                          <span className="mt-1 block text-[11px] opacity-60">
                            {r.channelName}
                          </span>
                          <span className="block text-[11px] opacity-60">
                            {[r.lengthText, r.viewCountText, r.publishedTimeText]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Kolom kanan: unduhan utama */}
          <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
            <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold tracking-wide uppercase opacity-60">
                {kind === "mp4" ? "Unduhan utama" : "Hasil konversi MP3"}
              </p>
              <p className="truncate text-sm font-medium" title={data.download.filename}>
                {data.download.filename}
              </p>
              <div className="flex flex-wrap gap-1.5 text-xs opacity-70">
                {data.download.quality && <span>🎞 {data.download.quality}</span>}
                {data.download.sizeText && <span>· 💾 {data.download.sizeText}</span>}
                {kind === "mp4" && data.download.hasAudio !== undefined && (
                  <span>· {data.download.hasAudio ? "🔊 bersuara" : "🔇 tanpa suara"}</span>
                )}
              </div>
              <a
                href={data.download.downloadUrl}
                download={data.download.filename}
                className="mt-1 rounded-md bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-red-700"
              >
                ⬇ Unduh {kind === "mp4" ? (data.download.quality ?? "") : "MP3"}
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(data.download.downloadUrl)}
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  {copied ? "✓ Tersalin" : "Salin link"}
                </button>
                <a
                  href={data.download.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-center text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Buka tab baru
                </a>
              </div>
              {expiry && (
                <p className="text-[11px] opacity-50">
                  ⏳ Link kedaluwarsa ± {expiry}. Klik Proses ulang jika mati.
                </p>
              )}
            </section>

            {history.length > 0 && (
              <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="mb-2 flex items-center">
                  <h3 className="text-xs font-semibold tracking-wide uppercase opacity-60">
                    Terakhir diproses
                  </h3>
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
                    className="ml-auto text-[11px] opacity-50 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => handleRelated(h.id)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        {h.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.thumbnail} alt="" loading="lazy" className="h-9 w-16 rounded object-cover" />
                        ) : (
                          <div className="h-9 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                        )}
                        <span className="line-clamp-2 min-w-0 flex-1 text-xs">{h.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {!data && !loading && (
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { t: "1. Tempel link", d: "Mendukung watch, youtu.be, shorts, embed, live." },
            { t: "2. Nilai pratinjau", d: "Durasi, views, channel, deskripsi, semua ukuran file." },
            { t: "3. Pilih yang pas", d: "MP4 bersuara, audio saja, subtitle, atau video terkait." },
          ].map((s) => (
            <div
              key={s.t}
              className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <p className="font-semibold">{s.t}</p>
              <p className="mt-1 text-xs opacity-60">{s.d}</p>
            </div>
          ))}
        </section>
      )}

      {error && (
        <section className="flex flex-col gap-2 rounded-xl border border-red-300 p-4 text-sm dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error.error}</p>
          {error.code && <p className="font-mono text-xs opacity-70">{error.code}</p>}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!valid || loading}
            className="self-start rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Coba lagi
          </button>
        </section>
      )}

      <footer className="mt-auto pt-6 text-xs opacity-60">
        Hanya unduh konten publik/bebas. Pengguna bertanggung jawab atas isi yang
        diunduh. Link unduhan bersifat sementara dari penyedia.
      </footer>
    </main>
  );
}
