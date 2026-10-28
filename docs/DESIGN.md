# DESIGN — Spartio.app (Chord & Number Score Builder)

> **Status dokumen:** As-Is, dengan catatan acuan Stitch yang ditandai eksplisit. Dokumen ini bukan usulan redesign.
> **Bahasa:** Bahasa Indonesia.
> **Sumber riset:** `index.html`, `styles/base/tokens.css`, `styles/base/fonts.css`, `styles/base/print.css`, `styles/layout/shell.css`, `styles/layout/responsive.css`, `styles/components/editor.css`, `styles/components/editor-chrome.css`, `styles/components/gallery.css`, `styles/components/album.css`, `styles/components/library.css`, `styles/components/library-desktop.css`, `styles/themes/dark.css`, `styles/pages/auth.css`, `styles/score/preview.css`, `styles/score/preview-print.css`, `styles/score/chordpro.css`, `assets/*`, `manifest.webmanifest`.
> **Dokumen terkait:** `docs/PRD.md`, `docs/ALBUM-FEATURE.md`, `docs/FIREBASE-SETUP.md`.
> **Acuan sistem desain:** Stitch **"Framed Notation Studio"** — project `spartio.app-fixed` (`projects/2718728460661214511`), design system `assets/0d537f7dfca143458b6f1b743258196b`. Status: acuan token/arah; kode repo tetap sumber kebenaran. Snapshot DESIGN.md di Stitch (21 Okt 2026) mendahului migrasi brand icon dan tidak boleh disalin ke §13. Peta frame ada di §16.

---

## Daftar Isi

