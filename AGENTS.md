# Spartio.app — Panduan AI Agent

> **Project**: Spartio.app (Chord & Number Score Builder)  
> **Repo**: `chord-sheet`  
> **Stack**: Vanilla ES Modules (tanpa build step), Firebase Auth + Firestore, Service Worker PWA, deploy GitHub Pages  
> **Bahasa**: JavaScript (ESM), CSS custom properties, HTML  
> **Dok**: `docs/PRD.md`, `docs/DESIGN.md`, `docs/ALBUM-FEATURE.md`, `docs/FIREBASE-SETUP.md`, `README.md`

---

## Cara Kerja Agent

Gunakan aturan ini untuk setiap tugas di repo:

1. **Pahami kondisi repo sebelum mengedit.** Periksa `git status`, baca kode dan tes yang terkait, lalu pertahankan perubahan pengguna yang sudah ada.
2. **Jaga scope.** Kerjakan permintaan yang diberikan, jangan menambah fitur, dependensi, build step, backend, atau refactor luas tanpa kebutuhan yang jelas.
3. **Tangani ambiguitas seperlunya.** Tanyakan hal yang dapat mengubah hasil atau risikonya. Untuk detail berisiko rendah, nyatakan asumsi dan lanjutkan.
4. **Rencanakan perubahan lintas modul atau berisiko.** Sebutkan pendekatan dan kriteria selesai secara singkat sebelum mengubah banyak area.
5. **Ikuti sumber kebenaran.** Perilaku aktual ditentukan oleh kode dan tes; kontrak Firebase oleh `docs/FIREBASE-SETUP.md`; arah visual oleh `docs/DESIGN.md`; kebutuhan produk oleh `docs/PRD.md`.
6. **Verifikasi sesuai dampak.** Jalankan tes yang relevan. Untuk perubahan UI, cek state penting, tema, ukuran layar, keyboard, dan browser bila tersedia. Jangan menyatakan pemeriksaan berhasil bila belum dijalankan.
7. **Jaga keamanan dan data.** Validasi input impor, jangan menaruh secret di client, dan jangan menganggap guard UI sebagai pengganti Firestore Rules.
8. **Jangan lakukan operasi destruktif tanpa izin.** Jangan reset/revert perubahan pengguna atau menghapus file di luar scope permintaan.
9. **Untuk perubahan visual**, ikuti `docs/DESIGN.md`. Jangan membuat logo, ilustrasi, foto, atau aset baru tanpa arahan; gunakan placeholder yang jelas bila perlu.

Selesai berarti perilaku yang diminta sudah diterapkan, pemeriksaan relevan dijalankan atau batasannya dijelaskan, dan laporan menyebut file yang berubah serta hasil tes. Jangan memperluas scope hanya untuk merapikan hal yang tidak terkait.

---

## 1. Model Mental Cepat

Spartio adalah **PWA statis** untuk menulis chord chart & notasi angka (Nashville + not-angka Indonesia). Tiga mode penulisan per aransemen:

| Mode | Apa itu | Karakteristik kunci |
|------|---------|---------------------|
| **Chord Chart** | Grid ketuk + chord | Grid bar/ketuk, drag-drop chord, subdivisi ritme ½/⅓/¼ (nested 2 level), chord-row di atas angka |
| **Numeric Notation** | Derajat 1–7 + titik oktaf + ♯/♭ | Grid yang sama, angka menggantikan chord, "coret" `/` (naik) dan `\` (turun) untuk setengah langkah |
| **ChordPro** | Lirik + `[chord]` inline | Textarea polos per section, live preview, tanpa notasi ritme |

**Satu lagu = banyak versi** (tiap versi punya mode + link YouTube sendiri).  
**Cloud** (opsional): library pribadi (`My Songs`) + **Albums** bersama (invite-code, MD = owner, member read-only).

---

## 2. Arsitektur & Graf Modul (Acyclic)

```
notation.js  ←  store.js  ←  render.js  ←  events.js  ←  app.js
    ↑                                                                 |
    └────────────────── chordPro.js ─────────────────────────────────┘
    ↑                                                                 |
    └────────────────── playback.js ────────────────────────────────┘
    ↑                                                                 |
    └────────────────── chordBank.js ────────────────────────────────┘
    ↑                                                                 |
    └────────────────── youtube.js ──────────────────────────────────┘
