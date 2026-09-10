# Tutorial Deploy: YouTube Downloader → GitHub + Vercel

## 0. Prasyarat

- Akun **RapidAPI** (rapidapi.com) — gratis.
- Akun **Vercel** (vercel.com, login via GitHub) — gratis.
- Git + `gh` CLI (login via `gh auth login` bila belum).

## 1. Ambil RapidAPI key (5 menit)

1. Buka rapidapi.com, login.
2. Cari **"YouTube MP3"** (oleh ytjar) → buka → **Subscribe to Test** →
   pilih tier **Basic/Gratis** → Subscribe.
3. Cari **"YouTube Media Downloader"** (oleh DataFanatic) → langkah yang sama,
   tier gratis. Host-nya `youtube-media-downloader.p.rapidapi.com`.
4. Di halaman API itu → tab **Endpoints** → pilih `Get Video Details`
   (`GET /v2/video/details`) → panel **Code Snippets** (kanan) → salin nilai
   header **`X-RapidAPI-Key`**. Satu key berlaku untuk semua API di akunmu.

## 2. Uji lokal dulu (jangan skip)

Di root proyek ini, buat file **`.env.local`** (sejajar `.env.example`):

```
RAPIDAPI_KEY=tempel_key_kamu_di_sini
```

Restart dev server (`npm run dev`) agar env terbaca, buka
`http://localhost:3000`:

| Uji | Hasil benar |
| --- | --- |
| MP3 + `https://www.youtube.com/watch?v=aqz-KE-bpKQ` | link `.mp3` muncul, bisa diputar |
| MP4/720 + URL sama | link `.mp4` + tulisan "Kualitas aktual: …" |
| `https://example.com/x` | ditolak instan di UI |
| Kuota RapidAPI habis (nanti) | pesan "Kuota RapidAPI habis", tombol Coba lagi |

> Catatan: endpoint baru hanya menyediakan MP4 progresif (dengan suara) di
> 360p; kualitas di atasnya video-only tanpa suara. Jadi meski pilih 720/1080,
> "Kualitas aktual" akan tertulis 360p — itu file yang benar-benar bisa diputar.

## 3. Push ke GitHub

```bash
cd F:/youtube-downloader
git init -b main
git add -A
git status --short
```

Pastikan: `.env.example` ADA di daftar, `.env.local` TIDAK ADA
(kalau muncul, key hampir bocor — jangan commit).

```bash
git commit -m "YouTube downloader MVP (Next.js + RapidAPI)"
gh repo create youtube-downloader --private --source=. --push
```

Ganti `--private` → `--public` kalau mau publik.

## 4. Deploy ke Vercel

1. vercel.com → **Add New → Project** → **Import** repo `youtube-downloader`.
2. Framework otomatis **Next.js** — biarkan semua default.
3. Buka **Environment Variables**, tambah (centang Production, Preview,
   Development):
   - `RAPIDAPI_KEY` = key dari langkah 1
4. **Deploy** → tunggu ±1 menit → dapat URL production.

## 5. Verifikasi production

Ulangi tabel uji langkah 2 di URL Vercel. Setiap `git push` ke `main`
akan auto-redeploy.

## 6. Kalau error

| Gejala | Arti | Aksi |
| --- | --- | --- |
| `Kuota RapidAPI habis` (429) | limit harian vendor tercapai | tunggu reset / upgrade tier di RapidAPI |
| `502` + `code` | vendor gagal ambil video itu (privat, region, diblokir) | coba video lain; bukan bug web |
| `500` tanpa code | key salah/belum di-set di Vercel | cek env Vercel → **Redeploy** (env baru butuh redeploy) |
| Semua request lambat >25 dtk | timeout vendor | coba lagi; video panjang butuh konversi lebih lama |

**Catatan kuota ganda:** web membatasi 10 req/menit/IP, tapi tiap klik
Unduh juga memakan 1 hit kuota RapidAPI. Jangan bagikan URL Vercel ke
publik luas selama masih tier gratis.