1. [Prinsip Desain](#1-prinsip-desain)
2. [Design Tokens](#2-design-tokens)
3. [Tipografi & Font](#3-tipografi--font)
4. [App Shell & Layout](#4-app-shell--layout)
5. [Komponen UI](#5-komponen-ui)
6. [Desain Score Canvas (Beat Grid)](#6-desain-score-canvas-beat-grid)
7. [Desain ChordPro Workspace](#7-desain-chordpro-workspace)
8. [Desain Home: My Songs & Albums](#8-desain-home-my-songs--albums)
9. [Dark Theme](#9-dark-theme)
10. [Responsif](#10-responsif)
11. [Print / PDF Layout](#11-print--pdf-layout)
12. [Motion & Interaksi](#12-motion--interaksi)
13. [Ikon, Aset & PWA](#13-ikon-aset--pwa)
14. [Aksesibilitas](#14-aksesibilitas)
15. [Konvensi & Batasan Desain](#15-konvensi--batasan-desain)
16. [Acuan Stitch: Design System & Frame](#16-acuan-stitch-design-system--frame)
17. [Lampiran — Peta File Desain](#lampiran--peta-file-desain)

---

## 1. Prinsip Desain

### Konsep payung: Framed Sheet

Arah ini juga menjadi nama design system Stitch (§16):

- **Surface isolation.** Chrome app adalah drafting surface tinted; hanya kertas skor yang menjadi kanvas putih.
- **Functional contrast.** Warna dipakai untuk aksi dan sinyal harmonik; permukaan memakai tone step + hairline, bukan saturasi.
- **Musical micro-interactions.** State musik diberi isyarat tactile: dot pada beat kosong, pill mode notasi asli, aksidental Nashville zero-width, dan tab aktif.

Prinsip yang terbaca dari implementasi existing:

1. **Preview adalah kebenaran.** Panel preview bukan mockup — node `#previewCard` / `#cpPreviewCard` yang sama dipindah ke dialog PDF dan ke kertas. Aturan: paper dan pane tidak boleh drift.
2. **Kertas tidak mengandung chrome.** Semua elemen app-shell (topbar, panel alat legacy, footer situs, toast, banner album, ring seleksi) wajib disembunyikan di `@media print` / `html.is-print-layout`.
3. **Satu jarak, semua tipe ketuk.** Sel chord polos dan sub-sel ½/⅓/¼ berbagi tinggi + offset yang sama agar garis notasi sejajar.
4. **Mode tidak saling mengotori.** ChordPro memakai prefix `cp-` + gate `body[data-editor-mode="chordpro"]` agar geometri grid tidak bocor.
5. **Tipografi berat harus asli, bukan sintesis.** Chord memakai `font-weight: 850/900` yang hanya benar bila font variable asli dimuat.
6. **Sentuh dulu, klik kemudian.** Implementasi saat ini memiliki kontrol ≥40px pada coarse pointer; untuk kontrol baru, targetkan area interaksi 44×44 CSS px. Long-press = right-click; chip filter mendukung layar sentuh. Ukuran yang tercatat bukan bukti bahwa seluruh UI sudah lulus audit aksesibilitas.
7. **Dekorasi tidak boleh menggeser musik.** Slash coret Nashville absolute (tanpa lebar); chord-row cetak zero-height track + offset relatif; digit bar-number memakai band cadangan.
8. **Warna untuk aksi dan data, bukan chrome.** Bingkai editor memakai satu ground tinted; kertas skor tetap satu-satunya permukaan putih. Pemisahan permukaan memakai tone step atau garis tipis, bukan shadow; shadow hanya untuk elemen yang benar-benar mengambang (dialog, popover, menu). Satu aksi terisi (Save), sisanya quiet. Lime (`--lime` / `--spark`) hanya untuk titik/aksen, tidak pernah menjadi surface.

### Cara menggunakan panduan ini saat mengubah UI

- Untuk penambahan komponen, ikuti token, pola, dan perilaku komponen terdekat. Jangan membuat ulang app shell hanya karena sedang menambah fitur kecil.
- Nilai dan class yang dijelaskan di bawah memotret implementasi saat ini. Anggap sebagai referensi, bukan batas mutlak, kecuali disebut sebagai invariant atau kontrak.
- Perubahan visual besar atau perubahan identitas produk perlu arahan pemilik produk. Untuk perubahan kecil, ikuti arah yang sudah ada dan jelaskan alasan bila memperkenalkan pola baru.
- Jaga perilaku keyboard, tema light/dark, responsif, reduced motion, dan paritas print. Jangan menyatakan aksesibilitas lulus tanpa pengujian yang sesuai.

---

## 2. Design Tokens

### 2.1 Warna inti

Dua lapis yang disengaja: `styles/base/tokens.css` (minified, network-first) masih
memuat nilai legacy di `:root`, lalu **`styles/layout/shell.css` `:root` me-remap semua
token inti ke palet refreshed** (styles/layout/shell.css dimuat setelahnya, jadi nilai inilah
yang aktif di seluruh app). Nilai aktif:

| Token | Nilai (light) | Peran existing |
|---|---|---|
| `--ink` | `#163a2a` | Teks utama |
| `--muted` | `#69756f` | Teks sekunder, hint, label |
| `--green` | `#237a50` | Aksi primer, brand mark (chrome); `theme-color` mengikuti tile ikon `#121711` |
| `--dark-green` | `#155c3c` | Teks di atas surface lembut, hover primer |
| `--lime` | `#b8e85c` | Aksen terang (badge, marker) |
| `--cream` | `#fcfbf5` | Latar kertas/kartu terang |
| `--surface` | `#fff` | Kartu editor & preview |
| `--line` | `#d9e5dc` | Border kartu, divider, rule preview |
| `--soft` | `#eaf5ed` | Latar tombol ghost, panel lembut |
| `--app-bg` | `#f2f5f2` | Latar app (terang) |
| `--primary-fill` | `#237a50` | Isi tombol aksi primer (New Song, Filter, Save) — **nilai sama di light dan dark** |
| `--primary-fill-ink` | `#ffffff` | Teks di atas isi primer |
| `--primary-fill-hover` | `#1e6e47` | Isi primer saat hover |

Nilai legacy di `styles/base/tokens.css` (`--ink #193326`, `--green #1f704a`,
`--dark-green #125838`, `--lime #b9e654`, `--cream #fffdf7`, `--line #dce8df`,
`--muted #69756f`, `--soft #eff7f1`) hanya berlaku bila styles/layout/shell.css gagal dimuat.
Varian dark didefinisikan ulang di `styles/themes/dark.css` (`html[data-theme="dark"]`,
lihat §9) dan `manifest background_color: #0f1110`.

**Catatan kontras:** `--muted: #69756f` menghasilkan rasio 4.63:1 pada `--cream: #fcfbf5` dan 4.80:1 pada putih. Kedua pasangan memenuhi 4.5:1 untuk teks normal. Ini hanya memverifikasi pasangan token tersebut; warna campuran, opacity, tema, dan latar lokal tetap perlu diperiksa pada penggunaan yang relevan.

**Aturan warna aksi primer (semua komponen):** satu hijau brand `#237a50` (`--primary-fill`) dipakai untuk **semua** tombol aksi primer — topbar home, editor (`Save`), dialog, dan filter. Nilainya **tidak berubah di dark theme**: teks di atasnya tetap putih (`--primary-fill-ink`), hover memakai `#1e6e47`. Aksen mint `#83c99d` (dark) hanya untuk focus ring, garis aktif, dan teks aksen — tidak pernah menjadi isi tombol.

### 2.2 Token UI (`styles/layout/*.css`, `styles/components/*.css`)

- Radius: token `--radius-sm / --radius-md / --radius-lg` = `9px / 14px / 22px`. Pemetaan aktual: chip/input `8px`, tombol `9px`, popover/menu `12px`, panel `14px`, dialog `16px`, kartu luar `18px`, shell `22px`, pill `9999px`. Hanya tiga nilai pertama yang bertoken; sisanya literal di komponen.
- Elevasi: `--shadow-sm` (`0 1px 2px rgba(20,58,41,.05), 0 7px 24px rgba(20,58,41,.06)`) dan `--shadow-md` (`0 18px 55px rgba(20,58,41,.12)`) dipakai kartu/panel. Chrome editor memakai satu `--editor-elev` (`0 14px 34px rgba(16,40,28,.16)`; dark `0 18px 40px rgba(0,0,0,.55)`) untuk popover, menu, dialog, dan toast. Backdrop dialog `rgba(9,22,15,.42)` + blur `8px`; dark `rgba(0,0,0,.62)`.
- Surface app: `--app-bg`, `--ui-bg`, `--ui-border`, `--ui-text`, `--ui-text-dim`, `--ui-accent`.
- Ukuran kontrol: `.button` padding `10px 15px`, font `700 14px`; `.button-small` `7px 10px / 12px`; `.icon-button` min `44px` pada area sentuh.
- Lebar kartu home: `--card-w`; skala preview PDF: `--pdf-preview-scale`; dimensi kertas: `--pdf-page-w / --pdf-page-h / --pdf-page-margin-*`.
- Font mono: stack sistem `ui-monospace, SFMono-Regular, Menlo, monospace` (fallback `var(--mono)`; JetBrains Mono tidak dibundel) untuk kode (`[C]`, `{soc}`, `?t=`).
- **Token library (`--library-*`, blok `LIBRARY REDESIGN` di `styles/components/library.css`)**: `--library-ground` `#f2f5f2` / `--library-surface` `#ffffff` / `--library-raised` `#eaf5ed` / `--library-line` `#d9e5dc` / `--library-rule` `#e9efea` / `--library-control` `#7c8a80`, plus `--library-head` `#f1f4f1` (header tabel), `--library-hover` `#f2f5f2` (hover baris), `--library-key-bg` `#ecefec` (badge key), `--library-skeleton` `#dfe7e1` (bar loading; dark `#2c342e`), `--library-ink` `#163a2a` / `--library-muted` `#526259`, `--library-accent` (fokus + teks aksen), `--library-primary` `#237a50` (isi tombol primer), `--library-secondary` `#426653` (aksi baris `Open`), `--library-danger`. Nilai `--library-primary` **sama di light dan dark**; dark hanya membalik surface/ink/accent.
- **Token chrome editor (`--editor-*`, blok `EDITOR CHROME REFRESH` di `styles/components/editor-chrome.css`)**: `--editor-ground` (bingkai), `--editor-surface` (kertas/kartu), `--editor-raised` (tone step lembut), `--editor-skeleton` `#dfe7e1` (bar loading; dark `#2c342e`), `--editor-line` / `--editor-rule` (garis), `--editor-ink` / `--editor-muted` (teks), `--editor-accent` / `--editor-accent-ink` / `--editor-accent-hover` (aksi), `--editor-danger`, `--editor-control`, dan `--editor-elev` (satu shadow untuk elemen mengambang saja). Token mode bersama: `--mode-chords-line/fill/ink`, `--mode-numbers-*`, `--mode-chordpro-*` (dipakai tile library, popover versi, dan badge editor). Nilai light/dark memakai palet library yang sudah ada (`#eef1ec` / `#0f1110`, surface `#fff` / `#171a18`, ink `#163a2a` / `#f1f4f2`, accent `#237a50` / `#83c99d`). Semua aturan chrome dibungkus `@media screen`; print tidak tersentuh.

### 2.3 Token score (`styles/score/preview.css`)

- Grid: `--beats`, `--leaf`, `--subdivisions`, `--chord-above-w: 68px` (satu lebar untuk semua sel chord-row agar rapi, bukan ragged).
- Tinggi layar: `--chord-above-h`, celah `--chord-above-gap`, daun tambahan `--chord-above-leaf`.
- Lirik: `--lyric-h`, `--lyric-gap`, `--lyric-bar-pad`, `--lyric-leaves`.
- Cetak: `--print-chord-size`, `--print-notation-h`, `--print-chord-h`, `--print-lyric-size`, `--print-slot` (beat spacing), `--print-bar-pad-x/y`, `--print-row-pad-x` (indent baris; 0 default, 2.6mm di scope `1/4`), `--print-beam-gap/top`, `--print-barline-h`.
- Chord-row cetak: `--print-chord-above-size` (90% chord size, mengikuti slider), `--print-chord-above-row`, `--print-chord-above-line-gap: 6mm` (+0.4mm baris pertama section).
- Nomor bar cetak: `--print-bar-num-size: 3mm` (line) / `2.6mm` (every), `--print-bar-num-top: 3.5mm`, `--print-bar-num-inset: 1.3mm`, `--print-bar-num-row/--extra-top/bottom`, `--print-bar-num-weight: 800`.

### 2.4 Token ChordPro (`styles/score/chordpro.css`)

- Padding kartu: `--cp-card-pad-x: 10mm`, `--cp-card-pad-y: 12mm` (diselaraskan dengan geometri Chord Chart agar "preview = kertas").
- Ukuran cetak chord ≈5.4mm, lirik ≈4.3mm (diturunkan dari slider PDF, disimpan per lagu).

### 2.5 Token auth (`styles/pages/auth.css` → `--auth-*`)

Draft pertama sistem desain refreshed; nantinya bisa diangkat ke `:root`
app-wide tanpa rename. Semua di-scope `.login-page` saja.

| Token | Light | Dark | Peran |
|---|---|---|---|
| `--auth-bg` | `#faf9f2` | `#0d0f0d` | Kanvas halaman (cream hangat) |
| `--auth-panel` | `#175c3e` | `#123526` | Panel brand hijau tua (aside) |
| `--auth-panel-ink` | `#f2f7f0` | `#eef4ef` | Teks di atas panel |
| `--auth-panel-muted` | `rgba(242,247,240,.72)` | `rgba(238,244,239,.66)` | Teks sekunder panel |
| `--auth-card` | `#ffffff` | `#161816` | Kartu form |
| `--auth-field` | `#f4f3ea` | `#1d211e` | Isi input borderless |
| `--auth-field-focus` | `#ffffff` | `#222622` | Isi input saat fokus |
| `--auth-ring` | `rgba(35,122,80,.28)` | `rgba(85,185,130,.3)` | Ring fokus input |
| `--auth-spark` | `#b8e85c` | — | Lime, **spark saja** (ikon poin, outline fokus tombol primer) |
| `--auth-danger` / `-bg` | `#b42318` / `rgba(180,35,24,.08)` | `#ff9b8f` / `rgba(255,100,85,.1)` | Error pill |

Token bentuk: radius card `28px` / btn `14px` / field `12px`; satu layered
card shadow (`0 1px 2px` + `0 24px 60px -20px`); easing
`cubic-bezier(0.22, 1, 0.36, 1)`. Aturan lime: **tidak pernah sebagai surface**.

### 2.6 Delta acuan Stitch "Framed Notation Studio"

Design system Stitch bernama **Framed Notation Studio** (project `spartio.app-fixed`, `projects/2718728460661214511`, asset `assets/0d537f7dfca143458b6f1b743258196b`). Ia merangkum arah yang sama dengan dokumen ini, tetapi beberapa nilainya adalah acuan, bukan implementasi. Jangan menyalin kolom Stitch tanpa mengubah kode dan memeriksa paritas print.

| Aspek | Stitch | Repo aktif |
|---|---|---|
| Ground editor | `#f2f5f2` | `--editor-ground: #eef1ec` |
| Backdrop dialog | `rgba(9,22,15,.45)` + blur `4px` | `rgba(9,22,15,.42)` + blur `8px` |
| Danger | `#b42318` | `--editor-danger: #a32922` (dark `#ff9b8f`) |
| Amber save | `#e08b1a` | dot unsaved `#f5a623` |
| ChordPro gold | `#d49a2a` | `#8a6a10` / `#d4a72c` |
| Isi aksi primer | `#237a50` | `--primary-fill: #237a50` (light **dan** dark) |
| Mono | JetBrains Mono | system mono; JetBrains tidak dibundel |
| Elevasi | tiga tier (popover, modal, toast) | satu `--editor-elev` |
| Type scale | 34/24/18px display–headline | dipakai selektif; judul dialog 19px, judul home 26px |

Yang sudah selaras: primary `#237a50` (isi tombol aksi primer, light dan dark), ink `#163a2a`, line `#d9e5dc`, lime `#b8e85c`, split Sora/Inter, radius 9/14/22, topbar 48px, dan aturan flat plane.

---

## 3. Tipografi & Font

- **Stack global:** `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (`styles/base/tokens.css` body).
- **Self-hosted variable Inter** (`styles/base/fonts.css`, `assets/fonts/inter-latin-wght-normal.woff2` ±47KB):
  - `wght 100–900`, `font-display: swap`, family tetap `"Inter"` agar nol perubahan selector.
  - Alasan: tanpa ini macOS jatuh ke San Francisco (variable → chord 850/900 tepat), Windows jatuh ke Segoe UI (statis → bold disintesis, `B♭m/F` terlihat lebih gemuk/sempit). Dengan file ini kedua OS me-render sama.
- **Self-hosted variable Sora** (`assets/fonts/sora-latin-wght-normal.woff2`):
  - `wght 100–800`, `font-display: swap`, family `"Sora"`.
  - Peran: **UI voice** — seluruh chrome editor (topbar, chip, tombol, BPM/history, banner, toast, footer, dialog, popover, panel ChordPro) dan kontrol screen-only di dalam kertas (Reset/Add section, transpose/playback/lyrics, section/bar tools), headline aside login, judul kartu login, tombol primer auth, dan library/dialog. Token `--editor-font` merangkum stack `"Sora", "Inter", system-ui, …`.
  - **Kertas skor tetap Inter**: `#previewCard` / `#cpPreviewCard` adalah dokumen cetak; chord memakai bobot 850/900 dan subset aksidental, dan metriknya bagian dari kontrak PDF. Jangan menerapkan Sora ke dalam kertas.
  - Kode (`.cp-textarea`, `<code>`) tetap monospace.
- **Subset aksidental Noto Serif JP** (`noto-serif-jp-accidentals.woff2` 876-byte, OFL 1.1):
  - `unicode-range: U+266D–266F` pada family `"Inter"` yang sama, `font-weight: 100 900` (dipakai apa adanya, tidak di-faux-bold).
  - Alasan: Inter tidak punya glyph musik; stack serif `Georgia/Times` juga tidak punya ♭/♯ → dulu jatuh ke Hiragino (macOS) vs Segoe UI Symbol (Windows). Subset mincho ini menyatukan bentuk di semua OS.
- **Hierarki existing:**
  - `h1` library redesign `26px / 650 / -0.035em` (22px di phone); intro lama `clamp(27px,3vw,38px)`. Eyebrow `10px / .13em / 800 / green` (`LIVE PREVIEW`, `EXPORT SETTINGS`).
  - Judul preview `h1#previewTitle` editable (satu-satunya `h1` halaman; topbar tidak mengulang judul); artist `Created by: <em>`; meta `KEY/TIME/TRANSPOSE` huruf kecil kapital dengan nilai bold. BPM pindah ke topbar.
  - Chord terpasang `.placed-chord` berat 850/900; angka Nashville dengan dot oktaf + slash coret; lirik kecil di bawah ketuk.
  - Kode inline (`<code>`) memakai stack mono sistem (`--mono` fallback) di how-to dan hint ChordPro.
  - Skala Stitch `display 34 / headline-lg 24 / headline-md 18 / nashville 20` adalah acuan, bukan implementasi: judul dialog aktual `19px`, judul home `26px`; chord dan angka Nashville memakai `.placed-chord` `18px/850`.
- **Lisensi:** `assets/fonts/Inter-LICENSE.txt`, `assets/fonts/Sora-LICENSE.txt`, `NotoSerifJP-LICENSE.txt` (OFL 1.1); sumber `@fontsource-variable/inter`, `@fontsource-variable/sora`, `@fontsource/noto-serif-jp`. Font di-precache `sw.js` untuk offline.

---

## 4. App Shell & Layout

### 4.1 Topbar editor (`.topbar`, tinggi 48px, sticky)

- **Bingkai (framed sheet):** topbar memakai ground tinted yang sama dengan halaman (`--editor-ground`), tanpa border bawah, tanpa blur/glass, dan tanpa shadow saat diam. Halaman di bawahnya adalah bingkai; kertas skor adalah satu-satunya permukaan putih.
- **Header-only sticky:** `.topbar` memakai `position: sticky; top: 0`; hanya bar ini yang mengikuti scroll, bukan kertas atau header skor. `initStickyTopbar()` menambahkan `.is-stuck` setelah halaman bergulir, yang memunculkan satu garis tone `--editor-line` (bukan shadow mengambang). Fungsi ini screen-only dan tidak menyentuh geometri print/PDF.
- Kiri (`.topbar-nav`): tombol `Back` (ghost, ikon panah SVG) + version switcher (chip ikon copy + label + chevron) + YouTube chip. Judul lagu tidak diulang di topbar; judul ada di kertas sebagai `h1`.
- Kanan (`.topbar-actions`): mode badge, album pill (ikon disc SVG), divider, **transport** (`.transport-control`: play SVG + separator + BPM input dalam satu border), history control (segmented Undo/Redo ikon), lalu grup aksi primer (`.topbar-action-group`): `Save to Cloud/Album/Copy` (satu-satunya tombol terisi, hijau) + `Export .pdf` (outline quiet). Grup ini satu flex group agar di phone turun baris bersama, tidak terbelah.
- **Satu keluarga chip:** version switcher, mode badge, album pill, dan YouTube chip berbagi tinggi 28px, border 1px `--editor-line`, radius 8px, background `--editor-surface`. Transport memakai tinggi 30px desktop / 40px phone; di tablet sempit label `BPM` menjadi sr-only agar bar tetap satu baris. Di tablet (681–1050px) label mode juga sr-only (ikon tetap).
- **Mode badge = wajah produk:** chip netral berisi tile 20px dengan SVG yang sama seperti baris My Songs/Albums. Warna mengikuti token mode: Chord Chart hijau (`--mode-chords-*`), Numeric ungu (`--mode-numbers-*`), ChordPro amber (`--mode-chordpro-*`). Label teks tetap `--editor-ink`; di phone label menjadi sr-only dan `aria-label`/`title` menyebut mode lengkap.
- **History control:** satu wrapper ber-border dengan dua tombol ikon 30×28 (desktop) / 32×40 (phone). Disabled = opacity 0.32; enabled = hover tone step; tooltip dan `aria-label` menyebut jumlah langkah (`Undo · 3 steps available`) serta shortcut keyboard. Satu kontrol ini dipakai semua mode; tidak ada Undo/Redo duplikat di panel ChordPro.
- **Transport:** satu tombol di topbar mulai dari section aktif (`state.activeId`) dan lanjut ke akhir lagu. Ikon awal adalah play; setelah playback benar-benar mulai, ikon berubah menjadi **stop** dan aria/tooltip menjadi `Stop playback`. Guard `playPending` mencegah sample loading memulai dua timeline. Tidak ada tombol play per-section.
- **Save state machine:** dot amber `is-unsaved` (ada), `is-saving`, lalu `is-saved` selama ~1,6 detik (ikon berubah menjadi ✓ dan tone mengendap) setelah simpan sukses. Class ditambahkan oleh `flashSavedState()` di `cloudUI.js`; logika simpan tidak berubah.
- **Loading lock:** selama skeleton editor aktif (`html[data-editor-loading="1"]`), grup `.topbar-actions` diberi `inert` agar Save/Export/transport/history tidak bekerja pada dokumen lama; `Back` tetap aktif. Status `#editorLoadingStatus` berada di luar `#previewViewport` yang `aria-busy`, jadi pengumuman loading tidak tertahan oleh subtree busy.
- Style: `padding: 0 clamp(12px,2vw,24px)`, latar `--editor-ground`, tipografi Sora (`--editor-font`); semua ikon chrome adalah inline SVG stroke (bukan emoji).

### 4.2 Workspace score inline (framed sheet)

- **Bukan lagi dua kolom.** `.workspace.ribbon-workspace` di-set `display:block` (`styles/score/preview.css`) dan `.editor-card` disembunyikan (`styles/layout/shell.css`). Aside alat lama tetap ada di DOM karena menyimpan input metadata (`#songTitle`, `#artist`, `#keySelect`, `#timeSignature`) yang dibaca JS; jangan menghapusnya tanpa memindahkan state. Ia bukan permukaan UI.
- `main`: `max-width:none`, padding `8px clamp(8px,1.4vw,16px) 16px`; `.preview-viewport` memakai latar `--editor-ground` dan padding `18px 16px 24px`; `.preview-card#previewCard` `width:100%`, `min-width:min(920px,100%)`, margin auto.
- Header skor: eyebrow `LIVE PREVIEW`, judul editable (`h1`), artist, lalu kolom meta: switch `LYRICS`, `KEY`, `TIME SIGNATURE`, dan `TRANSPOSE −/+`. Play dan BPM berada di topbar sticky, bukan di kertas.
- Entry chord inline: klik beat membuka `.chord-popover`; klik kanan / long-press membuka beat menu (split ½/⅓/¼, fermata, hapus subdivisi); menu section `•••`; banner `Placing: … — tap a beat`.
- Section tools: `+ Add section` menyisipkan section baru **setelah** section itu. Playback tidak punya tombol per-section — semua play/stop terpusat di transport topbar dan memakai section aktif sebagai titik mulai. Section tools disembunyikan di print.
- Footer skor: `Reset Sheet`, `+ Add section at end`, signature `Generated with Spartio.app`.
- Di mode Chord Chart/Numeric tidak ada panel alat kiri, tab ribbon, atau shortcut Alt+1…5 di UI saat ini. `.ribbon-*` adalah DOM legacy (§5.2). `scroll-affordance` (`Scroll to see more →`) tetap dipakai saat sheet lebih lebar dari viewport.

### 4.3 Struktur fallback ChordPro (inline di `index.html`)

Empat aturan struktural ditaruh inline agar swap workspace tidak tergantung stylesheet kedua (tahan 404/cache basi): `.cp-workspace display:none` default; `body[data-editor-mode=chordpro]` menampilkan grid `minmax(330px,40%) minmax(0,1fr)` + menyembunyikan `.ribbon-workspace`, `main > .workspace`, `.preview-stage`; ≤980px jadi satu kolom; print jadi block. `render.js` juga menyetel swap yang sama via inline style (redundansi disengaja).

### 4.4 Footer situs (`.site-footer`)

Identitas (`Spartio.app`, `Built with care by dhandyjoenathan…`), badge `Open source`, catatan gratis. Sengaja dikeluarkan dari kertas (lihat §11).

---

## 5. Komponen UI

### 5.1 Tombol

| Class | Tampilan existing |
|---|---|
| `.button-primary` | Isi `--primary-fill` (#237a50) + teks putih — nilai sama di light & dark (aksi utama: New Song/Album, Save, Export di dialog) |
| `.button-ghost` | Latar `--editor-surface`, border 1px `--editor-line`, teks ink (aksi sekunder). Di header library aksi sekunder **borderless** (lihat §8.2) |
| `.song-card-open` | Aksi baris pada indeks library: isi **secondary** (`--library-secondary` = `#426653` light / `#3f6b55` dark) + teks putih |
| `.button-dark` | Varian outline untuk `Export .pdf` di topbar: latar transparan, border garis, teks ink |
| `.button-save` | Tombol save topbar: satu-satunya filled hijau; dot amber saat unsaved; `is-saved` menampilkan ✓ singkat |
| `.button-danger` | Merah (Delete version, Leave) |
| `.button-reset` | Reset Sheet kecil, tanpa border sampai hover |
| `.icon-button` | Kotak ikon 32px; border transparan, muncul saat hover |
| `.history-btn` | Undo/Redo ikon-only dalam satu segmented control topbar; tooltip menyebut shortcut + jumlah langkah |
| `.transport-play` | Tombol play/stop SVG di grup transport topbar; warna accent, hover tone step, berubah ke ikon stop saat playing |
| `.pdf-choice` | Pilihan segmented (preset + bar numbers) dengan `aria-pressed`; aktif = accent fill |
| `.home-fab-trigger` | Speed-dial `＋` kanan-bawah (tablet/phone) |

Hover chrome editor: perubahan tone/border saja (tanpa `translateY`), transisi `.16s`; shadow resting dihapus. Fokus memakai ring accent 2px (`:focus-visible`) yang sama di topbar, dialog, dan popover.

### 5.2 Entry inline & DOM legacy

- Tidak ada ribbon yang terlihat. `.ribbon-tab`, `.ribbon-panel`, `.key-picker`, `.chord-bank`, `.beat-bank`, dan switch lyrics di dalam `.editor-card` adalah DOM legacy yang tersembunyi bersama aside; beberapa input masih dipakai untuk metadata/state.
- Permukaan aktif untuk memasukkan chord/ritme adalah chord popover, beat menu, fermata editor, section menu, dan dialog (§5.3). Jangan menambahkan kontrol baru ke panel legacy tanpa menghidupkannya kembali secara sengaja.
- Kalau panel alat dihidupkan lagi, itu perubahan desain baru: perbarui §4.2, §5.2, §10, §14, dan paritas print.

### 5.3 Popover & menu

- Chord popover: input + daftar saran + chip `♮ ♯ ♭` (filter) + `Use custom chord` + pesan kosong.
- Beat menu (right-click/long-press): split ½/⅓/¼, `Fermata (hold)…`, hapus subdivisi.
- Fermata editor: input extra beats.
- Section menu `•••`: copy bars range, copy/paste section, reorder, delete.
- Account popover: identitas + Sign out. Toggle tema pindah ke topbar sebagai tombol ikon (lihat §9).
- Version popover: daftar versi (mode mark + label) + `＋ New version`.
- Member actions sheet `#memberActionsDialog`: `Make MD / Make member / Remove from album` (ikon SVG).
- **Satu floating surface:** `.account-popover` (termasuk `.version-popover`), `.section-menu-popover`, `.chord-popover`, beat menu, dan fermata editor memakai background `--editor-surface`, border 1px `--editor-line`, radius 12px, dan satu-satunya shadow `--editor-elev`. Item menu memakai padding konsisten; hover = tone step, bukan lift; item destruktif memakai `--editor-danger`.

### 5.4 Dialog (`.confirm-dialog` generik)

Struktur: backdrop + card + ikon + title + desc + actions (`.confirm-dialog-actions-stacked` untuk 3 tombol). **Chrome dialog:** kartu `--editor-surface`, border 1px `--editor-line`, radius 16px, satu shadow `--editor-elev`; backdrop `rgba(9,22,15,.42)` + blur 8px. Ikon dialog adalah container 40px transparan berisi SVG stroke 22px warna accent (bukan emoji, bukan lingkaran tinted). Judul memakai Sora; kicker uppercase dihapus. Varian:

- Mode picker (`#newSongDialog`): input nama versi + 3 `.mode-card`. Setiap kartu memakai aksen mode bersama (`--mode-*`) dan contoh notasi yang bergerak sekali saat dialog dibuka: Chord Chart, angka Numeric, dan baris ChordPro. Pilihan aktif ditandai border aksen mode, tint lembut, dan cek bulat. Poin tetap memakai penanda teks.
- New Version / Version Details / YouTube Link: field nama + field YouTube + thumbnail preview + tombol hapus link + error `That doesn't look like a valid YouTube link`.
- PDF options: dua kolom (preview kertas + panel kontrol), header `PDF options` (tanpa kicker), footer `Reset to defaults + Export PDF`; pane preview tetap menampung node `#previewCard`/`#cpPreviewCard` asli.
- Login bukan modal — full page (lihat §8). Attach Link: header berikon, tiga langkah Paste, Preview, Load into editor, area tempel berikon, catatan privasi, lalu Preview. Unsaved: 3 tombol. How-to: header berikon, daftar grup yang bisa digulir, item dengan judul dan penjelasan singkat, serta footer sticky. Join Album: header berikon + input kode `ABCD-1234` dengan hint format. New Album: header berikon + nama + deskripsi. Device-hint phone: kartu tengah + blur backdrop.
- Konfirmasi generik (`#confirmDialog`) memakai header berikon di kiri, deskripsi di kanan, tombol Cancel sebelum aksi utama, dan aksen danger pada ikon serta tombol untuk Sign out, Leave album, dan aksi destruktif lain.

### 5.5 Chip, pill, badge

- YouTube chip: satu container dua state (`data-state=link|none`); state link = thumbnail 44×24 + label `▶` + ikon edit SVG; state none = ikon clapper SVG + `No video` (klik untuk tempel). State diganti (bukan `hidden` saja) agar thumbnail basi tak pernah tampil.
- Mode badge: chip netral + tile mode bersama (SVG & tint hijau/ungu/amber) + teks di topbar (lihat §4.1). Ikon di popover versi memakai mark dan warna yang sama.
- Album pill: ikon disc SVG + nama (konteks album).
- Member banner: ikon shield SVG + teks read-only (bukan konten cetak), band `--editor-raised` dengan bar accent 3px di kiri.
- Kartu lagu: tile mode dari versi teratas (`libraryModeIcon`), tanpa label teks; dot amber unsaved.
- Toast (`#toast`, `role=status`): notifikasi ringan, radius 8px, `--editor-elev` (cap tercapai, copy berhasil, dsb).
- **Ikon chrome** memakai set inline SVG stroke 15–18px di dalam `.btn-icon` / `.icon-glyph`; emoji tidak dipakai sebagai ikon UI.

---

## 6. Desain Score Canvas (Beat Grid)

### 6.1 Bar & ketuk

- Section: label box + tools (Chords On/Off khusus Chord Chart, `+ Add 1 bar`, menu). Bar: barline + sel ketuk; nomor bar layar kecil `10px/0.34` (faint, disembunyikan di preview PDF).
- `1/4` = satu ketuk per bar: section digambar sebagai SATU bar kontinu (`body[data-meter="1/4"]` di layar, `@media print`, dan `html.is-print-layout`) — tanpa bar line di antara ketuk, tetapi garis tetap di awal & akhir tiap baris (baris editor = `.bar-batch`, baris cetak = bar yang ditandai `pdf-row-start` / `pdf-row-end` oleh `src/pdf/pdf.js`); beat tetap mengalir dengan beat pitch normal, nomor bar disembunyikan, dan editor memakai kosakata "beat" (`+ Add 1 beat`, hapus/salin per beat, caption `1 bar · N beats`). Meter lain tidak tersentuh.
- Beat: `.beat` + `.sub-beat`; state `has-chord`, `drop-target`, `chord-editing`; hover menampilkan dot + outline putus (hanya `html:not(.is-print-layout)` + bukan dragging).
- Drag & drop: indikator target + animasi `drop-success` 450ms; `Esc` membersihkan seleksi.
- Seleksi multi-bar: ring/tint hijau + badge ✓ (khusus layar; dinetralkan di print + dibersihkan sebelum export).

### 6.2 Chord & Nashville

- Chord huruf: bold 850/900, root + quality + aksidental serif + bass slash (`D/F♯`).
- Nashville: digit + dot oktaf (CSS circle; high di atas, low di bawah) + slash coret:
  - Naik = `/` (miring naik ke kanan), turun = `\` (miring turun ke kanan).
  - Tebal mengikuti stem, sedikit lebih panjang dari digit, absolute (nol lebar).
  - Nilai ♯/♭ asli tetap di DOM (`.nashville-sign` hidden) untuk seleksi & screen reader.
- Kualitas berwarna tidak membanjiri daftar angka polos (keluarga `1m/maj7/sus2` hanya via ketik/palet).
- `0` = rest (simbol khusus, bisu).

### 6.3 Rhythm beams & fermata

- Beam ½/⅓/¼ digambar di bawah/di atas notasi dengan gap `--print-beam-gap/top`; klik area diperlebar tanpa menabrak chord-row (gap cadangan di bawah row).
- Fermata: glyph di atas chord/angka; playback-only (tidak mengubah layout selain glyph).

### 6.4 Chord-row di atas angka

- Layar: grid rapi satu lebar `--chord-above-w`; pitch ketuk = pitch normal + delta `CHORD_ABOVE_LEAF_EXTRA`; baris yang tak muat scroll horizontal (tidak memampatkan ketuk).
- Cetak: zero-height grid track + sel offset relatif; tinggi baris + headroom `--print-chord-above-line-gap`; subdivisi tercetak sebagai satu grid (`max-content` + `space-around`) agar angka tetap di tengah chordnya walau chord panjang.
- Bar OFF di section ON: tinggi kosong dipertahankan agar barline sejajar; section OFF: tanpa strip sama sekali.

### 6.5 Lirik & transpose inline

- Field lirik di bawah tiap ketuk (`.lyrics-input`); toggle lagu + section; paste distribusi kata.
- Inline edit: title/artist/key/meter bisa diklik di preview (input muncul di tempat); transpose −/+ di samping key.

---

## 7. Desain ChordPro Workspace

- Layout: `.cp-workspace` grid `330–40% | 1fr`, gap `18px`, align start; ≤980px satu kolom; print block.
- Kiri (`.cp-editor`): head (title + created-by inputs), tools (Transpose −/+, Key select, Time select; Undo/Redo memakai kontrol history global di topbar), daftar `.cp-sections` (satu textarea polos per section + reorder/delete), foot (`＋ Add section` + hint `[brackets] {sov} {soc} {eoc}`). Panel kiri mengikuti chrome editor (`--editor-*`: surface, border 1px, radius 16, tanpa shadow; label 11px sentence case; input radius 8). Semua perubahan panel dibungkus `@media screen` di blok `CHORDPRO EDITOR PANEL`; kertas `.cp-card`, geometri stage, dan aturan print tidak disentuh.
- Kanan (`.cp-stage`): bar (`LIVE PREVIEW` + `Exported to PDF exactly like this`) + scroll + `.cp-card#cpPreviewCard`: head (title + `Created by:` + KEY/TIME), rule, `.cp-score`, signature.
- Render teks: chord inline di atas suku kata (tanpa menabrak lirik); run chord-only diberi trailing padding; whitespace antar bracket dipertahankan; `{soc}` jadi header; `{c:}` jadi komentar; `[Verse 1]` bracket-only jadi label.
- Semua class `cp-`-prefixed; aturan print self-contained dan gate mode; visual memakai aksen emas (gold) khas ChordPro agar beda rasa dari grid hijau.

---

## 8. Desain Home: My Songs & Albums

### 8.1 Login + Register page (`.login-page`, `styles/pages/auth.css`)

Halaman full-screen (bukan modal), satu elemen `#loginPage` membawa **dua
mode** — `data-auth-mode="login" | "register"` — dengan dua `.auth-view`
(`data-auth-view`) yang di-toggle `setAuthMode()` di `src/cloudUI.js`.
Dirender sejak sesi auth belum jelas (`data-authGate=pending`); `?test=` di
localhost/127.0.0.1/::1 melewatinya untuk suite otomatis. Seluruh styling di-scope
`.login-page` agar tidak pernah bocor ke app chrome.

**Layout split** (grid `1.1fr 1fr`):

- **Aside brand** (`.login-aside`) — satu-satunya momen brand: panel hijau tua
  flat `--auth-panel`, konten `.login-aside-inner` (max-width 500px agar
  headline selalu ≤2 baris):
  - Motif Nashville oversized `4♯7` (`.login-aside-motif`, Sora 700,
    `clamp(180px, 22vw, 300px)`, opacity 0.07, bleed kanan-atas) — motif
    spesifik subjek, bukan glow generik.
  - Brand lockup telanjang (logo tanpa chip/tinted square di belakangnya), headline Sora
    `Chords and numbers, ready to play.` (clamp 28–40px, `-0.02em`), tagline,
    lalu 3 poin nilai dengan **ikon stroke 18px polos warna `--auth-spark`**
    (cloud / devices / music-note) — tanpa container chip (house rule: ikon
    tidak pernah duduk di kotak tinted).
- **Main** (`.login-main`): kartu `--auth-card` radius 28px, satu layered
  shadow, padding 40px, width `min(420px, 100%)`. Kartu masuk dengan
  translateY(12px)→0 + stagger konten aside saat `.is-open`.

**Form** (sama untuk kedua mode):

- Brand lockup compact di atas form — hanya tampil di phone (panel hijau
  disembunyikan), di desktop panel sudah membawa brand.
- Login: title `Welcome back` + sub; Register: `Create your account` + sub.
- Tombol Google (`cloud-google-btn`, fill `--auth-field`, radius 14px,
  min-height 48px) dengan mark SVG inline — `setAuthBusy()` menyimpan/
  memulihkan `innerHTML` (bukan `textContent`) supaya mark tidak hilang
  setelah siklus busy↔idle.
- Divider `or` sentence-case 12px (tanpa uppercase/tracking).
- Field email + password: **borderless until focus** — fill `--auth-field`
  radius 12px, border transparan; saat fokus: fill putih + border `--green` +
  ring `--auth-ring`. Password punya toggle show/hide (`cloud-pass-toggle`,
  `aria-pressed`).
- Tombol primer (`cloud-auth-primary`) `--auth-panel`, Sora 600, teks putih
  dipaksa di kedua tema (`!important` menang melawan `.button-primary` dark);
  fokus outline `--auth-spark`.
- Error pill (`cloud-auth-error`): tanpa border, fill `--auth-danger-bg`,
  mendukung inline link (mis. "Sign in instead").
- `auth-switch` menghubungkan kedua mode (New to Spartio? / Already have an
  account?).

**Responsive:** ≤1050px aside padding menyempit, inner 340px; **≤680px aside
 disembunyikan** → satu kolom, lockup compact muncul di kartu. Print: halaman
auth disembunyikan (rule print-hide di `styles/base/print.css`).

### 8.2 Gallery (`.cloud-gallery.is-home`)

- Arah visual: **score index**, bukan dashboard. Pertanyaan layar adalah lagu atau album mana yang perlu dibuka; koleksi menjadi konten paling dominan. Warna hijau dipakai untuk aksi utama, fokus, dan penanda notasi, bukan sebagai dekorasi di setiap kartu.
- Redraw dari pola `editorial-greeting`: sapaan dan empat tile hitungan akan menunda pekerjaan utama, yaitu mencari/membuka lagu; koleksi adalah data utama dan jumlahnya dapat sangat sedikit.
- Tipografi library dan dialog menggunakan Sora yang sudah dibundel di project; teks kode seperti invite code tetap memakai mono.
- Topbar: brand Spartio, tab `My Songs | Albums` yang selalu terlihat, tombol toggle tema, profil, serta `Back to editor` bila relevan. Judul dan jumlah koleksi berada pada baris konten berikutnya. Aksi konteks: `New Song` + `Attach Link` di My Songs; `New Album` + `Join Album` di Albums.
- My Songs memakai daftar vertikal dan Albums memakai grid kartu dua kolom; keduanya **bukan carousel**. Baris lagu memuat judul/artis, versi dan mode, key/meter, serta pembaruan; klik baris membuka lagu. Thumbnail YouTube dipakai pada cover album; di indeks My Songs mode selalu tampil sebagai motif notasi dan video menjadi kolom `Video`. Aksi sekunder berada di menu `More` yang dapat diakses dengan keyboard dan sentuh.
- **Desktop index My Songs (≥1101px):** toolbar berisi search judul/artis/key, filter format (`All`, `Chord Chart`, `Numeric`, `ChordPro`), filter `With video`, dan sort (`Recently updated`, `Title A–Z`, `Artist A–Z`). Opsi `With video` memakai SVG video yang sama dengan kolom Video, diwarnai `--library-danger` agar identik dengan penanda video di baris lagu. Di bawahnya satu sheet berisi header kolom `Song / artist · Key · Meter · Arrangement · Video · Updated` dan baris 64px. Count filter dihitung dari data, dan baris hasil hanya muncul saat filter/search aktif. Tablet dan phone tetap memakai komposisi daftar yang ada.
- **Komponen index (desktop):**
  - **Search field** = surface isi saja (`--library-head`), **tanpa garis border**; fokus ditandai ring accent, bukan border.
  - **`Attach Link`** = aksi sekunder **borderless** (tanpa border, tanpa fill); hover hanya tone step.
  - **`New Song` / `New Album` / `Filter`** = aksi primer: isi `--primary-fill` `#237a50` + teks putih, sama di light dan dark.
  - **Kolom** (header dan baris memakai template yang sama): `44px | minmax(240px,1.6fr) | 96px Key | 132px Meter | minmax(180px,1fr) Arrangement | 88px Video | 120px Updated | 120px Actions`, `gap 12px`, padding baris `8px 16px` — rasio kolom mengikuti tabel Stitch.
  - **Key** = badge `--library-key-bg` + border, nilai `16px/800` di desktop (`14px/800` di tablet/phone) — besar dan tebal, mudah dipindai.
  - **Meter** = time signature di atas, tempo di bawah (vertikal): `4/4` / `68 BPM`. Tempo diambil dari field proyek `bpm` lewat ringkasan `latestBPM`; lagu yang disimpan sebelum ringkasan itu punya tempo diperbaiki satu kali dari versi terakhirnya (`backfillLatestSummary()`), jadi BPM langsung tampil tanpa menunggu penyimpanan baru.
  - **Mode** = satu komponen `mode-tile` (28×28, radius 6, border 1px, tint per mode) yang dipakai **baris lagu DAN daftar filter**, jadi simbolnya identik di kedua tempat: music note stroke (Chord Chart), `#` filled (Numeric), lembar lirik + not filled (ChordPro). Numeric dan ChordPro memakai path Material Symbols `numbers` / `lyrics` dengan kelas `is-filled` (18px). Baris = tile hijau `#eef8f3`, Numeric = tile ungu `#f3effc`, ChordPro = tile amber `#fef7ec`; dark: Numeric `rgba(99,102,241,.22)` + `#a5b4fc`, ChordPro `rgba(245,158,11,.22)` + `#fcd34d`, Chord Chart tetap `rgba(35,122,80,.2)` + `#83c99d`. Ikon: `libraryModeIcon()` (satu helper untuk semua tempat). Baris **tidak** mengulang mode sebagai chip/badge teks; mode terbaca dari tile + `title`/`aria-label`. Daftar album memakai tile yang sama + glyph video kecil.
  - **Mode yang ditampilkan selalu milik aransemen terbaru**: ringkasan dokumen lagu (mode/key/meter/tempo) diverifikasi satu kali terhadap dokumen versi terakhirnya (`applyVersionSummary()` + penanda `latestSummaryRev`), lalu ditulis balik. Jadi lagu lama yang masih menyimpan mode keliru atau tanpa tempo tampil benar sejak kunjungan pertama.
  - **Open** = isi **secondary** (`--library-secondary` #426653 light / #3f6b55 dark) + teks putih; **`⋮`** = menu ikon.
  - **Arrangement** memakai `latestVersionLabel`; **Updated** memakai waktu relatif.
- **Toggle tema** ada di topbar sebagai tombol ikon (bulan/matahari SVG), **bukan** di dalam menu profil.
- **Index Albums (`.album-index-grid`)** — kartu album dua kolom (≥900px; satu kolom di bawahnya) mengikuti frame Stitch "Albums – Dark Theme". Kartu berisi tag peran (`MD` dengan titik lime / `Member`), **kode invite aktif hanya untuk MD** (mono, satu tombol salin yang mencakup teks kode dan ikon), nama, deskripsi (clamp 2 baris), preview hingga tiga aransemen terbaru (`+N more`) dengan nilai key (`(C)`) **bold + `--library-accent` hijau**, lalu baris `N songs · N members · Updated …` dan aksi `Open album →`. Klik kartu membuka album; klik tombol kode menyalin kode tanpa membuka album. Aksi sekunder MD (`Edit details`, `Delete album`) ada di menu `⋮`.
- **Toolbar album** memuat search, filter peran tersegmentasi (`All` / `Managed by me` / `Joined`, dengan count dari seluruh daftar) dan sort (`Recently updated`, `Title A–Z`). Di phone sort disembunyikan dan filter tetap satu baris; kontrol pertama (search) full width.
- **Data kartu dibaca bertahap**: `songCount`/`updatedAt`/`role` datang dari ringkasan album, sedangkan preview aransemen (`limit(3)`, tanpa backfill) dan jumlah member (`count()`) dibaca lazily per kartu yang terlihat lewat `IntersectionObserver` dan di-cache 60 detik. Kegagalan salah satunya hanya menghilangkan bagian itu — kartu tetap utuh.
- Baris album tetap memuat nama, deskripsi, jumlah lagu, pembaruan, serta peran MD/Member. `Edit details` dan hapus hanya tersedia bagi MD. Album detail memakai daftar lagu yang sama; member tetap read-only sesuai aturan produk.
- Hook musik: underline tab tumbuh mengikuti pilihan, simbol mode merespons hover/fokus. Gerak singkat, tanpa entrance; `prefers-reduced-motion` mematikannya.
- Search, state loading, empty, no-results, dan error tetap berada pada panel yang sama. State error menyediakan `Try again`; skeleton mempertahankan tinggi baris dan tidak memakai shimmer. Baris My Songs dan album detail memakai kelas baris asli (`song-card.is-index-row` + `library-skeleton-row`), kartu Albums memakai frame kartu (`skeleton-card.is-album`), dan halaman editor memakai lembar kertas `#editorSkeleton` yang meniru header, rule, dan irama section. Semua placeholder memakai token `--library-skeleton` / `--editor-skeleton` (flat tone, tanpa gradient). Selama fetch dingin, skeleton tetap menjadi state dominan meskipun user mengetik search atau mengganti filter; filter diterapkan setelah data tiba. Tab Albums memulai fetch songs dan albums bersamaan agar skeleton albums tidak menunggu daftar songs. Di editor, lembar skeleton juga dipakai saat dokumen aktif bermode ChordPro (workspace ChordPro lama disembunyikan) dan memakai frame serta `--live-preview-zoom` yang sama dengan `#previewCard`.
- Profil menampilkan identitas akun, tema, dan `Sign out`. Sign out tetap meminta konfirmasi; kegagalan menampilkan feedback.
- Popup `New Song` meminta nama aransemen, lalu pilihan mode dengan preview notasi statis dan aksi konfirmasi eksplisit. `Attach Link` memiliki label input, preview, dan penjelasan bahwa payload diproses lokal. `Add from My Songs` menyediakan pencarian, pilihan radio, loading, empty, no-results, dan error state.

### 8.3 Album detail (`.cloud-album`)

- **Topbar aplikasi** setinggi 56px: `← Back to Albums` di kiri, tab `My Songs | Albums` di tengah (Albums aktif), dan profile button di kanan. Profile memakai instance menu sendiri (`#albumAccountBtn`) dengan identitas Auth + Sign out yang sama seperti topbar library. Di phone topbar menjadi dua baris: back + profile, lalu tab. Back button dan tab tetap di luar area scroll; isi album (summary, toolbar, daftar) scroll di bawahnya. Topbar dan isi memakai lebar `min(1360px, 100%)` dengan gutter 32px (16px di phone) agar tepi kiri/kanan satu garis.
- **Summary card** (`.album-detail-summary`): monogram album, eyebrow `ALBUM · Updated …`, judul Sora 28px (22px di phone), deskripsi (clamp 3 baris di phone), dan `Created …`. Tidak memakai cover palsu.
- **Chips**: role (`Music Director (MD)` dengan dot accent / `Member (read-only)`), jumlah member, dan kode invite hanya untuk MD. Chip kode invite memuat tombol **manage** (membuka dialog rotate/lihat kode) dan tombol **copy**; tidak ada tombol `Invite` terpisah di kolom aksi. Angka member dibaca lazy lewat `countAlbumMembers()`; kegagalan hanya menyisakan label `Members`, tidak memblokir album.
- **Aksi** di kolom kanan (360px) berupa **grid 2×2**: baris pertama `New Song` + `Add from My Songs`, baris kedua `Leave` selebar dua kolom. `New Song` satu-satunya fill primary; `Add from My Songs` memakai outline hijau + label/ikon hijau; `Leave` danger outline. Tidak ada tombol `Invite` terpisah — invite dikelola dari chip kode. Aksi owner disembunyikan untuk member; member melihat catatan read-only yang menjelaskan play/transpose/export/save-copy, lalu `Leave` selebar penuh. Catatan tidak ditampilkan di phone (role chip sudah menyatakan read-only), dan grup member dipusatkan vertikal agar kolom tidak menyisakan lubang.
- **Toolbar daftar**: filter pill `All / Chord Chart / Numeric / ChordPro` dengan ikon dan warna mode yang sama seperti tile baris (Chord Chart hijau, Numeric ungu, ChordPro amber; ikon berubah putih saat pill aktif), count dari **seluruh** album (bukan hasil search), lalu search dengan ikon kaca pembesar yang mencakup judul, artis, key, meter, BPM, mode, dan label versi. Count dihitung dari data nyata; pill aktif memakai `--library-primary`. Di phone pill tetap satu baris dan dapat discroll; search full width.
- **Daftar lagu memakai indeks My Songs**, bukan bahasa kartu baru: `.library-table-head.album-detail-tablehead` (di luar sheet, direct child area scroll) + `.library-sheet` + baris `.song-card.is-index-row` (mode tile, Song / artist, Key, Meter, Arrangement, Video, Updated, aksi). Header kolom **sticky** dan menempel langsung di bawah app bar selama baris digulir. Selector memakai scope album agar `top` dari `.library-table-head` generik tidak menimpanya. Baris membuka aransemen; `Open` hanya tampil di desktop, `⋮` memuat aksi sekunder. Menu MD: `Open in editor`, `Export PDF`, `Remove from album`; menu member: `Open arrangement`, `Export PDF`, `Save a copy`. Tidak ada drag handle, nomor urut, quick transpose, bottom setlist bar, atau baris CTA tambah lagu — urutan tetap `updatedAt`.
- **State**: loading, empty, no-results (dengan `Clear filters`), dan error (dengan `Try again`) berada di dalam sheet yang sama. State tetap mempertahankan frame; tombol state harus `pointer-events: auto` meski shell state memakai `pointer-events: none`.
- **Angka dan waktu**: jumlah lagu berasal dari daftar yang benar-benar dimuat; `Updated` memakai waktu relatif yang sama dengan My Songs; `Created` memakai tanggal album. Meta summary menampilkan `N songs · Created …`. Tidak ada `updated by` karena dokumen lagu tidak menyimpan field tersebut.
- **Dialog album** memakai chrome library yang sama: `Add from My Songs` menampilkan header berikon, search dengan kaca pembesar, dan baris pilihan dengan mode tile + artis/versi/key/meter/BPM + radio; `Members` menampilkan header berikon, daftar baris dengan inisial, nama + marker MD, email, dan kontrol `⋮`; action sheet member memakai kartu library yang sama. Tidak ada emoji sebagai ikon atau glyph close teks — semuanya inline SVG.
- **Responsif**: ≥1101px memakai tabel penuh (template kolom My Songs; versi 1101–1220px dirapatkan agar tidak scroll horizontal). 681–1100px memakai baris ringkas tanpa header tabel; ≤680px baris dua tingkat dengan mode tile, metadata, dan `⋮` 44px. Aksi summary tetap grid 2×2 di semua lebar (full-width di bawah summary); member hanya mendapat `Leave` selebar penuh.

---

## 9. Dark Theme

- Saklar: `localStorage chordSheetTheme` (light/dark) else `prefers-color-scheme`; `documentElement.dataset.theme + style.colorScheme`; toggle berada di **topbar** sebagai tombol ikon SVG (bulan di light, matahari di dark, `aria-pressed`), bukan di dalam menu profil.
- **Isi aksi primer tidak berubah di dark**: `#237a50` + teks putih (lihat §2.1). Yang dibalik hanya aksen mint (`#83c99d`) untuk focus ring/garis aktif, tombol `Open` pada baris library (isi secondary `#3f6b55` + teks putih), dan surface/ink umum.
- `html[data-theme="dark"]` menulis ulang: body, topbar, tombol ghost/icon, kartu editor, panel/popover, input/select/lyrics, section title, dialog, how-to code, `cp-card`, preview help, dsb.
- Print tidak ikut dark: aturan gelap di-scope layar (`:not(.is-print-layout)` pada bagian yang perlu) + blok print memaksa tinta kertas (`--print-bar-num-ink` dkk) agar PDF tetap hitam di atas putih.

---

## 10. Responsif

| Band | Desain existing |
|---|---|
| Phone ≤680px | Topbar editor dua baris (baris aksi boleh wrap ke baris ketiga di layar sangat sempit); tab My Songs/Albums tetap terlihat di home; aksi konteks dekat judul; daftar dua baris per item tanpa scroll horizontal paksa; target sentuh ≥44px; panel alat legacy tidak tampil; modal device-hint sekali per kunjungan |
| Tablet 681–1050px | Sheet fit pane (`min-width: min(820px,100%)`); metadata daftar diringkas per baris; tab home dan profil tetap di topbar; aksi album membungkus tanpa menutupi judul; ChordPro satu kolom di bawah 980px; tidak ada panel alat kiri |
| Desktop ≥1051px | Sheet lebar kertas `min-width: 920px` + scroll horizontal; hover expand kartu; `⋮ Manage` pada baris member |

Kontrak: semua aturan responsif di-scope `@media screen` / band lebar; geometri print tak tersentuh (dipin unit test).

---

## 11. Print / PDF Layout

Tiga scope yang disengaja identik:

1. `@media print` — output nyata (Cmd+P / Export PDF).
2. `html.is-print-layout` — preview layout PDF di layar (dinyalakan saat dialog PDF dibuka).
3. Pane live di dialog PDF — menampung node kartu asli (bukan klon), aturannya hanya menyembunyikan nomor bar layar `10px`.

Aturan:

- Kertas A4, margin narrow; padding kartu, margin judul, baris KEY/TIME, box label section sama untuk grid & ChordPro (label preview sejajar kolom konten).
- Zoom pane live preview dihitung dari **satu halaman fisik** (`computePreviewScale()`): `min(fitWidth, fitHeightOnePage)`. Jumlah halaman hanya menambah tinggi kertas/scroll, tidak mengubah persentase zoom. Jadi chord size / beat spacing / lyric size tidak membuat label zoom meloncat (mis. 54% → 98%); zoom hanya berubah saat pane/window berubah ukuran.
- Baris section tanpa gap vertikal (`row-gap: 0`) → default nomor bar `Line starts` (satu angka bold 3mm per baris, di atas barline, inset 1.3mm, turun 3.5mm dari tepi + clearance 0.5mm) agar tidak terbaca sebagai bagian baris atas. `Every bar` = 2.6mm tiap barline. `Off` = tanpa band cadangan (geometri dasar utuh).
- Barline dikunci ke notasi via `top: calc(50% + (extra-top − extra-bottom)/2)`; band cadangan hanya di baris yang dihitung (`markMidRowBars()` menandai `.pdf-mid-bar`).
- `1/4`: bar line dihapus di antara ketuk (ketiga scope) dan hanya digambar di dua ujung baris — baris editor pakai `:first-child` / `:last-child` dari `.bar-batch`, baris cetak pakai tag `pdf-row-start` / `pdf-row-end` dari `src/pdf/pdf.js`; padding bar dikosongkan dan indent 2.6mm pindah ke baris (`--print-row-pad-x`) supaya beat-nya duduk di beat pitch normal, dan nomor bar tidak dicetak.
- Chord-row & beams & lirik mengikuti token §2.3; seleksi, toast, footer, banner, affordance scroll disembunyikan.
- Detektor stylesheet basi: `--chordpro-css-version` vs `CHORDPRO_CSS_VERSION` di `render.js`.

---

## 12. Motion & Interaksi

- Hover chrome editor: tone/border step tanpa `translateY`; transisi `.16s`; kartu hover expand (galeri); beat hover dot/outline; akor hover tint (layar saja).
- Save state machine: `is-unsaved` (dot amber berdenyut) → `is-saving` → `is-saved` (~1,6 detik, ikon ✓ + tone mengendap). Hanya menambah class; `prefers-reduced-motion` mematikan denyut.
- Kartu mode di New Song memakai animasi masuk singkat untuk token chord/angka dan sapuan garis ChordPro. Animasi dipicu sekali oleh `.is-open`, memakai aksen mode, dan tidak berjalan terus-menerus.
- Dialog baru memakai gerak kecil yang mendukung fungsi: ikon header masuk saat dialog dibuka, langkah Attach Link muncul berurutan, baris member masuk bertahap, dan spinner hanya saat daftar member dimuat.
- Toast + `drop-success` 450ms + purge-reload sekali + `skipWaiting/clients.claim` (PWA update).
- Debounce: ketik ChordPro = satu langkah undo per burst; search gallery live filter.
- Dialog: backdrop blur, kartu tengah, `Esc`/backdrop dismiss (kecuali login page); fokus ke input pertama (nama versi, kode invite) atau tombol aksi saat daftar member terbuka.

---

## 13. Ikon, Aset & PWA

- **Brand mark / app icon** (`assets/logo-mark.svg` + `logo-mark.png` 512px):
  app icon dari frame Stitch `new-logo-fixed` — tile squircle charcoal
  `#121713` dengan rim `#242e26`, glyph not balok + dua arc broadcast mint
  `#8cd5a7` (sudut transparan di luar tile). Dipakai brand lockup (footer,
  login, galeri); tab browser memakai `favicon.svg` + `favicon-32/64.png`
  dengan varian optik: rim dibuang dan glyph 1.18× agar terbaca di 16–32px.
- **PWA icons** (`icon-192/512/1024.png`, `purpose: any`): turunan langsung
  dari tile transparan. **Maskable** (`icon-maskable-512/1024.png`):
  full-bleed persegi tanpa rim, glyph tetap di dalam safe zone 80%.
  `apple-touch-icon.png` 180px juga full-bleed (iOS menerapkan mask sendiri).
- **Sumber & regenerasi**: sumber kebenaran berupa SVG parametrik
  (`assets/logo-mark.svg`), bukan raster. Semua PNG dirender dari SVG pada
  1024px lalu diturunkan dengan Lanczos ke ukuran target — tidak ada upscale.
  `favicon.svg` memakai varian optik yang sama dengan PNG favicon.
- Manifest `theme_color: #121711` (senada tile ikon) + `background_color:
  #0f1110`, `name: Spartio.app — Chord & Number Score Builder`,
  `short_name: Spartio.app`, `display: standalone`, `orientation: any`,
  kategori `music/productivity/utilities`, `lang: en`. `<meta name="theme-color">`
  di index.html senada.
- Semua path aset relatif (aman di subpath `/spartio-app/`); `.nojekyll` untuk fallback branch. Filename ikon stabil antar build → `sw.js` precache tidak perlu diubah saat regenerasi ikon.
- **Ikon chrome editor:** semua kontrol topbar, dialog, popover, banner, dan how-to memakai inline SVG stroke (`viewBox 0 0 24 24`, `stroke="currentColor"`, `stroke-width="2"`, 15–22px) di dalam `.btn-icon` / `.icon-glyph`; pola yang sama dipakai tombol album di home. Emoji tidak dipakai sebagai ikon UI. Glyph notasi asli (`♯ ♭ ▶ 1̇`) tetap dipertahankan karena bagian dari bahasa musik, bukan ornamen.
- Set glyph yang masih dipakai sebagai teks/simbol notasi: `♭ ♯ ♮ ▶ − + × ⌘` (contoh di hint dan score). Mode badge tidak lagi memakai glyph teks; ia memakai SVG bersama dari `notation.js`. Di luar itu chrome memakai SVG.

---

## 14. Aksesibilitas

- Peran & label: `role=dialog aria-modal`, `role=tab/tabpanel/menu/menuitemradio`, `aria-pressed/selected/expanded/checked`, `aria-live=polite` (toast, banner, placing), `aria-label` viewport & kontrol ikon.
- Keyboard: `⌘Z/Ctrl+Z`, `⌘⇧Z/Ctrl+Shift+Z`; Enter/Shift+Enter lirik; Tab antar sel chord; Esc batal; `?test=` (local-only) melewati auth gate untuk suite. Shortcut Alt+1…5 milik ribbon legacy tidak lagi menjadi kontrol UI.
- Kontras belum diaudit menyeluruh. Pasangan `--muted` (`#69756f`) pada `--cream` (`#fcfbf5`) terukur 4.63:1 dan pada putih 4.80:1 untuk teks normal. Ini belum memverifikasi teks ber-opacity, warna campuran, warna lokal, atau semua state tema. Pasangan lain di atas tetap deskripsi palet, bukan bukti lulus WCAG.
- Gerak: `prefers-reduced-motion` menonaktifkan animasi kartu mode, entrance topik How-to, langkah Attach Link, baris member, dan ikon dialog. Teks serta kontrol tetap tampil tanpa animasi.
- Screen reader: nilai ♯/♭ tetap di DOM tersembunyi; dot oktaf + slash coret adalah visual (nilaiEditable tetap terbaca sebagai `♭1̇` dsb).

---

## 15. Konvensi & Batasan Desain

1. Jangan pakai nama class non-`cp-` di workspace ChordPro (geometri print grid tidak id-scoped).
2. Jangan tambah lebar pada token Nashville (slash harus absolute) — pengukuran PDF mengandalkan lebar render.
3. Setiap overlay chrome baru wajib masuk blok print-hide `styles/base/print.css` (preseden: `.album-banner`, `.scroll-affordance`, `.site-footer`, `.toast`, ring seleksi).
4. Jangan ubah fallback inline ChordPro di `index.html` tanpa mengubah juga `render.js` (keduanya redundan disengaja).
5. Token versi (`__BUILD__`, `--chordpro-css-version`) wajib ikut injeksi deploy; file baru tanpa placeholder harus ditangani agar tak lolos sebagai aset unversioned.
6. Perubahan ejaan transpose / alias kualitas harus lewat `spellPitch` / `normalizeQuality` (sumber tunggal) agar popover, skor, dan audio tidak bercabang.
7. Member readonly memakai 3 lapis (dataset + handler + CSS); kontrol mutasi baru di luar preview harus ditambah ke selector `body[data-member-readonly="1"]`.
8. Jangan menyebut kontras atau aksesibilitas sebagai telah memenuhi WCAG berdasarkan inspeksi visual saja. Uji rasio warna dan alur keyboard pada komponen yang terdampak.
9. Mark mode SVG (`.mode-mark.is-*`) memakai token `--mode-*` dan harus menang atas warna generik daftar. Jangan menimpa `color` pada `.song-card-mode-mark` tanpa selector `:not(.mode-mark)`; warna `--library-accent` hanya untuk fallback teks lama.

---

## 16. Acuan Stitch: Design System & Frame

Design system **Framed Notation Studio** berada di project Stitch `spartio.app-fixed` (`projects/2718728460661214511`, asset `assets/0d537f7dfca143458b6f1b743258196b`). Di canvas, ini adalah design-system instance, bukan screen. Dokumen DESIGN.md yang di-upload ke Stitch adalah snapshot 21 Oktober 2026; snapshot itu masih memuat brand icon lama sehingga §13 repo yang berlaku.

| Frame | Status | Catatan |
|---|---|---|
| `Editor - Goodness of God (Chord Chart)` | Sebagian selaras | Topbar, chip, save/export, section header, dan sheet sudah dekat. Bar card `m.N`, strip `LIVE PREVIEW` dengan playback, Quick Deck, `FLOW`, dan page count masih konsep. |
| `Editor - Inline Score Sheet (Decluttered)` | Arah selaras | Sama-sama tanpa panel alat kiri; floating bottom toolbar, insert-section CTA, dan bar card belum diimplementasi. |
| `My Songs` / `Albums` / `Album Detail` (desktop, dark, phone, tablet) | Referensi visual | Tabel/daftar, pencarian, filter, dan state-nya menjadi acuan; `Albums` kini memakai kartu dua kolom (tag peran, kode invite MD, preview aransemen, jumlah member) sesuai frame, sedangkan `My Songs` memakai tabel index. Implementasi `library-redesign` di `cloudUI.js` + `styles/components/library.css` / `styles/components/library-desktop.css` tetap sumber kebenaran. |
| `DESIGN.md` (screen) | Snapshot lama | Jangan disalin ke §13; brand icon sudah berubah. |
| `new-logo-fixed` (frame) | Sumber brand | App icon charcoal + glyph mint; diimplementasi sebagai `assets/logo-mark.svg` (sumber) + `logo-mark.png` dan turunan PWA. |

Aturan: frame berstatus konsep bukan spesifikasi sampai fitur benar-benar ada di kode, paritas print diuji, dan dokumen ini diperbarui. Design system Stitch boleh menjadi acuan token/arah, tetapi nilai yang berbeda dicatat di §2.6 dan tidak boleh menggantikan nilai aktif tanpa perubahan kode.

---

## Lampiran — Peta File Desain

| File | Isi desain |
|---|---|
| `styles/base/tokens.css` (1 baris, minified) | Tokens inti + shell dasar (topbar 76px, workspace grid, kartu, tombol dasar). Catatan: file ini network-first (tanpa `?v=`) |
| `styles/layout/shell.css` | Shell app, ribbon, canvas, dialog dasar, footer; ribbon legacy disembunyikan (`.editor-card { display:none }`) |
| `styles/layout/responsive.css` | Aturan responsif berbasis lebar, dimuat setelah shell.css |
| `styles/components/editor.css` | Popover chord, beat menu, fermata, mode picker, PDF options |
| `styles/components/editor-chrome.css` | Blok `EDITOR CHROME REFRESH` (token `--editor-*`, screen-only): framed sheet, topbar, dialog, dark, phone |
| `styles/components/gallery.css` | Auth gate, cloud modal, account/version switcher, My Songs gallery, lobby cards, dan home FAB |
| `styles/components/album.css` | Albums index, album detail, member UI, invite dan add-song dialogs |
| `styles/components/library.css` | Library skeleton, row My Songs/album, kartu album, editor paper saat memuat |
| `styles/components/library-desktop.css` | Desktop index My Songs (Stitch-inspired) + dialog-nya, dimuat setelah library.css |
| `styles/themes/dark.css` | Token dan override dark theme global |
| `styles/base/print.css` | Print-hide dan aturan cetak, dimuat setelah sheet layar |
| `styles/score/preview.css` | Score canvas layar: beat, beam, Nashville, chord-row, bar numbers; juga `.ribbon-workspace { display:block }` yang membuat sheet full-width |
| `styles/score/preview-print.css` | Paritas cetak: `@media print` + `html.is-print-layout` (geometri print/PDF), dimuat setelah preview.css |
| `styles/score/chordpro.css` | Workspace ChordPro + print-nya, self-contained |
| `styles/pages/auth.css` | Login + Register (`--auth-*`, split panel, borderless fields), semua di-scope `.login-page` |
| `styles/base/fonts.css` | Inter variable + subset Noto Serif JP ♭/♯ + Sora variable (display auth) |
| `index.html` `<style>` inline | Fallback struktural ChordPro (anti-404/cache basi) |
| `assets/logo-mark.svg`, `favicon.svg`, `logo-mark.png`, `favicon-*.png`, `icon-*.png`, `apple-touch-icon.png` | Brand + PWA icons (frame Stitch `new-logo-fixed`: tile charcoal + not balok/arc mint; SVG = sumber, PNG = turunan) |
| `assets/fonts/*.woff2` + `*-LICENSE.txt` | Inter latin + Sora latin + Noto JP accidentals (OFL 1.1) |
| `manifest.webmanifest` | Nama, display standalone, kategori, ikon |

---

*Dokumen ini hanya memotret desain existing. Setiap perubahan visual harus memperbarui file styles terkait + (bila memengaruhi kertas) blok `print`/`is-print-layout` + dialog preview agar ketiganya tetap identik.*
