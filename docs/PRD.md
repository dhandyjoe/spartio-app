# PRD — Spartio.app (Chord & Number Score Builder)

> **Status dokumen:** As-Is (mendokumentasikan kondisi existing, bukan usulan fitur baru).
> **Versi:** 1.6 — 2026-10-21 (time signature `1/4`: satu bar kontinu tanpa bar line)
> **Bahasa:** Bahasa Indonesia.
> **Sumber riset:** `README.md`, `index.html`, `src/*`, `styles/*`, `docs/ALBUM-FEATURE.md`, `docs/FIREBASE-SETUP.md`, `docs/DESIGN.md`, `sw.js`, `manifest.webmanifest`, `tests/*`, `.github/workflows/deploy.yml`.
> **Live demo (tercatat di README):** https://dhandyjoe.github.io/spartio-app/

## Riwayat Perubahan

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | (awal) | Baseline As-Is: FR-01…FR-10, model data, NFR |
| 1.1 | 2026-10-16 | Metadata versi, prioritas + status per FR, analisa kompetitor (§2.1), metrik terukur (§14), tabel mitigasi risiko (§15), roadmap (§17) |
| 1.2 | 2026-10-19 | Koreksi fakta terverifikasi vs kode (guard `blockedForEdit()` 40 call sites, 17 nama kunci, aturan meter phone, daftar dialog); dokumentasi fitur: half-step Nashville, fermata per-beat (`MAX_FERMATA=32`), kunci kertas A4, nested ½-beam; model data diperluas (`projectData()`, `latestYoutubeId/Key/Meter` personal); mekanik `share.js`/`sampleCache.js`; rujukan `docs/DESIGN.md` |
| 1.3 | 2026-10-20 | Koreksi konflik phone dan auth; klarifikasi owner terakhir dan batas jaminan client-side; ubah §14 menjadi verifikasi baseline; catatan sumber dan keterbatasan aksesibilitas; rapikan struktur repo dan kebijakan pembaruan dokumen |
| 1.4 | 2026-10-20 | Redesign library menjadi daftar berorientasi pencarian; tab tetap terlihat di ponsel; perbarui interaksi New Song, Attach Link, Add from My Songs, profil, dan Sign out tanpa mengubah model akses atau data cloud |
| 1.5 | 2026-10-21 | Tambah time signature `1/4` (satu ketuk per bar) untuk bar pickup / satu chord per bar; live preview dan PDF memakai geometri bar yang sama |
| 1.6 | 2026-10-21 | `1/4` digambar sebagai SATU bar kontinu: tanpa bar line di antara ketuk, garis tetap di awal & akhir baris (live preview + PDF), beat memakai beat pitch normal, nomor bar disembunyikan, dan editor memakai kosakata "beat" (tambah/hapus/salin) |

