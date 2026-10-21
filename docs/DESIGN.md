# DESIGN — Spartio.app (Chord & Number Score Builder)

> **Status dokumen:** As-Is, dengan panduan untuk memperluas pola yang ada. Dokumen ini bukan usulan redesign.
> **Bahasa:** Bahasa Indonesia.
> **Sumber riset:** `index.html`, `styles/styles.css`, `styles/ui.css`, `styles/auth.css`, `styles/preview.css`, `styles/chordpro.css`, `styles/fonts.css`, `assets/*`, `manifest.webmanifest`.
> **Dokumen terkait:** `docs/PRD.md`, `docs/ALBUM-FEATURE.md`, `docs/FIREBASE-SETUP.md`.

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
16. [Lampiran — Peta File Desain](#lampiran--peta-file-desain)

---

## 1. Prinsip Desain

Prinsip yang terbaca dari implementasi existing:

1. **Preview adalah kebenaran.** Panel preview bukan mockup — node `#previewCard` / `#cpPreviewCard` yang sama dipindah ke dialog PDF dan ke kertas. Aturan: paper dan pane tidak boleh drift.
2. **Kertas tidak mengandung chrome.** Semua elemen app-shell (topbar, ribbon, footer situs, toast, banner album, ring seleksi) wajib disembunyikan di `@media print` / `html.is-print-layout`.
3. **Satu jarak, semua tipe ketuk.** Sel chord polos dan sub-sel ½/⅓/¼ berbagi tinggi + offset yang sama agar garis notasi sejajar.
4. **Mode tidak saling mengotori.** ChordPro memakai prefix `cp-` + gate `body[data-editor-mode="chordpro"]` agar geometri grid tidak bocor.
5. **Tipografi berat harus asli, bukan sintesis.** Chord memakai `font-weight: 850/900` yang hanya benar bila font variable asli dimuat.
6. **Sentuh dulu, klik kemudian.** Implementasi saat ini memiliki kontrol ≥40px pada coarse pointer; untuk kontrol baru, targetkan area interaksi 44×44 CSS px. Long-press = right-click; chip filter mendukung layar sentuh. Ukuran yang tercatat bukan bukti bahwa seluruh UI sudah lulus audit aksesibilitas.
7. **Dekorasi tidak boleh menggeser musik.** Slash coret Nashville absolute (tanpa lebar); chord-row cetak zero-height track + offset relatif; digit bar-number memakai band cadangan.
8. **Warna untuk aksi dan data, bukan chrome.** Bingkai editor memakai satu ground tinted; kertas skor tetap satu-satunya permukaan putih. Pemisahan permukaan memakai tone step atau garis tipis, bukan shadow; shadow hanya untuk elemen yang benar-benar mengambang (dialog, popover, menu). Satu aksi terisi (Save), sisanya quiet.

### Cara menggunakan panduan ini saat mengubah UI

- Untuk penambahan komponen, ikuti token, pola, dan perilaku komponen terdekat. Jangan membuat ulang app shell hanya karena sedang menambah fitur kecil.
- Nilai dan class yang dijelaskan di bawah memotret implementasi saat ini. Anggap sebagai referensi, bukan batas mutlak, kecuali disebut sebagai invariant atau kontrak.
- Perubahan visual besar atau perubahan identitas produk perlu arahan pemilik produk. Untuk perubahan kecil, ikuti arah yang sudah ada dan jelaskan alasan bila memperkenalkan pola baru.
- Jaga perilaku keyboard, tema light/dark, responsif, reduced motion, dan paritas print. Jangan menyatakan aksesibilitas lulus tanpa pengujian yang sesuai.

---

## 2. Design Tokens

### 2.1 Warna inti

Dua lapis yang disengaja: `styles/styles.css` (minified, network-first) masih
memuat nilai legacy di `:root`, lalu **`styles/ui.css` `:root` me-remap semua
token inti ke palet refreshed** (ui.css dimuat setelahnya, jadi nilai inilah
yang aktif di seluruh app). Nilai aktif:

| Token | Nilai (light) | Peran existing |
|---|---|---|
| `--ink` | `#163a2a` | Teks utama |
| `--muted` | `#718078` | Teks sekunder, hint, label |
| `--green` | `#237a50` | Aksi primer, brand mark; juga `theme-color` + `manifest theme_color` |
| `--dark-green` | `#155c3c` | Teks di atas surface lembut, hover primer |
| `--lime` | `#b8e85c` | Aksen terang (badge, marker) |
| `--cream` | `#fcfbf5` | Latar kertas/kartu terang |
| `--surface` | `#fff` | Kartu editor & preview |
| `--line` | `#d9e5dc` | Border kartu, divider, rule preview |
| `--soft` | `#eaf5ed` | Latar tombol ghost, panel lembut |
| `--app-bg` | `#f2f5f2` | Latar app (terang) |

Nilai legacy di `styles/styles.css` (`--ink #193326`, `--green #1f704a`,
`--dark-green #125838`, `--lime #b9e654`, `--cream #fffdf7`, `--line #dce8df`,
`--muted #718176`, `--soft #eff7f1`) hanya berlaku bila ui.css gagal dimuat.
Varian dark didefinisikan ulang di `styles/ui.css` (`html[data-theme="dark"]`,
lihat §9) dan `manifest background_color: #0f1110`.

**Catatan kontras:** `--muted: #718078` menghasilkan rasio sekitar 4.00:1 pada `--cream: #fcfbf5` dan 4.15:1 pada putih. Keduanya di bawah 4.5:1 untuk teks normal. Nilai ini perlu diaudit pada setiap penggunaan; jangan menganggap token tersebut aman untuk semua label dan hint. Catatan ini mendokumentasikan temuan, bukan klaim bahwa warna di implementasi sudah diperbaiki.

### 2.2 Token UI (`styles/ui.css`)

- Radius: `--radius-sm / --radius-md / --radius-lg` (`9px / 14px / 22px`; tombol `9px`, kartu menengah `14px`, kartu besar `22px`).
- Shadow: `--shadow-sm / --shadow-md` (kartu: `0 5px 18px rgba(24,67,42,.045)`).
- Surface app: `--app-bg`, `--ui-bg`, `--ui-border`, `--ui-text`, `--ui-text-dim`, `--ui-accent`.
- Ukuran kontrol: `.button` padding `10px 15px`, font `700 14px`; `.button-small` `7px 10px / 12px`; `.icon-button` min `44px` pada area sentuh.
- Lebar kartu home: `--card-w`; skala preview PDF: `--pdf-preview-scale`; dimensi kertas: `--pdf-page-w / --pdf-page-h / --pdf-page-margin-*`.
- Font mono: `--mono` untuk kode (`[C]`, `{soc}`, `?t=`).
- **Token chrome editor (`--editor-*`, blok `EDITOR CHROME REFRESH` di akhir `ui.css`)**: `--editor-ground` (bingkai), `--editor-surface` (kertas/kartu), `--editor-raised` (tone step lembut), `--editor-line` / `--editor-rule` (garis), `--editor-ink` / `--editor-muted` (teks), `--editor-accent` / `--editor-accent-ink` / `--editor-accent-hover` (aksi), `--editor-danger`, `--editor-control`, dan `--editor-elev` (satu shadow untuk elemen mengambang saja). Nilai light/dark memakai palet library yang sudah ada (`#eef1ec` / `#0f1110`, surface `#fff` / `#171a18`, ink `#163a2a` / `#f1f4f2`, accent `#237a50` / `#83c99d`). Semua aturan chrome dibungkus `@media screen`; print tidak tersentuh.

### 2.3 Token score (`styles/preview.css`)

- Grid: `--beats`, `--leaf`, `--subdivisions`, `--chord-above-w: 68px` (satu lebar untuk semua sel chord-row agar rapi, bukan ragged).
- Tinggi layar: `--chord-above-h`, celah `--chord-above-gap`, daun tambahan `--chord-above-leaf`.
- Lirik: `--lyric-h`, `--lyric-gap`, `--lyric-bar-pad`, `--lyric-leaves`.
- Cetak: `--print-chord-size`, `--print-notation-h`, `--print-chord-h`, `--print-lyric-size`, `--print-slot` (beat spacing), `--print-bar-pad-x/y`, `--print-row-pad-x` (indent baris; 0 default, 2.6mm di scope `1/4`), `--print-beam-gap/top`, `--print-barline-h`.
- Chord-row cetak: `--print-chord-above-size` (90% chord size, mengikuti slider), `--print-chord-above-row`, `--print-chord-above-line-gap: 6mm` (+0.4mm baris pertama section).
- Nomor bar cetak: `--print-bar-num-size: 3mm` (line) / `2.6mm` (every), `--print-bar-num-top: 3.5mm`, `--print-bar-num-inset: 1.3mm`, `--print-bar-num-row/--extra-top/bottom`, `--print-bar-num-weight: 800`.

### 2.4 Token ChordPro (`styles/chordpro.css`)

- Padding kartu: `--cp-card-pad-x: 10mm`, `--cp-card-pad-y: 12mm` (diselaraskan dengan geometri Chord Chart agar "preview = kertas").
- Ukuran cetak chord ≈5.4mm, lirik ≈4.3mm (diturunkan dari slider PDF, disimpan per lagu).

### 2.5 Token auth (`styles/auth.css` → `--auth-*`)

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

---

## 3. Tipografi & Font

- **Stack global:** `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (`styles/styles.css` body).
- **Self-hosted variable Inter** (`styles/fonts.css`, `assets/fonts/inter-latin-wght-normal.woff2` ±47KB):
  - `wght 100–900`, `font-display: swap`, family tetap `"Inter"` agar nol perubahan selector.
  - Alasan: tanpa ini macOS jatuh ke San Francisco (variable → chord 850/900 tepat), Windows jatuh ke Segoe UI (statis → bold disintesis, `B♭m/F` terlihat lebih gemuk/sempit). Dengan file ini kedua OS me-render sama.
- **Self-hosted variable Sora** (`assets/fonts/sora-latin-wght-normal.woff2`):
  - `wght 100–800`, `font-display: swap`, family `"Sora"`.
  - Peran: **UI voice** — seluruh chrome editor (topbar, chip, tombol, banner, toast, footer, dialog, popover, panel ChordPro), headline aside login, judul kartu login, tombol primer auth, dan library/dialog. Token `--editor-font` merangkum stack `"Sora", "Inter", system-ui, …`.
  - **Kertas skor tetap Inter**: `#previewCard` / `#cpPreviewCard` adalah dokumen cetak; chord memakai bobot 850/900 dan subset aksidental, dan metriknya bagian dari kontrak PDF. Jangan menerapkan Sora ke dalam kertas.
  - Kode (`.cp-textarea`, `<code>`) tetap monospace.
- **Subset aksidental Noto Serif JP** (`noto-serif-jp-accidentals.woff2` 876-byte, OFL 1.1):
  - `unicode-range: U+266D–266F` pada family `"Inter"` yang sama, `font-weight: 100 900` (dipakai apa adanya, tidak di-faux-bold).
  - Alasan: Inter tidak punya glyph musik; stack serif `Georgia/Times` juga tidak punya ♭/♯ → dulu jatuh ke Hiragino (macOS) vs Segoe UI Symbol (Windows). Subset mincho ini menyatukan bentuk di semua OS.
- **Hierarki existing:**
  - `h1` home/library `34px / letter-spacing -1.35px`; eyebrow `10px / .13em / 800 / green` (`LIVE PREVIEW`, `ARRANGEMENT TOOLS`, `EXPORT SETTINGS`).
  - Judul preview `h2#previewTitle` editable; artist `Created by: <em>`; meta `KEY/TIME/TRANSPOSE/BPM` huruf kecil kapital dengan nilai bold.
  - Chord terpasang `.placed-chord` berat 850/900; angka Nashville dengan dot oktaf + slash coret; lirik kecil di bawah ketuk.
  - Kode inline (`<code>`) memakai `--mono` di how-to dan hint ChordPro.
- **Lisensi:** `assets/fonts/Inter-LICENSE.txt`, `assets/fonts/Sora-LICENSE.txt`, `NotoSerifJP-LICENSE.txt` (OFL 1.1); sumber `@fontsource-variable/inter`, `@fontsource-variable/sora`, `@fontsource/noto-serif-jp`. Font di-precache `sw.js` untuk offline.

---

## 4. App Shell & Layout

### 4.1 Topbar editor (`.topbar`, tinggi 48px)

- **Bingkai (framed sheet):** topbar memakai ground tinted yang sama dengan halaman (`--editor-ground`), tanpa border bawah, tanpa blur/glass, dan tanpa shadow. Halaman di bawahnya adalah bingkai; kertas skor adalah satu-satunya permukaan putih.
- Kiri (`.topbar-nav`): tombol `Back` (ghost, ikon panah SVG) + breadcrumb (`Editing` 11px muted + judul lagu sebagai satu-satunya `h1` halaman, 14px bold) + version switcher (chip ikon copy + label + chevron) + YouTube chip.
- Kanan (`.topbar-actions`): mode badge (glyph notasi mode + teks `Chord Chart / Numeric / ChordPro`), album pill (ikon disc SVG), grup aksi primer (`.topbar-action-group`): `Save to Cloud/Album/Copy` (satu-satunya tombol terisi, hijau) + `Export .pdf` (outline quiet). Grup ini satu flex group agar di phone turun baris bersama, tidak terbelah.
- **Satu keluarga chip:** version switcher, mode badge, album pill, dan YouTube chip berbagi tinggi 28px, border 1px `--editor-line`, radius 8px, background `--editor-surface`, teks 12px. Di tablet (681–1050px) label mode tetap tampil; di phone label mode disembunyikan dan hanya glyph yang tersisa.
- **Mode badge = wajah produk:** glyph notasi asli per mode — `Am7` (Chord Chart), `1̇` (Numeric), `[C]` (ChordPro) — melalui `[data-editor-mode] … .editor-mode-badge-icon::before`; tanpa lingkaran tinted.
- **Save state machine:** dot amber `is-unsaved` (ada), `is-saving`, lalu `is-saved` selama ~1,6 detik (ikon berubah menjadi ✓ dan tone mengendap) setelah simpan sukses. Class ditambahkan oleh `flashSavedState()` di `cloudUI.js`; logika simpan tidak berubah.
- Style: `padding: 0 clamp(12px,2vw,24px)`, latar `--editor-ground`, tipografi Sora (`--editor-font`); semua ikon chrome adalah inline SVG stroke (bukan emoji).

### 4.2 Workspace beat-grid

- Grid: `.workspace` → `330px minmax(0,1fr)`, gap `25px`; `main` max `1440px`, padding `42px max(5vw,24px) 60px`.
- Kiri: `.editor-card` (sticky `top:20px`, radius 18px, border + shadow): heading `ARRANGEMENT TOOLS + active tool`, tombol collapse `⌃`, tab ribbon (`Chord`, `Slash Chord`, `Nashville`, `Rhythm`, `Lyrics` — Alt+1…5), panel per tab.
- Kanan: `.preview-stage` → `.preview-viewport` (scroll horizontal, focusable) → `.preview-card#previewCard`: header (eyebrow + title + artist | meta col: lyrics toggle, KEY, TIME, TRANSPOSE −/+, ▶ + BPM, Undo/Redo), rule divider, `#sectionsPreview`, footer (`Reset Sheet`, `+ Add section`), signature `Generated with Spartio.app`.
- Banner penempatan (`Placing: … — tap a beat`) + `scroll-affordance` (`Scroll to see more →`).

### 4.3 Struktur fallback ChordPro (inline di `index.html`)

Empat aturan struktural ditaruh inline agar swap workspace tidak tergantung stylesheet kedua (tahan 404/cache basi): `.cp-workspace display:none` default; `body[data-editor-mode=chordpro]` menampilkan grid `minmax(330px,40%) minmax(0,1fr)` + menyembunyikan `.ribbon-workspace`, `main > .workspace`, `.preview-stage`; ≤980px jadi satu kolom; print jadi block. `render.js` juga menyetel swap yang sama via inline style (redundansi disengaja).

### 4.4 Footer situs (`.site-footer`)

Identitas (`Spartio.app`, `Built with care by dhandyjoenathan…`), badge `Open source`, catatan gratis. Sengaja dikeluarkan dari kertas (lihat §11).

---

## 5. Komponen UI

### 5.1 Tombol

| Class | Tampilan existing |
|---|---|
| `.button-primary` | Hijau solid (accent), teks `--editor-accent-ink` (aksi utama: New Song/Album, Export di dialog) |
| `.button-ghost` | Latar `--editor-surface`, border 1px `--editor-line`, teks ink (aksi sekunder) |
| `.button-dark` | Varian outline untuk `Export .pdf` di topbar: latar transparan, border garis, teks ink |
| `.button-save` | Tombol save topbar: satu-satunya filled hijau; dot amber saat unsaved; `is-saved` menampilkan ✓ singkat |
| `.button-danger` | Merah (Delete version, Leave) |
| `.button-reset` | Reset Sheet kecil, tanpa border sampai hover |
| `.icon-button` | Kotak ikon 32px; border transparan, muncul saat hover |
| `.history-btn` | Undo/Redo + ikon SVG + label |
| `.play-btn` | `▶` bulat di meta preview |
| `.pdf-choice` | Pilihan segmented (preset + bar numbers) dengan `aria-pressed`; aktif = accent fill |
| `.home-fab-trigger` | Speed-dial `＋` kanan-bawah (tablet/phone) |

Hover chrome editor: perubahan tone/border saja (tanpa `translateY`), transisi `.16s`; shadow resting dihapus. Fokus memakai ring accent 2px (`:focus-visible`) yang sama di topbar, dialog, dan popover.

### 5.2 Ribbon & palet

- Tab: `.ribbon-tab` + `.active`; panel: `.ribbon-panel` + `.active`.
- `Choose root chord` → `.key-picker.chord-root-picker`; `Chord family` → `.chord-bank.chord-family`; custom input + preview.
- Slash builder: 3 select (`root/quality/bass`) + simbol `/` + `+ Add slash chord` + bank.
- Nashville builder: derajat → aksidental → family → kartu `Selected notation` (preview besar + hint).
- Rhythm: `.beat-bank` (pilihan split).
- Lyrics: switch + label `Lyrics off/on` + shortcut guide (`Enter`, `Shift+Enter`, paste). Blok auto-syllable ada di markup tapi dikomentari nonaktif.

### 5.3 Popover & menu

- Chord popover: input + daftar saran + chip `♮ ♯ ♭` (filter) + `Use custom chord` + pesan kosong.
- Beat menu (right-click/long-press): split ½/⅓/¼, `Fermata (hold)…`, hapus subdivisi.
- Fermata editor: input extra beats.
- Section menu `•••`: copy bars range, copy/paste section, reorder, delete.
- Account popover: identitas + theme toggle + Sign out.
- Version popover: daftar versi (mode mark + label) + `＋ New version`.
- Member actions sheet `#memberActionsDialog`: `Make MD / Make member / Remove from album` (ikon SVG).
- **Satu floating surface:** `.account-popover` (termasuk `.version-popover`), `.section-menu-popover`, `.chord-popover`, beat menu, dan fermata editor memakai background `--editor-surface`, border 1px `--editor-line`, radius 12px, dan satu-satunya shadow `--editor-elev`. Item menu memakai padding konsisten; hover = tone step, bukan lift; item destruktif memakai `--editor-danger`.

### 5.4 Dialog (`.confirm-dialog` generik)

Struktur: backdrop + card + ikon + title + desc + actions (`.confirm-dialog-actions-stacked` untuk 3 tombol). **Chrome dialog:** kartu `--editor-surface`, border 1px `--editor-line`, radius 16px, satu shadow `--editor-elev`; backdrop `rgba(9,22,15,.42)`. Ikon dialog adalah container 40px transparan berisi SVG stroke 22px warna accent (bukan emoji, bukan lingkaran tinted). Judul memakai Sora; kicker uppercase dihapus. Varian:

- Mode picker (`#newSongDialog`): input nama versi + 3 `.mode-card` (visual animasi + poin ✓/✗).
- New Version / Version Details / YouTube Link: field nama + field YouTube + thumbnail preview + tombol hapus link + error `That doesn't look like a valid YouTube link`.
- PDF options: dua kolom (preview kertas + panel kontrol), header `PDF options` (tanpa kicker), footer `Reset to defaults + Export PDF`; pane preview tetap menampung node `#previewCard`/`#cpPreviewCard` asli.
- Login bukan modal — full page (lihat §8). Attach Link: textarea + Preview. Unsaved: 3 tombol. How-to: daftar grup + item ikon. Join Album: input kode `ABCD-1234`. New Album: nama + deskripsi. Device-hint phone: kartu tengah + blur backdrop.

### 5.5 Chip, pill, badge

- YouTube chip: satu container dua state (`data-state=link|none`); state link = thumbnail 44×24 + label `▶` + ikon edit SVG; state none = ikon clapper SVG + `No video` (klik untuk tempel). State diganti (bukan `hidden` saja) agar thumbnail basi tak pernah tampil.
- Mode badge: glyph notasi mode + teks di topbar (lihat §4.1).
- Album pill: ikon disc SVG + nama (konteks album).
- Member banner: ikon shield SVG + teks read-only (bukan konten cetak), band `--editor-raised` dengan bar accent 3px di kiri.
- Kartu lagu: badge mode dari versi teratas (`cardMark`), dot amber unsaved.
- Toast (`#toast`, `role=status`): notifikasi ringan, radius 8px, `--editor-elev` (cap tercapai, copy berhasil, dsb).
- **Ikon chrome** memakai set inline SVG stroke 15–18px di dalam `.btn-icon` / `.icon-glyph`; emoji tidak dipakai sebagai ikon UI.

---

## 6. Desain Score Canvas (Beat Grid)

### 6.1 Bar & ketuk

- Section: label box + tools (Chords On/Off khusus Chord Chart, `+ Add 1 bar`, menu). Bar: barline + sel ketuk; nomor bar layar kecil `10px/0.34` (faint, disembunyikan di preview PDF).
- `1/4` = satu ketuk per bar: section digambar sebagai SATU bar kontinu (`body[data-meter="1/4"]` di layar, `@media print`, dan `html.is-print-layout`) — tanpa bar line di antara ketuk, tetapi garis tetap di awal & akhir tiap baris (baris editor = `.bar-batch`, baris cetak = bar yang ditandai `pdf-row-start` / `pdf-row-end` oleh `src/pdf.js`); beat tetap mengalir dengan beat pitch normal, nomor bar disembunyikan, dan editor memakai kosakata "beat" (`+ Add 1 beat`, hapus/salin per beat, caption `1 bar · N beats`). Meter lain tidak tersentuh.
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
- Kiri (`.cp-editor`): head (title + created-by inputs), tools (Transpose −/+, Key select, Time select, Undo/Redo text-btn), daftar `.cp-sections` (satu textarea polos per section + reorder/delete), foot (`＋ Add section` + hint `[brackets] {sov} {soc} {eoc}`). Panel kiri mengikuti chrome editor (`--editor-*`: surface, border 1px, radius 16, tanpa shadow; label 11px sentence case; input radius 8). Semua perubahan panel dibungkus `@media screen` di blok `CHORDPRO EDITOR PANEL`; kertas `.cp-card`, geometri stage, dan aturan print tidak disentuh.
- Kanan (`.cp-stage`): bar (`LIVE PREVIEW` + `Exported to PDF exactly like this`) + scroll + `.cp-card#cpPreviewCard`: head (title + `Created by:` + KEY/TIME), rule, `.cp-score`, signature.
- Render teks: chord inline di atas suku kata (tanpa menabrak lirik); run chord-only diberi trailing padding; whitespace antar bracket dipertahankan; `{soc}` jadi header; `{c:}` jadi komentar; `[Verse 1]` bracket-only jadi label.
- Semua class `cp-`-prefixed; aturan print self-contained dan gate mode; visual memakai aksen emas (gold) khas ChordPro agar beda rasa dari grid hijau.

---

## 8. Desain Home: My Songs & Albums

### 8.1 Login + Register page (`.login-page`, `styles/auth.css`)

Halaman full-screen (bukan modal), satu elemen `#loginPage` membawa **dua
mode** — `data-auth-mode="login" | "register"` — dengan dua `.auth-view`
(`data-auth-view`) yang di-toggle `setAuthMode()` di `src/cloudUI.js`.
Dirender sejak sesi auth belum jelas (`data-authGate=pending`); `?test=`
melewatinya untuk suite otomatis. Seluruh styling di-scope `.login-page`
agar tidak pernah bocor ke app chrome.

**Layout split** (grid `1.1fr 1fr`):

- **Aside brand** (`.login-aside`) — satu-satunya momen brand: panel hijau tua
  flat `--auth-panel`, konten `.login-aside-inner` (max-width 500px agar
  headline selalu ≤2 baris):
  - Motif Nashville oversized `4♯7` (`.login-aside-motif`, Sora 700,
    `clamp(180px, 22vw, 300px)`, opacity 0.07, bleed kanan-atas) — motif
    spesifik subjek, bukan glow generik.
  - Brand lockup telanjang (logo tanpa tile/tinted square), headline Sora
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
auth disembunyikan (rule print-hide di ui.css).

### 8.2 Gallery (`.cloud-gallery.is-home`)

- Arah visual: **score index**, bukan dashboard. Pertanyaan layar adalah lagu atau album mana yang perlu dibuka; koleksi menjadi konten paling dominan. Warna hijau dipakai untuk aksi utama, fokus, dan penanda notasi, bukan sebagai dekorasi di setiap kartu.
- Redraw dari pola `editorial-greeting`: sapaan dan empat tile hitungan akan menunda pekerjaan utama, yaitu mencari/membuka lagu; koleksi adalah data utama dan jumlahnya dapat sangat sedikit.
- Tipografi library dan dialog menggunakan Sora yang sudah dibundel di project; teks kode seperti invite code tetap memakai mono.
- Topbar: brand Spartio, tab `My Songs | Albums` yang selalu terlihat, profil/tema, serta `Back to editor` bila relevan. Judul dan jumlah koleksi berada pada baris konten berikutnya. Aksi konteks: `New Song` + `Attach Link` di My Songs; `New Album` + `Join Album` di Albums.
- My Songs dan Albums memakai daftar vertikal, bukan carousel. Baris lagu memuat judul/artis, versi dan mode, key/meter, serta pembaruan; klik baris membuka lagu. Thumbnail YouTube hanya dipakai bila memang tersimpan, selain itu penanda mode/teks notasi berasal dari data lagu. Aksi sekunder berada di menu `More` yang dapat diakses dengan keyboard dan sentuh.
- Baris album memuat nama, deskripsi, jumlah lagu, pembaruan, serta peran MD/Member. `Edit details` dan hapus hanya tersedia bagi MD. Album detail memakai daftar lagu yang sama; member tetap read-only sesuai aturan produk.
- Hook musik: underline tab tumbuh mengikuti pilihan, simbol mode merespons hover/fokus. Gerak singkat, tanpa entrance; `prefers-reduced-motion` mematikannya.
- Search, state loading, empty, no-results, dan error tetap berada pada panel yang sama. State error menyediakan `Try again`; skeleton mempertahankan tinggi baris dan tidak memakai shimmer.
- Profil menampilkan identitas akun, tema, dan `Sign out`. Sign out tetap meminta konfirmasi; kegagalan menampilkan feedback.
- Popup `New Song` meminta nama aransemen, lalu pilihan mode dengan preview notasi statis dan aksi konfirmasi eksplisit. `Attach Link` memiliki label input, preview, dan penjelasan bahwa payload diproses lokal. `Add from My Songs` menyediakan pencarian, pilihan radio, loading, empty, no-results, dan error state.

### 8.3 Album detail (`.cloud-album`)

- Head berisi `Albums`, judul/deskripsi, meta jumlah lagu dan peran, serta aksi sesuai izin. Di bawahnya ada pencarian dan daftar lagu. Aksi MD: Invite, Members, Add from My Songs, New Song; member dapat Leave, membaca, play, dan export sesuai kontrak PRD.

---

## 9. Dark Theme

- Saklar: `localStorage chordSheetTheme` (light/dark) else `prefers-color-scheme`; `documentElement.dataset.theme + style.colorScheme`; toggle di account popover (`Dark mode`, `aria-pressed`).
- `html[data-theme="dark"]` menulis ulang: body, topbar, tombol ghost/icon, kartu editor, tab ribbon, input/select/lyrics, section title, dialog, how-to code, `cp-card`, preview help, dsb.
- Print tidak ikut dark: aturan gelap di-scope layar (`:not(.is-print-layout)` pada bagian yang perlu) + blok print memaksa tinta kertas (`--print-bar-num-ink` dkk) agar PDF tetap hitam di atas putih.

---

## 10. Responsif

| Band | Desain existing |
|---|---|
| Phone ≤680px | Topbar dua baris dengan tab tetap terlihat; aksi konteks berada dekat judul; daftar menjadi dua baris per item tanpa scroll horizontal paksa; target sentuh ≥44px; modal device-hint sekali per kunjungan |
| Tablet 681–1050px | Daftar memakai metadata yang diringkas per baris; tab dan profil tetap di topbar; aksi album membungkus tanpa menutupi judul; ChordPro satu kolom di bawah 980px |
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
- Baris section tanpa gap vertikal (`row-gap: 0`) → default nomor bar `Line starts` (satu angka bold 3mm per baris, di atas barline, inset 1.3mm, turun 3.5mm dari tepi + clearance 0.5mm) agar tidak terbaca sebagai bagian baris atas. `Every bar` = 2.6mm tiap barline. `Off` = tanpa band cadangan (geometri dasar utuh).
- Barline dikunci ke notasi via `top: calc(50% + (extra-top − extra-bottom)/2)`; band cadangan hanya di baris yang dihitung (`markMidRowBars()` menandai `.pdf-mid-bar`).
- `1/4`: bar line dihapus di antara ketuk (ketiga scope) dan hanya digambar di dua ujung baris — baris editor pakai `:first-child` / `:last-child` dari `.bar-batch`, baris cetak pakai tag `pdf-row-start` / `pdf-row-end` dari `src/pdf.js`; padding bar dikosongkan dan indent 2.6mm pindah ke baris (`--print-row-pad-x`) supaya beat-nya duduk di beat pitch normal, dan nomor bar tidak dicetak.
- Chord-row & beams & lirik mengikuti token §2.3; seleksi, toast, footer, banner, affordance scroll disembunyikan.
- Detektor stylesheet basi: `--chordpro-css-version` vs `CHORDPRO_CSS_VERSION` di `render.js`.

---

## 12. Motion & Interaksi

- Hover chrome editor: tone/border step tanpa `translateY`; transisi `.16s`; kartu hover expand (galeri); beat hover dot/outline; akor hover tint (layar saja).
- Save state machine: `is-unsaved` (dot amber berdenyut) → `is-saving` → `is-saved` (~1,6 detik, ikon ✓ + tone mengendap). Hanya menambah class; `prefers-reduced-motion` mematikan denyut.
- Kartu mode di New Song memakai animasi kecil (chord melayang `C Am F G`, angka `1 4 5 DO`, ChordPro `C Ama- G zing`) — murni CSS, `prefers-reduced-motion: reduce` dihormati.
- Toast + `drop-success` 450ms + purge-reload sekali + `skipWaiting/clients.claim` (PWA update).
- Debounce: ketik ChordPro = satu langkah undo per burst; search gallery live filter.
- Dialog: backdrop blur, kartu tengah, `Esc`/backdrop dismiss (kecuali login page); fokus ke input pertama (nama versi, kode invite).

---

## 13. Ikon, Aset & PWA

- **Favicon / app icon** (`assets/favicon.svg`): rounded square (rx 17/64)
  gradient diagonal hijau `#2b875b → #145b3b` dengan glyph **dua notangga
  bersambung (beamed notes)** — beam + dua stem putih, kepala nota kiri putih,
  kepala nota kanan lime `#b9e654` (spark brand). Unsur musik, tetap terbaca
  di 20px. Dipakai brand lockup (footer, login, galeri) dan tab browser.
- **Maskable** (`assets/icon-maskable.svg`): background full-bleed tanpa
  rounded corner (aman semua bentuk mask), glyph sama diskalakan 0.66 dan
  dipusatkan di safe zone.
- **Raster HD** (disetel dari SVG via `sips`, wajib injeksi
  `width/height="N"` ke salinan SVG): `icon-192/512/1024.png` (any,
  dari favicon), `icon-maskable-512/1024.png` (dari maskable),
  `apple-touch-icon.png` 180px (dari maskable — full-bleed, tanpa transparansi,
  karena iOS tidak menerapkan mask sendiri).
- Manifest `theme_color: #237a50` (senada `--green`) + `background_color:
  #0f1110`, `name: Spartio.app — Chord & Number Score Builder`,
  `short_name: Spartio.app`, `display: standalone`, `orientation: any`,
  kategori `music/productivity/utilities`, `lang: en`. `<meta name="theme-color">`
  di index.html senada.
- Semua path aset relatif (aman di subpath `/spartio-app/`); `.nojekyll` untuk fallback branch. Filename ikon stabil antar build → `sw.js` precache tidak perlu diubah saat regenerasi ikon.
- **Ikon chrome editor:** semua kontrol topbar, dialog, popover, banner, dan how-to memakai inline SVG stroke (`viewBox 0 0 24 24`, `stroke="currentColor"`, `stroke-width="2"`, 15–22px) di dalam `.btn-icon` / `.icon-glyph`; pola yang sama dipakai tombol album di home. Emoji tidak dipakai sebagai ikon UI. Glyph notasi asli (`♯ ♭ ▶ 1̇`) tetap dipertahankan karena bagian dari bahasa musik, bukan ornamen.
- Set glyph yang masih dipakai sebagai teks/simbol notasi: `♭ ♯ ♮ ▶ − + × ⌘` (contoh di hint dan score), plus glyph mode badge; di luar itu chrome memakai SVG.

---

## 14. Aksesibilitas

- Peran & label: `role=dialog aria-modal`, `role=tab/tabpanel/menu/menuitemradio`, `aria-pressed/selected/expanded/checked`, `aria-live=polite` (toast, banner, placing), `aria-label` viewport & kontrol ikon.
- Keyboard: Alt+1…5 tab ribbon; `⌘Z/Ctrl+Z`, `⌘⇧Z/Ctrl+Shift+Z`; Enter/Shift+Enter lirik; Tab antar sel chord; Esc batal; `?test=` melewati auth gate untuk suite.
- Kontras belum diaudit menyeluruh. `--muted` (`#718078`) pada `--cream` (`#fcfbf5`) sekitar 4.00:1 dan pada putih sekitar 4.15:1, di bawah 4.5:1 untuk teks normal. Pasangan lain di atas adalah deskripsi palet, bukan bukti lulus WCAG; verifikasi ukuran teks, opacity, tema, dan latar aktual sebelum membuat klaim kepatuhan.
- Gerak: `prefers-reduced-motion` menonaktifkan animasi kartu mode.
- Screen reader: nilai ♯/♭ tetap di DOM tersembunyi; dot oktaf + slash coret adalah visual (nilaiEditable tetap terbaca sebagai `♭1̇` dsb).

---

## 15. Konvensi & Batasan Desain

1. Jangan pakai nama class non-`cp-` di workspace ChordPro (geometri print grid tidak id-scoped).
2. Jangan tambah lebar pada token Nashville (slash harus absolute) — pengukuran PDF mengandalkan lebar render.
3. Setiap overlay chrome baru wajib masuk blok print-hide `ui.css` (preseden: `.album-banner`, `.scroll-affordance`, `.site-footer`, `.toast`, ring seleksi).
4. Jangan ubah fallback inline ChordPro di `index.html` tanpa mengubah juga `render.js` (keduanya redundan disengaja).
5. Token versi (`__BUILD__`, `--chordpro-css-version`) wajib ikut injeksi deploy; file baru tanpa placeholder harus ditangani agar tak lolos sebagai aset unversioned.
6. Perubahan ejaan transpose / alias kualitas harus lewat `spellPitch` / `normalizeQuality` (sumber tunggal) agar popover, skor, dan audio tidak bercabang.
7. Member readonly memakai 3 lapis (dataset + handler + CSS); kontrol mutasi baru di luar preview harus ditambah ke selector `body[data-member-readonly="1"]`.
8. Jangan menyebut kontras atau aksesibilitas sebagai telah memenuhi WCAG berdasarkan inspeksi visual saja. Uji rasio warna dan alur keyboard pada komponen yang terdampak.

---

## Lampiran — Peta File Desain

| File | Isi desain |
|---|---|
| `styles/styles.css` (1 baris, minified) | Tokens inti + shell dasar (topbar 76px, workspace grid, kartu, tombol dasar). Catatan: file ini network-first (tanpa `?v=`) |
| `styles/ui.css` | Shell app, ribbon, dialog, gallery, album, FAB, dark theme, responsif, print-hide chrome. Blok terakhir `EDITOR CHROME REFRESH — framed sheet` menampung token `--editor-*` dan seluruh chrome editor (screen-only) |
| `styles/preview.css` | Score canvas + geometri print/PDF (`@media print` + `is-print-layout`), beat, beam, Nashville, chord-row, bar numbers |
| `styles/chordpro.css` | Workspace ChordPro + print-nya, self-contained |
| `styles/auth.css` | Login + Register (`--auth-*`, split panel, borderless fields), semua di-scope `.login-page` |
| `styles/fonts.css` | Inter variable + subset Noto Serif JP ♭/♯ + Sora variable (display auth) |
| `index.html` `<style>` inline | Fallback struktural ChordPro (anti-404/cache basi) |
| `assets/favicon.svg`, `icon-*.png`, `icon-maskable.*`, `apple-touch-icon.png` | Brand + PWA icons (beamed notes, hijau gradient + lime) |
| `assets/fonts/*.woff2` + `*-LICENSE.txt` | Inter latin + Sora latin + Noto JP accidentals (OFL 1.1) |
| `manifest.webmanifest` | Nama, display standalone, kategori, ikon |

---

*Dokumen ini hanya memotret desain existing. Setiap perubahan visual harus memperbarui file styles terkait + (bila memengaruhi kertas) blok `print`/`is-print-layout` + dialog preview agar ketiganya tetap identik.*