```

| Modul | Tanggung jawab | Bergantung pada |
|--------|---------------|-----------------|
| `notation/notation.js` | Logika musik murni (transpose, section, bar, grammar Nashville, batasan) | — |
| `notation/chordPro.js` | Parse/transpose/normalize ChordPro (tanpa DOM) | notation |
| `notation/chordBank.js` | Saran chord/Nashville dan normalisasi kualitas | notation |
| `core/dom.js` | Helper tipis (`$`, `toast`, `prefersTap`) | — |
| `core/store.js` | Single source of truth + seleksi palet | notation |
| `core/clipboard.js` | Clipboard in-memory untuk section/bar | — |
| `core/history.js` | Undo/redo stack | — |
| `render/render.js` | Bangun HTML skor → DOM | notation, core, chordPro, util/youtube |
| `render/chordProEditor.js` | UI workspace ChordPro (panel + sections) | core, notation |
| `events.js` | Seluruh interaksi, listener, import/export, bootstrap | notation, render, editor, playback, pdf, cloud, util, ... |
| `app.js` | Entry point (`initEvents()`) | events |
| `cloud.js` | Facade stabil untuk API cloud | cloud/data/* |
| `cloud/data/runtime.js` | Singleton Firebase SDK, sesi auth, guard user | firebase-config |
| `cloud/data/auth.js` | API sign-in, sign-out, status auth | cloud/data/runtime |
| `cloud/data/songs.js` | Firestore My Songs dan versions | cloud/data/runtime, notation |
| `cloud/data/albums.js` | Firestore albums, invites, members | cloud/data/runtime, cloud/data/songs |
| `cloudUI.js` | Facade stabil untuk UI cloud | cloud/ui/controller |
| `cloud/ui/controller.js` | Composition root cloud UI; route, bridge, dan koordinasi screen | cloud facade, dom, notation |
| `cloud/ui/{auth,dialogs,gallery,album,markup,state}.js` | UI per concern dan helper presentasi cloud | dom, notation, cloud facade |
| `editor/bindings/{preview,controls}.js` | Listener preview dan kontrol dengan callback injection | dom, store, notation, render, PDF |
| `pdf/pdf.js` | Pipeline ekspor PDF (`PDF_PAPER_MM` — kertas A4 saja) | core, notation |
| `pdf/pdfOptions.js` | Modal opsi PDF (kertas terkunci A4 + margin narrow) | pdf.js |
| `playback/playback.js` / `synth.js` / `sampleCache.js` | Audio piano + voicing + cache sampel (IndexedDB) | notation, core |
| `editor/chordEditor.js` / `beatMenu.js` / `fermataEditor.js` | Palet, editor, menu | notation, core, render |
| `util/share.js` / `youtube.js` / `identity.js` | Share-link, parse YouTube, nama member | beragam |

**Aturan kritis**: `render.js` tidak pernah import `events.js` — hook disuntik via `initRender()`. `cloud/ui/controller.js` bicara ke Firebase hanya lewat facade `cloud.js` dan ke editor lewat bridge, tidak pernah import `events.js`. `editor/bindings/*` menerima callback dari `events.js` dan tidak mengimpor modul tersebut. `chordProEditor` sama (via `initChordProEditor()`) — dan **tidak** import `chordPro.js`.

---

## 3. Invariant & Konvensi Kunci (Jangan Dirombak Sembarangan)

1. **Single source of truth per domain**
   - `normalizeQuality()` (`src/notation/chordBank.js`) — pemetaan alias kualitas chord
   - `NASHVILLE_TOKEN_RE` (`src/notation/notation.js`) — satu regex untuk saran, renderer, playback
   - `NASHVILLE_OCTAVE_UP` / `NASHVILLE_OCTAVE_DOWN` (`src/notation/notation.js`) — combining dot oktaf atas/bawah
   - `QUALITY_INTERVALS` (`src/playback/playback.js`) — tabel voicing
   - `spellPitch` / `transposeKeyName` (`src/notation/notation.js`) — standar ejaan

2. **Token Nashville**: `[♭#♯]?[0-7][̣̇]?(.*)` — aksidental, derajat, titik oktaf (combining), kualitas. `0` = rest (bisu, sengaja). ASCII `b` hanya alias ketik, **disimpan sebagai `♭`**. `foldNashvilleKey()` (`src/notation/chordBank.js`) sengaja membiarkan `b7` terbaca sebagai chord huruf (B7); jangan ubah perilaku ini tanpa memahami alasannya. Aksidental diterapkan ke MIDI final **setelah** oktaf (agar `♭1` di C berbunyi B3 di bawah tonika, bukan B4).

3. **Setengah langkah Nashville (naik ½ / turun ½)**: chip `♮ ♯ ♭` di `chordEditor.js` dan palet Nashville bekerja sebagai **filter keluarga** daftar saran (bukan campuran); aksidental ikut tersimpan di token (`nashvilleAccidental`) serta ikut playback, transpose, dan PDF.

4. **Standar ejaan transpose** (3 aturan, diimplementasi di `notation.js`):
   - Kunci target menentukan sisi (kres vs mol). Tie (F♯/G♭) → pertahankan sisi milik chart sendiri.
   - Di luar kunci → default terbaca (`C♯/E♭/F♯/A♭/B♭` pada sisi kres/netral).
   - Bass slash yang merupakan nada chord mengikuti derajat chord (`D/F♯ → E/G♯`).

5. **Chord row di atas angka** (hanya Chord Chart):
   - Per-section (`section.chordAboveEnabled`), tidak ada saklar global.
   - Print: grid track zero-height, offset relative, ukuran chord 90%, gap baris 6mm.
   - Ketuk tersubdivisi dicetak sebagai SATU grid (`max-content` + `space-around`).

6. **Beam bersarang (nested)**: `nested-beat-group` / `nested-sub-beat` (`src/render/render.js`, `styles/score/preview.css`) — beam ½ bersarang menggantung 5px di bawah beam utama di phone. Hati-hati mengubah geometri ini; terkait pengukuran PDF.

7. **Paritas cetak** — tiga scope harus identik:
   - `@media print` (PDF sungguhan)
   - `html.is-print-layout` (preview PDF di layar)
   - Pane live di dialog PDF options (menampung `#previewCard` asli)

8. **Setiap overlay shell baru** wajib ditambahkan ke blok print-hide di `styles/base/print.css` (preseden: `.album-banner`, `.scroll-affordance`, `.site-footer`, `.toast`, ring seleksi).

9. **Read-only (member album + phone)** ditegakkan 3 lapis (semua harus sepakat):
   - `document.body.dataset.memberReadonly = "1"` (cloudUI) untuk member; `phoneViewOnly()` untuk semua pengguna phone
   - Guard **`blockedForEdit()`** di `src/events.js` sebagai pemeriksaan awal setiap handler mutasi. Helper ini memblokir member album **dan** pengguna phone.
   - CSS `body[data-member-readonly="1"]` meredupkan/menonaktifkan kontrol
   - Handler mutasi baru **wajib** memanggil `blockedForEdit()`.
   - Affordance DOM (disable tombol preview, readonly field) diatur `applyReadOnlyAffordances()` di **events.js** (bukan render.js).

10. **Arah simpan album** — diselesaikan berlapis: cloud context → memo `activeAlbumCtx` → URL. Assertion melempar error bila simpan album nyasar ke My Songs.

11. **Stamping versi** — semua string versi di repo adalah `__BUILD__`. Deploy workflow menggantinya dengan `r<run>-<sha7>` dalam SATU pass (sw.js, index.html, chordpro.css via `--chordpro-css-version`, semua `?v=`). Workflow **gagal** bila placeholder tidak ditemukan atau masih bersisa. Unit test memeriksa konsistensi (dijalankan dua kali: repo + artifact ter-stage). **File aset baru wajib memakai `?v=__BUILD__`.**

12. **Mode editor**: `editorModeMeta` di `src/notation/notation.js` — `chords`, `numbers`, `chordpro`. `normalizeEditorMode()` fallback ke `"chords"` untuk mode tak dikenal/legacy; jangan hapus fallback ini karena data lama bergantung padanya.

13. **Chrome editor = framed sheet**: token `--editor-*` + blok `EDITOR CHROME REFRESH` di `styles/components/editor-chrome.css`, semuanya dibungkus `@media screen`. Chrome memakai Sora (`--editor-font`); kertas skor tetap Inter + subset aksidental (kontrak PDF), dan kode tetap mono. Jangan memakai emoji sebagai ikon UI — pakai inline SVG stroke di `.btn-icon`/`.icon-glyph` (pola tombol album). Save memakai satu-satunya fill accent; Export outline. Kertas (`#previewCard`) dan seluruh print rule tetap di luar scope perubahan chrome.

---

## 4. Alur Kerja Development

### Dev lokal
```bash
python3 -m http.server 4173
# buka http://127.0.0.1:4173/
```

**Gotcha**: Service worker meng-cache aset `?v=__BUILD__` cache-first. Setelah mengedit stylesheet/modul, reload pertama masih menyajikan salinan LAMA. Solusi: buka `http://127.0.0.1:4173/?reset=1` sekali — purge cache, unregister SW, reload bersih.

### Testing
```bash
# Instal tooling sekali
npm install
npx playwright install chromium

# Unit test (logika murni, tanpa browser)
npm run test:unit

# Test playback (kontrak audio: voicing, oktaf, queue, fermata)
npm run test:playback

# E2E Playwright (Chromium)
npm run test:e2e
# Server statis otomatis di 127.0.0.1:4175. Mode ?test= hanya aktif di
# localhost/127.0.0.1/::1; jangan longgarkan guard ini.
```

### Deploy
```bash
git push origin master
# GitHub Actions menjalankan unit + playback + E2E, stamp __BUILD__, deploy ke Pages
```
- Source Pages **harus** "GitHub Actions" (Settings → Pages).
- Firebase Authorized Domains: `localhost`, `127.0.0.1`, `dhandyjoe.github.io`.
- Rules Firestore dari `docs/FIREBASE-SETUP.md` wajib sudah dipublish.

---

## 5. Persistensi & Cloud Data

Setup dan rules Firebase ada di `docs/FIREBASE-SETUP.md`; ringkasan model produk ada di `docs/PRD.md` §10. Untuk field yang benar-benar diserialisasi, periksa `projectData()` dan operasi cloud di `src/`. Jangan menyalin skema lengkap ke panduan ini.

- Data personal berada di bawah `users/{uid}` dan dibatasi oleh Firestore Rules.
- Lagu album adalah salinan mandiri, bukan referensi ke My Songs. Penyalinan aransemen harus all-or-nothing.
- Arah simpan album dilindungi oleh cloud context, memo `activeAlbumCtx`, URL, dan assertion. Jangan melemahkan pemeriksaan ini.
- Ringkasan `latest*` ditulis lewat `writeLatestMeta()` di `src/cloud.js`.

---

## 6. Tugas Umum untuk Agent

### Menambah handler mutasi baru (mis. aksi chord baru)
1. Tambah handler di `events.js`
2. **Baris pertama**: `if (blockedForEdit()) return;`
3. Panggil `save()` di akhir (tandai dirty, catat history)
4. Panggil `renderPreview()` / `renderControls()` sesuai kebutuhan
5. Tambah affordance CSS di `applyReadOnlyAffordances()` (events.js) bila memengaruhi tombol preview
6. Tambah rule print-hide di `styles/base/print.css` bila membuat chrome baru

### Menambah fitur yang memengaruhi cetak
1. Update token di `styles/score/preview.css` (atau `chordpro.css` untuk ChordPro)
2. Update rule `@media print` DAN `html.is-print-layout` (kedua scope)
3. Update preview dialog PDF options (pane menampung `#previewCard` asli)
4. Jalankan regression test untuk memverifikasi geometri

### Mengubah transpose / ejaan
- Hanya sentuh `notation.js`: `transposeNote`, `transposeChord`, `transposeKeyName`, `spellPitch`, dan `normalizeQuality` (chordBank.js)
- Jalankan unit test — mereka menyapu setiap kunci × setiap shift mencari ejaan tak terbaca

### Menambah mode editor baru
1. Tambah mode ke `editorModeMeta` di `notation.js`
2. Tambah kartu mode di dialog New Song (`index.html`)
3. Tambah struktur workspace di `index.html` (gate dengan `body[data-editor-mode="..."]`)
4. Tambah CSS di `styles/<mode>.css` (selector berprefiks, rule print mandiri)
5. Sambungkan di `events.js` + hook `render.js`

### Menambah fermata / edit ketuk
- Editor fermata per-beat: `src/editor/fermataEditor.js` (`openFermataEditor({anchor, initialValue, onCommit})`, `closeFermataEditor`, `isFermataEditorOpen`); nilai disimpan di `beat.fermata` melalui `fermataValue()` di `src/notation/notation.js`; batas `MAX_FERMATA = 32`. Playback-only, skor/PDF hanya menampilkan glyph + headroom.

---

## 7. Peta File untuk Navigasi Cepat

| Area | File |
|------|------|
| **Entry & bootstrap** | `app.js`, `events.js` (initEvents) |
| **State & palet** | `core/store.js`, `core/clipboard.js`, `core/history.js` |
| **Logika notasi murni** | `notation/notation.js` |
| **Parser ChordPro** | `notation/chordPro.js`, `notation/chordBank.js` |
| **Render (DOM)** | `render/render.js`, `render/chordProEditor.js` |
| **Interaksi** | `events.js`, `editor/bindings/*`, `editor/chordEditor.js`, `editor/beatMenu.js`, `editor/fermataEditor.js` |
| **PDF** | `pdf/pdf.js`, `pdf/pdfOptions.js` |
| **Playback** | `playback/playback.js`, `playback/synth.js`, `playback/sampleCache.js` |
| **Util** | `util/share.js`, `util/youtube.js`, `util/identity.js` |
| **Cloud / Auth** | `cloud.js` facade, `cloud/data/*`, `cloud/ui/*`, `firebase-config.js` |
| **Albums** | `cloud/ui/album.js`, `cloud/ui/controller.js`, `cloud/data/albums.js`, `docs/ALBUM-FEATURE.md` |
| **Styles** | `styles/base/tokens.css` (legacy tokens), `styles/base/fonts.css`, `styles/base/print.css` (print-hide), `styles/layout/shell.css` (shell, canvas, dialogs), `styles/layout/responsive.css` (responsive shell), `styles/components/editor.css` (popovers, menus, PDF options), `styles/components/editor-chrome.css` (`EDITOR CHROME REFRESH`), `styles/components/gallery.css` (auth, gallery, FAB), `styles/components/album.css` (album), `styles/components/library.css` (library skeletons + rows), `styles/components/library-desktop.css` (desktop index + dialogs), `styles/themes/dark.css` (dark theme), `styles/score/preview.css` (score screen), `styles/score/preview-print.css` (print parity), `styles/score/chordpro.css` (ChordPro), `styles/pages/auth.css` (login/register) |
| **PWA** | `sw.js`, `manifest.webmanifest` |
| **Deploy** | `.github/workflows/deploy.yml` |
| **Tests** | `tests/unit.test.mjs`, `tests/playback.test.mjs`, `tests/e2e/*.spec.mjs`, `tests/e2e/server.mjs`, `tests/e2e/fixtures/*` |

*(Modul JavaScript berada di `src/` dan stylesheet di `styles/`. Token legacy ada di `styles/base/tokens.css`, bukan di root repo.)*

---

## 8. Tips Debugging

- **CSS/JS basi setelah edit**: `/?reset=1` (purge cache SW)
- **Preview layout print**: buka dialog Export PDF → `html.is-print-layout` aktif
- **Style ChordPro tidak termuat**: cek console untuk toast "ChordPro styles didn't load / out of date" — detector di `src/render/render.js` membandingkan token `--chordpro-css-version` dari `styles/score/chordpro.css`; bila SW menyajikan CSS lama, token tidak cocok
- **Versi tidak cocok**: view source → cari `__WNS_BUILD__` — harusnya `rXX-abcdefg`, bukan `__BUILD__`
- **Error permission Firestore**: cek rules sudah dideploy (`docs/FIREBASE-SETUP.md`), authorized domains
- **Simpan album nyasar ke My Songs**: cek `currentCloudContext` di `events.js` — field album harus selamat dari normalisasi `setCloudContext`

---

## 9. Fungsi Kunci yang Perlu Diketahui

| Fungsi | Modul | Tujuan |
|--------|-------|--------|
| `projectData()` | `src/events.js` | Dokumen serializable untuk penyimpanan dan ekspor |
| `save()` | `src/events.js` | Chokepoint setelah edit (history + dirty flag) |
| `blockedForEdit()` | `src/events.js` | Guard untuk member read-only dan phone view-only |
| `applyReadOnlyAffordances()` | `src/events.js` | Nonaktifkan kontrol dan set field read-only sesuai konteks |
| `setCloudContext()` | `src/events.js` | Normalisasi cloud context, termasuk konteks album |
| `normalizeQuality()` | `src/notation/chordBank.js` | Pemetaan kualitas kanonik (alias → kanonik) |
| `foldNashvilleKey()` | `src/notation/chordBank.js` | Alias ketik ASCII → token kanonik (`b` → `♭`; `b7` tetap chord huruf) |
| `transposeChord()` | `src/notation/notation.js` | Transpose dengan standar ejaan |
| `fermataValue()` | `src/notation/notation.js` | Baca/set fermata per-beat (`beat.fermata`) |
| `markMidRowBars()` | `src/pdf/pdf.js` | Tandai bar untuk geometri nomor bar (print) |
| `writeLatestMeta()` | `src/cloud/data/songs.js` | Tulis ringkasan `latest*` ke dokumen lagu |
| `initRender(hooks)` | `src/render/render.js` | Suntik hook event binding, menjaga graf tetap acyclic |

---

## 10. Bila Ragu

- **Baca PRD** (`docs/PRD.md`) — spec As-Is berbahasa Indonesia dengan kriteria penerimaan
- **Baca DESIGN doc** (`docs/DESIGN.md`) — tokens, komponen, rule print, konvensi (juga berbahasa Indonesia)
- **Cek unit test** (`tests/unit.test.mjs`) — mereka mengodekan kontrak
- **Cari preseden** — mis. rule print-hide baru → grep `.album-banner` di `styles/base/print.css`

---

*Panduan ini mencerminkan codebase per commit terkini. Perbarui saat konvensi berubah.*