Catatan audit: rujukan pada roadmap §17, metrik §14, dan prioritas/status per FR di entri versi 1.1 tidak menggambarkan isi dokumen versi 1.3. Bagian tersebut bukan kriteria aktif pada baseline ini.

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Tujuan & Non-Tujuan](#3-tujuan--non-tujuan)
4. [Pengguna & Persona](#4-pengguna--persona)
5. [Gambaran Produk (As-Is)](#5-gambaran-produk-as-is)
6. [Arsitektur & Teknologi (As-Is)](#6-arsitektur--teknologi-as-is)
7. [Tiga Mode Penulisan](#7-tiga-mode-penulisan)
8. [Persyaratan Fungsional (FR)](#8-persyaratan-fungsional-fr)
9. [Alur Pengguna Utama](#9-alur-pengguna-utama)
10. [Model Data (As-Is)](#10-model-data-as-is)
11. [Keamanan, Peran & Privasi (As-Is)](#11-keamanan-peran--privasi-as-is)
12. [Persyaratan Non-Fungsional (NFR)](#12-persyaratan-non-fungsional-nfr)
13. [Batasan, Aturan & Asumsi (As-Is)](#13-batasan-aturan--asumsi-as-is)
14. [Verifikasi Baseline (As-Is)](#14-verifikasi-baseline-as-is)
15. [Risiko & Catatan Teknis](#15-risiko--catatan-teknis)
16. [Glosarium](#16-glosarium)
17. [Lampiran A — Peta File](#lampiran-a--peta-file)
18. [Lampiran B — Referensi Internal](#lampiran-b--referensi-internal)

---

## 1. Ringkasan Eksekutif

Spartio.app adalah aplikasi web statis (PWA, tanpa build-step saat development) untuk menyusun partitur chord dan notasi angka (Nashville Number System + konvensi not-angka Indonesia), memutarnya sebagai audio piano, dan mengekspornya ke PDF siap cetak.

Kondisi existing:

- Tiga mode penulisan per aransemen/versi: **Chord Chart** (grid ketuk + chord), **Numeric Notation + Lyrics** (derajat 1–7 + oktaf atas/bawah + kres/mol setengah langkah + lirik), **ChordPro** (lirik + chord `[bracket]`, tanpa notasi ritme).
- Editor lengkap: palet chord, slash-chord builder, custom chord, Nashville builder (termasuk setengah langkah "naik ½ / turun ½"), subdivisi ritme ½/⅓/¼ (nested 2 level), fermata per-beat (playback-only), lirik per-ketuk, chord-row di atas angka (per-section), transpose per semitone yang sadar kunci (tajam vs mol).
- Playback instrumen: chord dibunyikan sebagai harmoni piano, angka Nashville sebagai nada tunggal; beat yang punya angka + chord berbunyi bersamaan (melodi 1 oktaf di atas + harmoni di bawah); metronome opsional; BPM disimpan per lagu.
- Manajemen lagu berbasis cloud opsional (Firebase Auth + Firestore): **My Songs**, **Versions** (satu lagu bisa punya banyak aransemen, tiap versi punya mode + link YouTube + start time sendiri), **Share & Import via Link**, **Albums** (album bersama dengan invite-code, peran MD/owner vs member read-only).
- Export PDF A4 dengan live preview (kertas terkunci A4 + margin narrow), preset ukuran + slider, nomor bar (Chord Chart only), serta penyimpanan file lokal `.chordsheet.json`.
- PWA offline dengan service worker (`sw.js`), deploy otomatis ke GitHub Pages via GitHub Actions, versioning otomatis `__BUILD__`.

Dokumen ini membekukan pemahaman tersebut sebagai baseline produk. Tidak ada fitur baru yang diusulkan di sini.

---

## 2. Latar Belakang & Masalah

Musisi worship/tim gereja (contoh pengguna yang disebut di docs: GKJ Nehemia) membutuhkan:

1. Cara cepat menulis aransemen yang bisa dibaca pemain dengan latar berbeda (ada yang baca chord huruf `C-Am-F-G`, ada yang baca angka `1-6m-4-5`).
2. Cara mendengar kasar aransemen sebelum latihan (butuh playback, bukan sekadar teks).
3. Cara mencetak partitur yang rapi dan konsisten (PDF A4, ukuran bisa diatur, nomor bar untuk arahan latihan "dari bar 9").
4. Cara berbagi aransemen ke satu tim tanpa file berceceran (cloud library + album bersama, tiap orang pakai akun sendiri).
5. Cara kerja offline/di HP/tablet/laptop dengan perilaku yang dapat diprediksi.

Masalah yang sudah dijawab oleh kondisi existing:

| Masalah | Jawaban existing |
|---|---|
| Beda kebiasaan baca (huruf vs angka) | 3 mode + chord-row di atas angka (melodi + harmoni satu baris) |
| Salah baca hasil transpose (`F♯` vs `G♭`) | Aturan ejaan transpose mengikuti kunci target (lihat §13) |
| Not-angka setengah langkah ambigu | `♯/♭` ditulis sebagai coret `/` (naik) dan `\` (turun) sesuai konvensi Indonesia, playback ikut |
| Aransemen banyak versi (Pop/Rock/Latin) berceceran | Satu lagu menampung N versi, tiap versi punya mode + YouTube sendiri |
| Berbagi ke tim tidak terkontrol | Albums dengan invite-code + peran MD vs member |
| Hasil cetak beda dengan preview | PDF options dialog menampung node preview asli + layout preview `is-print-layout` |
| Deploy menimpa cache lama | Versioning otomatis + purge-on-refresh + network-first shell |

### 2.1 Analisa Kompetitor (konteks positioning)

Tabel ini adalah hipotesis positioning internal, bukan riset pasar yang telah diverifikasi. Klaim harga, cakupan platform, dan fitur kompetitor perlu diberi sumber serta tanggal pemeriksaan sebelum dipakai untuk keputusan produk atau materi publik.

| Produk | Kelebihan | Kekurangan | Pembeda Spartio |
|---|---|---|---|
| OnSong | Mature, fitur lengkap, integrasi pedal | Berbayar, iOS-only | Gratis, web-based, jalan di semua perangkat |
| Planning Center | Kolaborasi tim kuat, scheduling | Mahal, kompleks untuk tim kecil | Sederhana, fokus tulis chord/angka, gratis |
| SongSelect (CCLI) | Library lagu besar resmi | Berbayar, tidak bisa custom aransemen bebas | Aransemen custom penuh + not-angka Indonesia |
| Ultimate Guitar (Chords) | Library besar, chord diagram | Bukan alat tulis, tidak ada not-angka/Nashville | Editor aransemen + playback + PDF |
| Google Docs / teks biasa | Gratis, familiar | Tidak ada transpose/playback/cetak rapi | Transpose sadar kunci, playback piano, PDF A4 |

Hipotesis positioning: Spartio berfokus pada alat tulis aransemen berbasis web dengan konvensi not-angka Indonesia dan Nashville. Klaim bahwa celah ini tidak dilayani produk lain perlu divalidasi dengan riset bersumber.

---

## 3. Tujuan & Non-Tujuan

### 3.1 Tujuan produk (tercermin dari implementasi existing)

- T1. Pengguna dapat menulis partitur chord/angka/lirik sampai selesai tanpa akun (editor berfungsi penuh tanpa login).
- T2. Pengguna dapat mendengar partitur (piano + metronome) sesuai tempo lagu.
- T3. Pengguna dapat mengekspor PDF yang sama persis dengan preview.
- T4. Pengguna login dapat menyimpan, membuka kembali, menggandakan, dan membagikan lagu.
- T5. Tim dapat berkolaborasi baca-aransemen via Albums tanpa berbagi password.
- T6. Aplikasi tetap dapat dibuka offline setelah kunjungan pertama (PWA).

### 3.2 Non-tujuan (tidak ada di kondisi existing)

- Bukan DAW / editor audio / perekam.
- Bukan perpustakaan chord otomatis dari internet.
- Bukan editor notasi balok penuh.
- Tidak ada pembayaran, langganan, atau analitik produk bawaan.
- Tidak ada peran `editor` album (docs menyebut ini sebagai ekstensi masa depan tanpa migrasi data, tapi belum ada).

---

## 4. Pengguna & Persona

| Persona | Deskripsi | Kebutuhan inti (as-is) |
|---|---|---|
| **Pemain / Jemaat musik** | Bisa baca chord huruf atau angka, butuh contekan cepat | Tulis, transpose, play, cetak PDF |
| **MD — Music Director (owner album)** | Kurator aransemen tim; nama peran ini khusus untuk owner album di UI (`roleShortLabel()` menampilkan MD + marker `(MD)` tebal-miring) | Buat album, undang via kode, tambah lagu, promosikan MD lain, keluarkan anggota, buat lagu langsung di album |
| **Member album** | Musisi tim yang hanya perlu baca | Buka album read-only, ubah Key/Time/BPM/transpose untuk latihan, play, export PDF, simpan salinan privat. Di phone, pembatasan phone juga mengunci time signature. |
| **Pemula ChordPro** | Tidak mau pusing ritme/grid | Ketik lirik + `[C]` langsung jadi, transpose tetap jalan |
| **Pengguna tanpa akun** | Coba-coba / sekali pakai | Semua editor + playback + PDF tetap jalan; cloud diminta login saat dibutuhkan |

Perangkat (kontrak responsif existing):

| Band | Lebar | Perilaku existing |
|---|---|---|
| Phone | ≤ 680px | Skor view-only. Pengguna non-member tetap dapat mengubah metadata yang diizinkan, key, BPM, dan transpose; pemilihan time signature terkunci. Member album mengikuti allowlist §FR-08, ditambah pembatasan phone. Play dan export tetap tersedia. |
| Tablet | 681–1050px | Sheet auto-fit pane (tanpa scroll paksa); pane adalah `container-type: inline-size`; kontrol ≥40px pada coarse pointer; tab library dan aksi konteks tetap terlihat, tanpa FAB |
| Desktop | ≥ 1051px | Sheet lebar kertas (`min-width: 920px`) + scroll horizontal bila perlu |

---

## 5. Gambaran Produk (As-Is)

### 5.1 Struktur halaman

1. **Login page (full-screen, bukan modal dismissible):** Google sign-in + email/password. Saat load, app cek sesi auth: sudah login → langsung ke My Songs; belum → landing di sini. Login bersifat opsional untuk editor lokal; autentikasi diperlukan untuk My Songs, Albums, dan aksi cloud.
2. **My Songs (home, tab `My Songs | Albums`):**
   - Topbar brand, tab `My Songs | Albums`, menu akun (avatar/nama, theme, Sign out), dan `Back to editor` bila ada lagu terbuka. Tab tetap terlihat pada phone dan tablet.
   - Judul serta jumlah koleksi berada di bawah topbar. Aksi My Songs: `New Song` dan `Attach Link`; aksi Albums: `New Album` dan `Join Album`.
   - My Songs dan Albums memakai daftar vertikal yang dapat dicari. Baris lagu menampilkan judul/artis, versi dan mode, key/meter, serta waktu pembaruan; klik membuka lagu dan menu `More` memuat aksi sekunder. Baris album menampilkan nama/deskripsi, jumlah lagu, pembaruan, serta peran MD/Member; aksi pengelolaan hanya untuk MD.
   - Daftar memiliki state loading, empty, no-results, dan error dengan retry. Tidak ada carousel atau FAB library.
3. **Editor (sub-page dari My Songs):**
   - Topbar: `← Back`, breadcrumb `Editing + judul`, version switcher pill `⧉`, YouTube chip (dua state: ada link vs `No video`), mode badge, album pill (konteks album), grup aksi primer `Save to Cloud / Save to Album / Save a copy` + `Export .pdf`.
   - Banner read-only member (bukan konten cetak; disembunyikan saat print).
   - Workspace beat-grid (Chord Chart + Numeric): ribbon tools (Chord, Slash Chord, Nashville, Rhythm, Lyrics) + preview-stage (live preview card: header, meta KEY/TIME/TRANSPOSE/playback BPM/history, sections preview, footer Reset/Add section, signature "Generated with Spartio.app").
   - Workspace ChordPro: editor kiri (metadata + transpose/key/time/history + textarea per section + Add section) + live preview kanan ("Exported to PDF exactly like this").
   - Footer situs (disembunyikan saat layout PDF preview agar tidak bocor ke kertas).
     - Dialog: PDF options, New Song (nama versi, pilih satu dari tiga mode, lalu konfirmasi `Create song`), New Version (nama + mode per versi + YouTube opsional), Version Details (rename + YouTube + delete), YouTube Link (draft lokal), confirm generik, Attach Link (preview sebelum import), unsaved-changes (Save & leave / Leave without saving / Cancel), how-to (`?` di search bar), join/new album, edit album (nama + deskripsi, `#editAlbumDialog`), Add from My Songs (`#addSongDialog`, pencarian dan pilihan lagu), pemilih album untuk lagu baru (`#chooseAlbumDialog`), member actions, device-hint phone. Album Detail bukan dialog terpisah: itu panel di dalam `#mySongsModal` yang digerakkan route `#/albums/{id}`.
 4. **Album Detail (`#/albums/{id}` overlay rasa page):** judul/deskripsi, meta, aksi owner (Invite, Members, Add from My Songs, New Song) vs member (Leave), pencarian dan daftar lagu.

### 5.2 Kemampuan tingkat tinggi

- Menulis: klik ketuk + ketik + pilih saran; klik chord terpasang untuk retype; kosongkan + konfirmasi untuk hapus; Tab jalan ke sel berikut; Enter = pakai custom chord bila tidak ada yang cocok.
- Ritme: right-click / long-press → split ½/⅓/¼, nested 2 level; hapus subdivisi menggabung kembali.
- Fermata: right-click / long-press → `Fermata (hold)…` → isi jumlah extra beats.
- Bar & section: `+ Add 1 bar`, `×` hapus bar, klik nama section rename, `+ Add section` (maks 40), `⧉` copy bar, `⎘` paste, menu `•••` → Copy bars range, copy/paste section, reorder ↑ ↓, delete ×.
- Lirik: toggle per lagu + per section; field di bawah tiap ketuk; paste kalimat ke field pertama → kata terdistribusi otomatis; Enter = ketuk berikut, Shift+Enter = sebelumnya. (Panel auto-syllable ada di markup tapi dinonaktifkan sementara; logika di `notation.js` + `events.js` tetap disimpan.)
- Undo/redo 50 langkah (`⌘Z/Ctrl+Z`, `⌘⇧Z/Ctrl+Shift+Z`); Alt+1…5 pindah tab ribbon; Esc bersihkan seleksi chord, keluar dari preview print-layout, dan collapse ribbon mobile.
- Metadata inline: klik title/artist/key/meter di preview untuk edit; kontrol transpose −/+; BPM number input.
- File lokal: Export `.file` (`.chordsheet.json`), Load `.file`; import `.cho/.pro` membaca metadata `{title:}{artist:}{key:}`.

---

## 6. Arsitektur & Teknologi (As-Is)

- **Tanpa build-step development:** ES Modules native → wajib diserve via HTTP (`python3 -m http.server 4173`), `file://` merusak module loading.
- **Layout repo (flat, concerns terpisah):**

```text
chord-sheet/
├── index.html
├── src/ (app.js, events.js, render.js, store.js, notation.js, chordPro.js,
│         chordProEditor.js, pdf.js, pdfOptions.js, dom.js, cloud.js, cloudUI.js,
│         firebase-config.js, + chordBank.js, chordEditor.js, beatMenu.js,
│         fermataEditor.js, history.js, clipboard.js, identity.js, playback.js,
│         sampleCache.js, share.js, synth.js, youtube.js)
├── styles/ (styles.css tokens, ui.css shell, preview.css canvas+print,
│            chordpro.css self-contained, fonts.css Inter + Noto Serif JP subset)
├── assets/ (favicon, icons PWA, fonts woff2 + lisensi OFL 1.1)
├── docs/ (FIREBASE-SETUP.md, ALBUM-FEATURE.md, DESIGN.md, PRD.md)
├── tests/ (unit.test.mjs, regression.mjs, playback.test.mjs)
├── sw.js, manifest.webmanifest, .nojekyll
└── .github/workflows/deploy.yml
```

- **Graf dependensi dan invariant modul:** peta yang dipelihara ada di `AGENTS.md` §§2–3. Kode dan tes terkait adalah sumber akhir bila ringkasan ini berbeda.
- **Cloud terisolasi:** `cloudUI` ↔ `cloud.js` ↔ Firebase CDN (lazy-load auth + Firestore); editor tidak tahu Firebase secara langsung.
- **Cache sampel piano:** `sampleCache.js` menyimpan raw ArrayBuffers (bukan AudioBuffers, agar bebas dari konteks audio) di IndexedDB `wns-sample-cache` v1, store `samples`, key `SAMPLE_CACHE_KEY = "salamander-piano-tonejs-v1"` + nama nada (`synth.js`); semua kegagalan cache bersifat non-fatal (playback tetap jalan via jaringan ulang).
- **Deploy:** push ke `master` → unit test → stage `_site` + injeksi `__BUILD__` → `r<run>-<sha7>` → verifikasi ulang di `_site` → GitHub Pages. Source Pages harus `GitHub Actions` (fallback branch `master /root` tetap jalan tapi tanpa stamping). Empat artifact distempel: `sw.js`, `index.html`, `styles/chordpro.css` (via `--chordpro-css-version`), dan semua `?v=`; workflow gagal bila tidak ada placeholder `__BUILD__` atau masih ada sisa placeholder di artifact ter-stage.
- **Testing existing:** `node --test tests/unit.test.mjs` (transpose, normalisasi, slot, kontrak print, konsistensi versi); regresi layout butuh Chrome remote debugging (`python3 -m http.server 4173` + Chrome `--remote-debugging-port=9223` + `node tests/regression.mjs`).

---

## 7. Tiga Mode Penulisan

Mode dipilih di dialog **New Song** (kartu animasi per mode) untuk aransemen pertama, dan di dialog **New version** untuk versi berikutnya. Satu lagu boleh campur mode antar versi (mis. Rock = Chord Chart, Pop = Numeric, Latin = ChordPro). Library card menampilkan mode versi teratas.

### 7.1 Mode 1 — Chord Chart (beat grid + chords)

- Grid ketuk per bar per section; tiap ketuk bisa diisi chord huruf (`C`, `Am7`, `G/B`), angka Nashville (`1`, `5`, `6m`), atau `N.C.`.
- Opsional **chord row di atas angka (per-section):** tombol `Chords On/Off` di kepala section; angka di ketuk = melodi yang dinyanyikan, chord di atasnya = harmoni band; ikut transpose, ikut subdivisi, ikut cetak; section OFF tidak menyisakan strip (pitch ketuk normal); bar OFF di dalam section ON tetap menyisakan tinggi agar barline sejajar; tidak ada saklar global lagu; override per-bar lama (`chordAboveBars`) tetap dihormati bila ada.
- Bar numbers PDF hanya berlaku di mode ini.

### 7.2 Mode 2 — Numeric Notation + Lyrics

- Derajat `1–7` + oktaf tinggi (`1̇` dot atas) / rendah (`1̣` dot bawah) + setengah langkah `♯/♭` + kualitas (`1m`, `1maj7`, `2sus2`, `1dim`).
- Input: ketik aksidental dulu (`#1` naik, `b1`/`♭1` turun) atau chip popover `♮ ♯ ♭` (chip adalah filter daftar saran, bukan campuran). Chip "Raise a half step (naik ½)" / "Lower a half step (turun ½)" menyetel aksidental sebelum memilih derajat; hasilnya ikut playback, transpose, dan PDF.
- Render: angka naik = digit disilang garis naik ke kanan (`/`), turun = garis turun ke kanan (`\`), tebal mengikuti stem, sedikit lebih panjang dari digit; CSS absolute sehingga tidak menambah lebar token (agar pengukuran PDF tidak rusak); glyph ♯/♭ asli tetap di DOM tersembunyi untuk seleksi & screen reader.
- Baris lirik opsional di bawah tiap ketuk (toggle Lirik).
- Tidak ada saran chord huruf di mode ini (efek samping yang disengaja agar daftar bersih); kualitas tetap bisa diketik / via palet ribbon.

### 7.3 Mode 3 — ChordPro

- Lagu baru dibuka dengan dua section contoh: `Intro` (chord-only `[C] [Am7] [Dm7] [G7] [Cmaj7]`) dan `Verse` (lirik + `[C]…[G]…`).
- Sintaks subset minimal (parser tangan ±400 baris, tanpa `chordsheetjs` agar tetap no-build + offline):
  - `[C]` inline chord (huruf, slash `G/B`, Nashville `1`/`♭7`, `N.C.`)
  - `{soc}/{eoc}` (juga `{sov},{sob},{sopc}`, long `{start_of_*}`) header section
  - `{c: …}` komentar
  - `{title:}{artist:}{key:}` metadata (dibaca saat import `.cho/.pro`)
  - Baris yang hanya `[Verse 1]` (bracket-only bukan chord) = label section
  - Direktif tak dikenal diparse lalu diabaikan (tempelan dari app ChordPro lain tidak merusak skor)
- Editor: satu textarea polos per section (tanpa palet chord, tanpa drag & drop — mengetik bracket adalah inti untuk pemula); panel kanan live preview update saat ketik (debounced save = satu burst ketikan = satu langkah undo); whitespace antar chord dipertahankan + run chord-only diberi padding (`is-chord-only`).
- Cetak: reuse geometri Chord Chart (padding, margin judul, baris KEY/TIME, box label section), ukuran chord ≈5.4mm & lirik ≈4.3mm mengikuti slider PDF (disimpan per lagu).

---

## 8. Persyaratan Fungsional (FR)

Format: ID — Nama — User story — Perilaku existing — Kriteria penerimaan (as-is).

### FR-01 — New Song / New Version / Mode Picker

- **Story:** Sebagai musisi, saya wajib memberi nama aransemen lalu memilih mode agar aransemen tidak tertukar.
- **Existing:** Dialog New Song meminta nama versi (wajib, max 60, default "Version 1", error bila kosong) lalu 3 kartu mode. Versi baru mulai kosong (tidak menyalin skor berjalan). Tiap versi menyimpan `editorMode` sendiri.
- **AC:** (1) Nama kosong → tombol lanjut diblokir + pesan error. (2) Mode terpilih menentukan workspace (grid vs ChordPro). (3) ChordPro baru selalu berisi Intro + Verse contoh; dua mode lain mulai satu Intro kosong.

### FR-02 — Palet Chord, Slash Builder, Custom Chord

- **Story:** Sebagai pemain, saya bisa memilih chord umum atau mengetik chord aneh saya sendiri tanpa kehilangan data.
- **Existing:** Tab Chord (root picker + family bank + input custom + preview), tab Slash (root/quality/bass + Add + bank), Nashville builder (derajat + aksidental + family + kartu preview seleksi). Saran live saat ketik; alias (`aug→+`, `dim/o→°`, `m7♭5→ø7`, `min7→m7`, `ma7/Δ7→maj7`, `omit3→no3`) dinormalisasi satu pintu. Chord tak dikenal → saran ejaan sendiri paling atas; bila tidak ada yang cocok → `Use custom chord` / Enter memakai persis yang diketik. Custom chord ikut transpose, cetak, copy/paste; playback memvoice kualitas yang dikenal else fallback mayor.
- **AC:** (1) `Bmaj9`, `B6/9`, `Bm7♭5` dapat disimpan & dibunyikan (tidak bisu). (2) `Cxyz +1` → `D♭xyz` (suffix verbatim). (3) `N.C.` tidak ditranspose.

### FR-03 — Nashville + Half-Step + Oktaf

- **Story:** Sebagai pembaca not-angka, saya bisa menulis `♭1`, `#1̇` dan mendengar oktaf yang benar.
- **Existing:** Grammar satu regex; `b` ASCII hanya alias ketik untuk ♭ (disimpan sebagai `♭`); `0` = rest (dikenali sebagai angka, sengaja bisu). Aksidental diterapkan ke MIDI final setelah oktaf (mencegah `♭1` di C berbunyi B4 padahal harusnya B3 di bawah tonika). Chip aksidental `♮ ♯ ♭` bekerja sebagai **filter keluarga** daftar saran: chip yang aktif membatasi derajat yang ditawarkan ke keluarga tersebut (implementasi di `chordBank.js` + baris chip di `chordEditor.js`), dan pilihan aksidental ikut tersimpan pada token Nashville (`nashvilleAccidental` di dokumen versi).
- **AC:** (1) `♭1` di C berbunyi B3 (di bawah tonika). (2) `#1̇` semitone di atas `1̇` tanpa lompat oktaf. (3) Chip ♮/♯/♭ memfilter daftar tepat sesuai keluarga yang akan dipasang.

### FR-04 — Ritme, Fermata, Lirik, Bar/Section, Clipboard, History

- **Story:** Sebagai arranger, saya bisa memecah ketuk cepat, menahan nada, menambah lirik, dan menyusun ulang tanpa takut kehilangan.
- **Existing:**
  - Split ½/⅓/¼ per ketuk, nested 2 level; hapus = gabung kembali; chord-row mengikuti split.
  - Fermata: input jumlah extra beats (per-beat, disimpan pada `beat.fermata`, cap `MAX_FERMATA = 32`); note ditahan + metronome tetap tik tiap beat tertahan (tetap dalam tempo); hanya playback (skor/PDF hanya glyph + headroom cetak); ikut copy/paste, transpose, undo/redo; tidak berlaku di ChordPro.
  - Lirik per-ketuk; paste kalimat → distribusi kata; toggle lagu + section.
  - Bar/section: tambah/hapus/rename/reorder; copy bar, copy range, copy/paste section; batas `MAX_BARS=96` per section, `MAX_SECTIONS=40` per lagu; import tak tepercaya dipotong ke batas.
  - History 50 langkah; mengetik ChordPro di-debounce menjadi satu langkah.
- **AC:** (1) Melebihi 96 bar / 40 section ditolak dengan toast. (2) Fermata tidak mengubah layout cetak selain glyph + headroom. (3) Undo setelah load dokumen tidak bisa memunculkan bar/chord dari luar dokumen termuat. (4) Cap fermata (32 extra beats) ditolak dengan toast.

### FR-05 — Transpose, Key, Time Signature, Playback

- **Story:** Sebagai pemain, saya bisa pindah kunci dan tetap membaca ejaan yang wajar, lalu memutarnya.
- **Existing:** Key list 17 nama (`C,C♯,D♭,D,D♯,E♭,E,F,F♯,G♭,G,G♯,A♭,A,A♯,B♭,B`); time `1/4,2/4,3/4,4/4,6/8`; `1/4` berarti satu ketuk per bar (cocok untuk bar pickup atau satu chord per bar), dan jumlah ketuk di grid, playback, live preview, serta PDF dihitung dari numerator yang sama. Karena bar `1/4` itu satu ketuk, section-nya digambar sebagai SATU bar kontinu di live preview maupun PDF: tidak ada bar line di antara ketuk, tetapi garis tetap ada di awal dan di akhir tiap baris (baris editor maupun baris cetak); beat tetap mengalir (tambah bar = tambah beat) dengan beat pitch yang sama seperti beat di bar biasa, dan nomor bar tidak dicetak (grup "Bars" di dialog PDF disembunyikan). Di editor, `1/4` memakai kosakata "beat" (tombol `+ Add 1 beat`, hapus/salin per beat, caption `1 bar · N beats`). Meter lain tidak berubah sama sekali. Transpose ±1 semitone semua chord + key di semua mode termasuk ChordPro; angka & `N.C.` tidak disentuh; teks non-chord diteruskan. Aturan ejaan: (1) kunci target menentukan sisi (C+1→D♭; D mayor pakai `F♯m` bukan `G♭m`; tie pitch-class 6 mempertahankan sisi sendiri), (2) di luar kunci pakai default terbaca (`C♯,E♭,F♯,A♭,B♭`), (3) bass slash nada chord mengikuti derajat chord (`D/F♯→E/G♯`). Playback piano multi-sample Salamander Grand V3 (Yamaha C5); chord = akor, angka = nada tunggal; beat angka+chord = melodi + harmoni; beat kosong bisa klik metronome; BPM per lagu (input 40–240, clamp), default 120; bila masih bunyi saat keluar, app meminta konfirmasi lalu menghentikan.
- **AC:** (1) C+1 menampilkan `D♭` bukan `C♯`. (2) `Em` di chart D mayor + transpose tidak menjadi `G♭m`. (3) `F♯/G♭` berbunyi identik (pitch-class sama). (4) Memilih `1/4` menghasilkan tepat satu ketuk per bar di live preview dan PDF, dengan label section `1 bar · N beats`, tanpa bar line di antara ketuk (garis tetap ada di awal & akhir baris) di live preview maupun PDF, dan tanpa nomor bar. (5) Meter `2/4`, `3/4`, `4/4`, `6/8` tetap menggambar bar line dan nomor bar seperti sebelumnya.

### FR-06 — Versions + YouTube per Versi

- **Story:** Sebagai pemilik lagu, saya menyimpan banyak aransemen + video referensi tiap aransemen.
- **Existing:** Pill switcher di sebelah judul; daftar versi urut most-recently-updated (baru/diedit melompat ke atas); kartu library menampilkan mode versi teratas; title/artist/key/time shared satu lagu. Tiap versi punya link YouTube sendiri (`✎` + thumbnail preview live; validasi link; tracking `si=,list=` dibuang; `?t=/&t=53m34s` dinormalisasi ke detik & disimpan; parser juga menerima ID 11-char telanjang, path `/shorts/`, `/embed/`, `/live/`, `/v/`, serta `&start=` dan hash `#t=`). Chip topbar selalu mencerminkan versi terbuka (klik = tonton dengan start time, ✎ = ubah); versi tanpa video menampilkan pil `No video` (klik untuk tempel) — tidak pernah menampilkan thumbnail basi versi sebelumnya. Rename + link ditulis seketika ke dokumen versi (+ ringkasan `latest*` bila versi teratas).
- **AC:** (1) Ganti versi tidak pernah menukar link YouTube. (2) Reload / Save to Cloud tidak menghilangkan link. (3) `youtu.be/<id>?t=3214` tersimpan dengan `&t=3214`.

### FR-07 — Cloud Library Pribadi (My Songs)

- **Story:** Sebagai pengguna login, saya menyimpan lagu di cloud dan membukanya di perangkat lain.
- **Existing:** Auth opsional (Google + email/password); editor tetap jalan tanpa akun; aksi cloud meminta login bila perlu. `Save to Cloud` / `My Songs`; tombol Save ber-titik amber bila ada perubahan belum disimpan; keluar dengan perubahan → dialog 3 pilihan. Daftar lagu: pencarian, buka, duplicate, delete, Copy Link; `Attach Link` mengimpor ke library sendiri; `New Song` / `Attach Link` hanya milik tab My Songs. Tab My Songs/Albums tetap terlihat pada semua lebar. State loading/empty/no-results/error tersedia pada daftar terkait. Mekanik share-link (`share.js`): payload digzip via `CompressionStream` → base64url (scheme `g`), fallback plain base64 (scheme `p`) untuk browser tanpa `CompressionStream`; payload hidup di URL fragment sehingga tak pernah sampai ke server; marker `"w"` sengaja dibekukan sejak era brand lama agar link lama tetap bisa di-decode; `extractPayloadFromLink` menerima link penuh maupun payload mentah.
- **AC:** (1) Tanpa login, Save meminta login bukan crash. (2) Copy Link → Attach Link menghasilkan lagu di library penerima. (3) Dot amber muncul saat draft memiliki perubahan yang belum disimpan.

### FR-08 — Albums (Invite-Code, MD vs Member)

- **Story:** Sebagai MD, saya kurasi album tim; sebagai member, saya baca + simpan salinan privat.
- **Existing:** Tab Albums; `New Album` (nama + deskripsi max 500, edit details khusus MD via hover), `Join Album` (kode `ABCD-1234`, max 9 char). Model akses: tiap musisi akun sendiri; tanpa password bersama; tanpa invite-link. Peran `owner` (disebut MD di UI) vs `member`; field `role` siap ditambah `editor` tanpa migrasi. Owner: Invite (rotate code kapan saja; kode lama langsung mati), Add from My Songs (salin semua aransemen + konten + label/number + YouTube, all-or-nothing, salinan mandiri), New Song langsung di album, promote/demote/remove via sheet `⋮` (desktop/tablet) atau tap row `›` (phone): `Make MD / Make member / Remove`; alur UI mencegah MD terakhir didemosikan; siapa pun bisa Leave. Member: read-only canvas; hanya Key/Time/BPM/Transpose, play/stop, Export PDF, theme, dan zoom yang tersedia. Pada phone, pembatasan phone mengunci time signature. Mutasi konten diblokir oleh dataset, guard handler, dan affordance CSS; guard UI bukan pengganti Firestore Rules. Undo/redo tetap ada tetapi tidak dapat memasukkan konten luar. Tombol Save menjadi `Save a copy`, menyalin ke My Songs lalu memindahkan konteks dan URL ke salinan itu. Arah simpan memakai cloud context, memo `activeAlbumCtx`, dan URL; assertion mencegah simpan album diarahkan ke My Songs.
- **AC:** (1) Join hanya berhasil dengan kode aktif milik album itu (verifikasi server-side). (2) Member tidak bisa mengubah konten lewat handler UI mana pun. (3) `Save a copy` memindahkan konteks editor ke lagu privat baru.

### FR-09 — Export PDF & Opsi Layout

- **Story:** Sebagai pemain, saya mencetak persis seperti preview dengan ukuran terbaca.
- **Existing:** Tombol `Export .pdf` membuka modal opsi; di belakangnya layout preview dinyalakan (`is-print-layout`); chrome non-kertas (footer, toast, banner album, ring seleksi + badge ✓) disembunyikan. Panel: preset Compact/Normal/Large/X-Large (satu ketuk mengatur semua), slider Chord size / Lyric size / Beat spacing, grup Bars → Bar numbers (Off / Line starts / Every bar; default ON Line starts; hanya Chord Chart; di mode lain grup disembunyikan). **Kertas terkunci A4 + margin narrow** (`pdfOptions.js` — dialog tidak menawarkan pilihan ukuran; nilai `paper` legacy non-A4 yang tersimpan diabaikan; `PDF_PAPER_MM` di `pdf.js` hanya punya entri `a4: 210`). Semua opsi ukuran disimpan per lagu. Preview di dialog menampung node `#previewCard`/`#cpPreviewCard` asli sehingga tidak bisa drift. Bar numbers: digit bold 3mm (line) / 2.6mm (every) di atas barline; geometri band cadangan + offset barline terkunci; nilai lama `left/right` dimigrasi ke `line`; `off` lama tanpa marker dianggap legacy → kembali ke default.
- **AC:** (1) Ubah opsi satu lagu tidak mengubah lagu lain. (2) Preview dialog identik dengan kertas. (3) Lagu pra-fitur nomor bar mendapatkan nomor default (migrasi).

### FR-10 — PWA, Offline, Theme, Aksesibilitas Dasar

- **Story:** Sebagai pengguna, saya bisa install, offline, dan ganti tema.
- **Existing:** Manifest (`Spartio.app`, standalone, icons 192/512/1024 + maskable + svg, kategori music/productivity/utilities); `sw.js` network-first untuk navigasi + shell tanpa `?v=`, cache-first + background refresh untuk aset `?v=` (hanya exact match; `ignoreSearch` hanya saat offline); purge-on-refresh via stamp `__WNS_BUILD__` vs localStorage (reload tepat sekali); `?reset=1/?fresh=1` purge + unregister; font precache; Firebase CDN tidak diintercept (butuh online). Deteksi CSS ChordPro basi: `styles/chordpro.css` mendeklarasikan `--chordpro-css-version: __BUILD__`, dibaca `render.js` untuk toast "ChordPro styles didn't load / out of date" bila service worker menyajikan CSS lama. Theme light/dark (persist `chordSheetTheme`, hormati `prefers-color-scheme`); zoom; `prefersTap/isPhone` + media query sinkron; dialog `role=dialog aria-modal`, toast `role=status aria-live=polite`, label aria pada kontrol utama; nilai ♯/♭ tersimpan di DOM tersembunyi agar terseleksi & terbaca screen reader.
- **AC:** (1) Kunjungan kedua offline tetap boot. (2) Deploy baru terlihat pada refresh pertama tanpa clear manual. (3) Print tidak mengandung chrome app.

---

## 9. Alur Pengguna Utama

### 9.1 Baru → tulis → dengar → simpan → cetak (My Songs)

1. Klik `+ New Song` → isi nama versi → pilih kartu mode.
2. ChordPro langsung dapat Intro + Verse; mode lain dapat satu Intro kosong.
3. Tulis via palet/ketik/split/lirik/transpose; putar via ▶ + BPM; undo bila salah.
4. `Save to Cloud` (login bila perlu) → kartu muncul di My Songs.
5. `Export .pdf` → atur preset/slider/bar numbers → Export.

### 9.2 Versi + video

1. Pill versi → `+ New version` → nama + mode + YouTube opsional → aransemen kosong baru di atas daftar.
2. `✎` pada chip YouTube → tempel link (`?t=` didukung) → thumbnail tampil → tersimpan seketika.
3. Ganti versi via pill; rename/hapus via Version Details.

### 9.3 Album tim

1. MD: Albums → New Album → buka → Invite → salin kode.
2. Member: akun sendiri → Join with code → album muncul.
3. MD: New Song di album atau Add from My Songs → Save to Album.
4. Member: buka → banner read-only → latihan (Key/Time/BPM/transpose; time signature terkunci khusus di phone) → Export PDF atau Save a copy.
5. MD: Members → `⋮`/`›` → Make MD / Make member / Remove; Invite → Create new code untuk rotasi.

### 9.4 Berbagi tanpa album

1. Pemilik: kartu → Copy Link.
2. Penerima: Attach Link → tempel → Preview → impor ke My Songs.

---

## 10. Model Data (As-Is)

Bagian ini merangkum model produk. Field aktual yang diserialisasi harus diverifikasi di `projectData()` dan operasi terkait di `src/`; Firestore Rules dan checklist konfigurasi berada di `docs/FIREBASE-SETUP.md`.

### 10.1 Dokumen proyek lokal (per versi)

`projectData()` mencakup: `format: "chord-sheet"`, `version: 2`, `title, artist, key, meter, BPM, sections[], pdfOptions, editorMode, youtubeUrl/youtubeId (null → field dihapus di cloud), chordRoot, customChord, slashChords, nashvilleNumber, nashvilleAccidental, chordAbove flags, lyrics flags`.

- `sections[]`: `{ name, bars, cells/beats, lyrics[], chordAboveEnabled, chordAboveBars?, chordPro? (teks verbatim per section di ChordPro), rhythm splits, fermata }`.
- Batas: `bars ≤ 96`, `sections ≤ 40`.
- `editorMode`: `chords | numbers | chordpro` (tanpa field = `chords` untuk kompatibilitas).

### 10.2 Firestore — Personal

```text
users/{uid}/songs/{songId} = {
  title, artist, createdAt, updatedAt,
  versionCount, latestVersionId, latestVersionLabel, latestEditorMode,
  latestYoutubeId, latestKey, latestMeter
}
users/{uid}/songs/{songId}/versions/{versionId} = {
  label, number, ...projectData(), createdAt, updatedAt
}
users/{uid}/albumMemberships/{albumId} = { role, joinedAt, albumUpdatedAt, songCount }
```

Daftar versi diurut `updatedAt` terbaru dulu, `number` hanya tiebreak.

### 10.3 Firestore — Album

```text
albums/{albumId} = { name, description, createdBy, createdAt, updatedAt, songCount, activeInviteCode }
albums/{albumId}/songs/{songId} = { title, artist, versionCount, latestVersionId,
  latestVersionLabel, latestEditorMode, latestYoutubeId, latestKey, latestMeter, createdAt, updatedAt }
albums/{albumId}/songs/{songId}/versions/{versionId} = { label, number, ...projectData(), createdAt, updatedAt }
albums/{albumId}/members/{uid} = { uid, role: owner|member, name, email, joinedAt, addedBy }
inviteCodes/{code} = { albumId, active, createdAt, createdBy }  // doc ID = kode
```

Album songs adalah salinan mandiri (bukan referensi). Tidak ada query yang butuh index manual (hanya equality/orderBy tunggal; `inviteCodes` hanya `get` by ID).

---

## 11. Keamanan, Peran & Privasi (As-Is)

Aturan Firestore (`docs/FIREBASE-SETUP.md`, `rules_version='2'`):

- `users/{uid}/{all=**}`: hanya pemilik (`auth.uid == uid`).
- `inviteCodes/{code}`: `get` boleh saat login (untuk resolve kode→album); `list/delete` selalu tolak; `create/update` hanya owner album (`request.resource.data.albumId` — tanpa `get()` rekursif).
- `albums/{id}/members/{uid}`: baca baris sendiri selalu boleh + daftar member bagi member (agar pointer basi self-heal, bukan permission error); `create` = self-join via kode aktif milik album itu ATAU owner-seed saat `createdBy == uid`; `update` = owner kelola orang lain ATAU self-strip `inviteCode` (role terkunci); `delete` = owner hapus orang lain ATAU siapa pun hapus diri sendiri (leave).
- `albums/{id}`: `create` hanya kreator (`createdBy == uid`) — mengatasi chicken-and-egg sebelum membership ada.
- `albums/{id}/{all=**}`: baca = member, tulis = owner.
- Default deny sisanya.
- Owner tidak bisa mengubah baris membership sendiri, sehingga tidak bisa demote diri lewat alur UI; ko-owner harus melakukannya. Pengecekan agar owner terakhir tidak meninggalkan album dilakukan di client (`leaveAlbum()`), sedangkan Firestore Rules mengizinkan pengguna menghapus membership miliknya sendiri. Karena itu, ini adalah guard alur aplikasi, bukan jaminan keamanan server-side terhadap client yang dimodifikasi. Jika invariant owner terakhir harus tahan terhadap request langsung, diperlukan enforcement server-side atau perubahan model akses.
- Identitas member: `Auth.displayName` bila ada; else derivasi dari local-part email (`dhandy.joe@gmail.com → Dhandy Joe`); fallback `Musician` untuk alamat id-like. Batas derivasi (`identity.js`): `MAX_NAME_LENGTH = 28`, `MAX_NAME_WORDS = 3`, heuristik id-like (huruf < 3 atau rasio huruf/panjang < 0.6 → bukan nama). Email selalu tampil di bawah nama.
- Config Firebase di `src/firebase-config.js` public-safe; proteksi nyata = rules + Authorized domains (`localhost`, `127.0.0.1`, `dhandyjoe.github.io`).

Matriks peran (existing):

| Aksi | Owner/MD | Member | Tanpa login |
|---|---|---|---|
| Baca album, play, transpose, Key/Time/BPM, export PDF, save copy | Ya | Ya | N/A (butuh album) |
| Edit chord/angka/lirik/bar/section, Invite, Add song, kelola member | Ya | Tidak | N/A |
| Editor penuh + file lokal + playback + PDF | Ya | Ya (salinan privat) | Ya (sesi lokal) |
| Save to Cloud / My Songs / Albums | Ya (login) | Ya (login) | Tidak (diminta login) |

---

## 12. Persyaratan Non-Fungsional (NFR)

| ID | Kategori | Kondisi existing |
|---|---|---|
| NFR-01 | Instalasi & Offline | PWA installable; shell + font precache; cross-origin Firebase lolos ke network |
| NFR-02 | Kesegaran deploy | `__BUILD__` → `r<run>-<sha7>` satu pass (4 artifact: `sw.js`, `index.html`, token `--chordpro-css-version` di `chordpro.css`, semua `?v=`); cache name baru menghapus lama; purge+reload sekali; shell network-first `cache:no-cache` (tahan `max-age=600` Pages) |
| NFR-03 | Performa | Aset versi cache-first + background refresh; placeholder lokal bypass cache agar edit terlihat reload berikut |
| NFR-04 | Responsif | 3 band (lihat §4); print invariant di semua band (aturan responsif hanya `screen`/band, print/`is-print-layout` tak tersentuh; dipin oleh unit test) |
| NFR-05 | Tipografi konsisten | Inter variable self-hosted (bobot 850/900 dirender, bukan sintesis); subset Noto Serif JP 876-byte untuk `U+266D–266F` pada family `Inter` yang sama; fallback chain tetap ada |
| NFR-06 | Aksesibilitas | Baseline yang tercatat: dialog ber-`role`, toast live, label aria, panduan keyboard lirik, fokus viewport preview. Ini bukan klaim telah memenuhi WCAG; kontras, fokus, keyboard, dan perilaku dialog masih perlu diuji. |
| NFR-07 | Keandalan data | Normalisasi + sanitize impor tak tepercaya (potong section/bar, migrasi barNumbers, lipat alias Nashville); copy album all-or-nothing + hapus parsial bila gagal |
| NFR-08 | Batasan jelas | Toast eksplisit saat cap tercapai; validasi YouTube + kode invite + nama versi |
| NFR-09 | Tanpa backend sendiri | Sepenuhnya statis + Firebase BaaS; tanpa server milik produk |

---

## 13. Batasan, Aturan & Asumsi (As-Is)

- `MAX_SECTIONS = 40`, `MAX_BARS = 96` per section.
- `MAX_FERMATA = 32` (extra beats maksimum per fermata).
- `MAX_HISTORY = 50`.
- BPM clamp `40–240`.
- Nama versi max 60 char, wajib diisi.
- Deskripsi album max 500 char; nama album max 80 char.
- Time signature: `1/4, 2/4, 3/4, 4/4, 6/8` (`1/4` = satu ketuk per bar; digambar sebagai satu bar kontinu, tanpa bar line di antara ketuk tetapi dengan garis di awal & akhir baris).
- Key picker: 17 nama (termasuk enharmonik `C♯/D♭` dst agar chart bisa hidup di `F♯` maupun `G♭`).
- File lokal: `.chordsheet.json` (disebut `.file` di UI); skor hanya di memori sesi — tanpa Export/Save akan hilang.
- Kertas PDF tetap A4; opsi per lagu; grup Bars hanya Chord Chart.
- Phone = view-only aransemen. Bagi pengguna non-member, title/artist/key/BPM/transpose/play/export tetap tersedia, tetapi pemilihan time signature terkunci (`src/events.js`, `phoneViewOnly()`). Member album dapat mengubah Key/Time/BPM/Transpose pada perangkat selain phone; di phone, pembatasan phone juga mengunci time signature.
- Gotcha lokal: service worker cache-first pada `?v=__BUILD__` placeholder → buka `/?reset=1` sekali setelah edit agar perubahan terlihat.
- ChordPro: tanpa palet, tanpa ritme, tanpa fermata.
- Auto-syllable dinonaktifkan sementara di markup (logika disimpan untuk masa depan — termasuk binding `Ctrl/Cmd+Enter` untuk split suku kata; keduanya tertidur sampai panel diaktifkan kembali).

---

## 14. Verifikasi Baseline (As-Is)

Bagian ini memeriksa kecocokan dokumentasi dengan repo, bukan menyatakan semua fitur telah lulus pengujian atau siap rilis. Perilaku aktual harus ditelusuri ke kode, tes, dan Firestore Rules.

1. Deskripsi FR-01…FR-10 konsisten dengan implementasi di `src/`, markup, dan tes terkait. Label *As-Is* tidak berarti setiap alur sudah diuji end-to-end.
2. Jalankan `node --test tests/unit.test.mjs` dan `node --test tests/playback.test.mjs` untuk kontrak logika dan audio.
3. Alur §9 yang melibatkan auth, Firestore, share, dan Albums adalah uji manual. Uji ini memerlukan koneksi online, Firebase config, Authorized Domains, dan rules yang dipublish; catat kegagalan setup sebagai prasyarat, bukan hasil lulus.
4. Uji deploy memeriksa stamping `__BUILD__` di artifact `_site`; uji ini terpisah dari tes unit.
5. Uji geometri PDF memakai `tests/regression.mjs` dan Chrome remote debugging. Periksa bahwa chrome app tidak masuk ke hasil cetak pada mode dan lebar layar yang relevan.

PRD ini belum menetapkan ambang performa numerik. Jangan menyatakan performa telah memenuhi target sampai target dan metode pengukurannya ditentukan.

---

## 15. Risiko & Catatan Teknis

- **Cache PWA menutupi deploy:** sudah dimitigasi 3 lapis (§12 NFR-02), tapi developer lokal wajib tahu `?reset=1`.
- **Rules Firestore basi:** album akan denied dengan pesan ramah "check Firestore security rules" bila rules baru belum dipublish.
- **Authorized domains kurang:** login Firebase gagal di host baru bila domain belum didaftarkan.
- **Enharmonik & keterbacaan:** aturan ejaan transpose disengaja (bukan always-sharp/flat); perubahan di sini berisiko membingungkan pemain.
- **Lebar token Nashville:** slash coret absolute agar pengukuran `markMidRowBars` & paginasi PDF tidak rusak — jangan ubah menjadi in-flow tanpa menguji PDF.
- **Print parity:** setiap overlay chrome baru wajib ditambahkan ke blok print `ui.css` (contoh preseden: `.album-banner`).
- **Member readonly:** setiap handler mutasi baru wajib memanggil `blockedForEdit()` (yang sekaligus memblokir member album dan pengguna phone) + affordance di `applyReadOnlyAffordances()`; satu call site terlewat = celah tulis.

---

## 16. Glosarium

- **Spartio.app:** nama produk (brand di manifest, topbar editor menyebut sub-page dari My Songs).
- **Chord Chart:** mode grid ketuk + chord.
- **Numeric Notation / Not-angka:** mode derajat 1–7 + oktaf + kres/mol.
- **ChordPro:** mode lirik + `[chord]`.
- **Nashville Number System:** penomoran derajat terhadap kunci.
- **Coret `/` `\`:** konvensi Indonesia untuk naik/turun setengah langkah.
- **MD:** Music Director = sebutan UI untuk owner album.
- **Versions:** aransemen-aransemen dalam satu lagu.
- **Albums:** koleksi lagu bersama tim.
- **Invite-code:** kode gabung mandiri (contoh `A7FQ-XK2N`), diverifikasi server-side.
- **`N.C.`:** No Chord.
- **`__BUILD__`:** placeholder versi yang diganti saat deploy.
- **`is-print-layout`:** class HTML untuk preview layout PDF di layar.

---

## Lampiran A — Peta File

Peta modul dan dependensi dipelihara di `AGENTS.md` §§2 dan 7. Peta stylesheet dan tanggung jawab visual dipelihara di `docs/DESIGN.md` bagian lampiran. Kedua peta itu adalah rujukan navigasi; struktur repo aktual tetap menjadi sumber terakhir.

---

## Lampiran B — Referensi Internal

- `README.md` — fitur, cara jalan, deploy, arsitektur, kontrak responsif, testing.
- `docs/DESIGN.md` — prinsip desain (7 prinsip, antara lain "Preview adalah kebenaran", "Kertas tidak mengandung chrome"), design tokens per stylesheet (styles.css/ui.css/preview.css/chordpro.css), tipografi & font, shell, komponen, beat grid, ChordPro, home, dark theme, responsif, print, motion, ikon/PWA, a11y, konvensi. Berbahasa Indonesia, As-Is.
- `docs/ALBUM-FEATURE.md` — keputusan akses, model data album, arah simpan, read-only canvas, resep uji manual.
- `docs/FIREBASE-SETUP.md` — rules lengkap, model data personal vs album, checklist go-live.
- `index.html` — shell app + semua dialog (mode picker, version, YouTube, login, My Songs, album detail, join/new album, edit album, add song, choose album, how-to).
- `sw.js` — strategi network-first shell vs cache-first aset versi.
- `.github/workflows/deploy.yml` — gate unit test 2x + injeksi versi (gagal bila placeholder `__BUILD__` hilang atau bersisa).
- `tests/unit.test.mjs` — kontrak logika: transpose (sweep semua kunci × semua shift), normalisasi, slot, kontrak print, konsistensi versi, fermata.
- `tests/regression.mjs` — geometri layout/print via Chrome remote debugging (port 9223, bisa dioverride `CDP_PORT`).
- `tests/playback.test.mjs` — kontrak audio: `chordToMidiNotes` untuk semua keluarga kualitas (termasuk `ø7`, `+`, `°`, add9, slash bass, bentuk aksidental sharp/flat/unicode), aturan oktaf-lift `resolveEntryNotes` (angka satu oktaf di atas chord-nya; ketuk kosong membunyikan chord row), `buildPlaybackQueue` membawa chord row ke subdivisi, `fermataPulseTimes`.

---

*Dokumen ini memotret kondisi existing. Perbarui dokumen yang terdampak oleh perubahan: PRD untuk kontrak produk, DESIGN untuk keputusan visual, README untuk cara pakai/setup, dan `howToDialog` untuk alur yang dijelaskan di UI. Hindari menyalin rincian implementasi ke banyak tempat.*
