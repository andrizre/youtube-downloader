"use client";

import { useEffect, useState } from "react";
import { isYouTubeUrl } from "@/lib/youtube";

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
}

interface HistoryEntry {
  id: string;
  title: string;
  thumbnail: string;
}

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


export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState<{ error: string; code?: string } | null>(
    null,
  );
  const [showDesc, setShowDesc] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const trimmed = url.trim();
  const valid = trimmed.length > 0 && isYouTubeUrl(trimmed);
  const showInvalidHint = trimmed.length > 0 && !isYouTubeUrl(trimmed);

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

  async function run(targetUrl: string) {
    if (loading) return;
    setLoading(true);
    setData(null);
    setError(null);
    setShowDesc(false);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
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
    run(trimmed);
  }

  function handleRelated(id: string) {
    const next = `https://www.youtube.com/watch?v=${id}`;
    setUrl(next);
    run(next);
  }


  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      setError({ error: "Gagal membaca clipboard" });
    }
  }


  const thumb = data ? biggest(data.meta.thumbnails) : "";
  const avatar = data?.meta.channel.avatar.length
    ? biggest(data.meta.channel.avatar)
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
          {"&rizre"}
        </p>
        <p className="text-xs text-zinc-600">youtube · semua kualitas</p>
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
            ) : null}
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


            {/* semua kualitas */}
            {data.videos.length > 0 && (
              <div className="mt-8">
                <p className="mb-1 text-xs text-zinc-600">
                  semua kualitas · {data.videos.length}
                </p>
                <ul className="divide-y divide-white/[0.06]">
                  {data.videos.map((v) => (
                      <li key={`${v.quality}-${v.width}-${v.size}`} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="w-12 shrink-0 font-mono text-[13px] text-zinc-300">
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
                          className="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                          unduh
                        </a>
                      </li>
                  ))}
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

        {/* faq */}
        <div className="rise mt-12">
          <p className="mb-2 text-xs text-zinc-600">faq</p>
          <div className="flex flex-col gap-1.5">
            <details className="group rounded-xl bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-[13px] text-zinc-300 transition-colors hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
                kenapa hanya 360p yang bersuara?
              </summary>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
                youtube menyimpan kualitas tinggi sebagai trek terpisah (video-only + audio-only), dan api gratis yang dipakai situs ini hanya menyediakan satu stream gabungan yaitu 360p. kualitas di atasnya memang video-only dari sananya — kalau butuh 720p+ bersuara, unduh videonya lalu gabungkan dengan salah satu trek audio di bawah memakai ffmpeg atau video editor.
              </p>
            </details>
            <details className="group rounded-xl bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-[13px] text-zinc-300 transition-colors hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
                kenapa audionya bukan mp3?
              </summary>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
                trek audio disajikan apa adanya dari sumbernya (m4a/webm, format asli youtube) tanpa konversi — mengubah ke mp3 butuh transcoding di server yang tidak tersedia di tier gratis. unduh dulu, lalu konversi di perangkatmu, mis. <span className="font-mono text-[12px] text-zinc-400">ffmpeg -i file.m4a file.mp3</span>.
              </p>
            </details>
            <details className="group rounded-xl bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-[13px] text-zinc-300 transition-colors hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
                tautan unduhan tidak bisa dibuka?
              </summary>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
                tautan dari provider bersifat sementara dan bisa kedaluwarsa. tempel ulang linknya lalu proses lagi untuk mendapatkan tautan baru — gratis, satu kali proses memuat semua kualitas sekaligus.
              </p>
            </details>
            <details className="group rounded-xl bg-white/[0.03] px-4 py-3">
              <summary className="cursor-pointer list-none text-[13px] text-zinc-300 transition-colors hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
                video apa saja yang bisa diunduh?
              </summary>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
                hanya video publik yang tidak dibatasi umur, wilayah, atau login. video privat, premiere yang belum tayang, dan konten yang dibatasi tidak bisa diproses.
              </p>
            </details>
          </div>
        </div>

        <footer className="mt-auto flex flex-col items-center pt-16 text-center text-[11px] leading-relaxed text-zinc-700">
          hanya untuk konten publik yang bebas diunduh.
          <br />
          kamu bertanggung jawab atas apa yang disimpan.
          <span className="mt-3 inline-flex items-center gap-4">
            <a
              href="https://github.com/andrizre"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub andrizre"
              className="inline-flex items-center gap-1.5 text-zinc-600 transition-colors hover:text-zinc-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              <span className="font-mono">andrizre</span>
            </a>
            <a
              href="https://github.com/andrizre/youtube-downloader"
              target="_blank"
              rel="noreferrer"
              aria-label="Source code di GitHub"
              className="inline-flex items-center gap-1.5 font-mono text-zinc-600 transition-colors hover:text-zinc-200"
            >
              source
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}
