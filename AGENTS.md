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
| `notation.js` | Logika musik murni (transpose, section, bar, grammar Nashville, batasan) | — |
| `chordPro.js` | Parse/transpose/normalize ChordPro (tanpa DOM) | notation |
| `dom.js` | Helper tipis (`$`, `toast`, `prefersTap`) | — |
| `store.js` | Single source of truth + seleksi palet | notation |
| `render.js` | Bangun HTML skor → DOM | notation, dom, store, chordPro, youtube |
| `chordProEditor.js` | UI workspace ChordPro (panel + sections) | dom, store, notation |
| `events.js` | Seluruh interaksi, listener, import/export, bootstrap | notation, chordPro, dom, store, render, chordProEditor, playback, pdf, cloud, ... |
| `app.js` | Entry point (`initEvents()`) | events |
| `cloud.js` | Wrapper Firebase (lazy auth + Firestore) | firebase-config, notation |
| `cloudUI.js` | Modal login + home My Songs/Albums + UI album | cloud, dom, identity, notation |
| `pdf.js` | Pipeline ekspor PDF (`PDF_PAPER_MM` — kertas A4 saja) | dom, notation |
| `pdfOptions.js` | Modal opsi PDF (kertas terkunci A4 + margin narrow) | pdf.js |
| `playback.js` / `synth.js` / `sampleCache.js` | Audio piano + voicing + cache sampel (IndexedDB) | chordBank, notation |
| `chordBank.js` / `chordEditor.js` / `beatMenu.js` / `fermataEditor.js` | Palet, editor, menu | notation, store |
| `history.js` / `clipboard.js` / `share.js` / `youtube.js` / `identity.js` | Undo, clipboard, share-link, parse YouTube, nama member | beragam |

**Aturan kritis**: `render.js` tidak pernah import `events.js` — hook disuntik via `initRender()`. `cloudUI` bicara ke Firebase hanya lewat `cloud.js`, tidak pernah import `events.js`. `chordProEditor` sama (via `initChordProEditor()`) — dan **tidak** import `chordPro.js`.

---

## 3. Invariant & Konvensi Kunci (Jangan Dirombak Sembarangan)

1. **Single source of truth per domain**
   - `normalizeQuality()` (`src/chordBank.js`) — pemetaan alias kualitas chord
   - `NASHVILLE_TOKEN_RE` (`src/notation.js`) — satu regex untuk saran, renderer, playback
   - `NASHVILLE_OCTAVE_UP` / `NASHVILLE_OCTAVE_DOWN` (`src/notation.js`) — combining dot oktaf atas/bawah
   - `QUALITY_INTERVALS` (`src/playback.js`) — tabel voicing
   - `spellPitch` / `transposeKeyName` (`src/notation.js`) — standar ejaan

2. **Token Nashville**: `[♭#♯]?[0-7][̣̇]?(.*)` — aksidental, derajat, titik oktaf (combining), kualitas. `0` = rest (bisu, sengaja). ASCII `b` hanya alias ketik, **disimpan sebagai `♭`**. `foldNashvilleKey()` (`src/chordBank.js`) sengaja membiarkan `b7` terbaca sebagai chord huruf (B7); jangan ubah perilaku ini tanpa memahami alasannya. Aksidental diterapkan ke MIDI final **setelah** oktaf (agar `♭1` di C berbunyi B3 di bawah tonika, bukan B4).

3. **Setengah langkah Nashville (naik ½ / turun ½)**: chip `♮ ♯ ♭` di `chordEditor.js` dan palet Nashville bekerja sebagai **filter keluarga** daftar saran (bukan campuran); aksidental ikut tersimpan di token (`nashvilleAccidental`) serta ikut playback, transpose, dan PDF.

4. **Standar ejaan transpose** (3 aturan, diimplementasi di `notation.js`):
   - Kunci target menentukan sisi (kres vs mol). Tie (F♯/G♭) → pertahankan sisi milik chart sendiri.
   - Di luar kunci → default terbaca (`C♯/E♭/F♯/A♭/B♭` pada sisi kres/netral).
   - Bass slash yang merupakan nada chord mengikuti derajat chord (`D/F♯ → E/G♯`).

5. **Chord row di atas angka** (hanya Chord Chart):
   - Per-section (`section.chordAboveEnabled`), tidak ada saklar global.
   - Print: grid track zero-height, offset relative, ukuran chord 90%, gap baris 6mm.
   - Ketuk tersubdivisi dicetak sebagai SATU grid (`max-content` + `space-around`).

6. **Beam bersarang (nested)**: `nested-beat-group` / `nested-sub-beat` (`src/render.js`, `styles/preview.css`) — beam ½ bersarang menggantung 5px di bawah beam utama di phone. Hati-hati mengubah geometri ini; terkait pengukuran PDF.

7. **Paritas cetak** — tiga scope harus identik:
   - `@media print` (PDF sungguhan)
   - `html.is-print-layout` (preview PDF di layar)
   - Pane live di dialog PDF options (menampung `#previewCard` asli)

8. **Setiap overlay shell baru** wajib ditambahkan ke blok print-hide di `styles/ui.css` (preseden: `.album-banner`, `.scroll-affordance`, `.site-footer`, `.toast`, ring seleksi).

9. **Read-only (member album + phone)** ditegakkan 3 lapis (semua harus sepakat):
   - `document.body.dataset.memberReadonly = "1"` (cloudUI) untuk member; `phoneViewOnly()` untuk semua pengguna phone
   - Guard **`blockedForEdit()`** di `src/events.js` sebagai pemeriksaan awal setiap handler mutasi. Helper ini memblokir member album **dan** pengguna phone.
   - CSS `body[data-member-readonly="1"]` meredupkan/menonaktifkan kontrol
   - Handler mutasi baru **wajib** memanggil `blockedForEdit()`.
   - Affordance DOM (disable tombol preview, readonly field) diatur `applyReadOnlyAffordances()` di **events.js** (bukan render.js).

10. **Arah simpan album** — diselesaikan berlapis: cloud context → memo `activeAlbumCtx` → URL. Assertion melempar error bila simpan album nyasar ke My Songs.

11. **Stamping versi** — semua string versi di repo adalah `__BUILD__`. Deploy workflow menggantinya dengan `r<run>-<sha7>` dalam SATU pass (sw.js, index.html, chordpro.css via `--chordpro-css-version`, semua `?v=`). Workflow **gagal** bila placeholder tidak ditemukan atau masih bersisa. Unit test memeriksa konsistensi (dijalankan dua kali: repo + artifact ter-stage). **File aset baru wajib memakai `?v=__BUILD__`.**

12. **Mode editor**: `editorModeMeta` di `src/notation.js` — `chords`, `numbers`, `chordpro`. `normalizeEditorMode()` fallback ke `"chords"` untuk mode tak dikenal/legacy; jangan hapus fallback ini karena data lama bergantung padanya.

13. **Chrome editor = framed sheet**: token `--editor-*` + blok `EDITOR CHROME REFRESH` di akhir `ui.css`, semuanya dibungkus `@media screen`. Chrome memakai Sora (`--editor-font`); kertas skor tetap Inter + subset aksidental (kontrak PDF), dan kode tetap mono. Jangan memakai emoji sebagai ikon UI — pakai inline SVG stroke di `.btn-icon`/`.icon-glyph` (pola tombol album). Save memakai satu-satunya fill accent; Export outline. Kertas (`#previewCard`) dan seluruh print rule tetap di luar scope perubahan chrome.

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
# Unit test (logika murni, tanpa browser)
node --test tests/unit.test.mjs

# Test playback (kontrak audio: voicing, oktaf, queue, fermata)
node --test tests/playback.test.mjs

# Test regresi (geometri layout/print — butuh Chrome remote debugging)
# Terminal 1: python3 -m http.server 4173
# Terminal 2: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9223
# Terminal 3: node tests/regression.mjs   (port bisa dioverride via CDP_PORT)
```

### Deploy
```bash
git push origin master
# GitHub Actions menjalankan unit test (dua kali), stamp __BUILD__, deploy ke Pages
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
6. Tambah rule print-hide di `styles/ui.css` bila membuat chrome baru

### Menambah fitur yang memengaruhi cetak
1. Update token di `styles/preview.css` (atau `chordpro.css` untuk ChordPro)
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
- Editor fermata per-beat: `src/fermataEditor.js` (`openFermataEditor({anchor, initialValue, onCommit})`, `closeFermataEditor`, `isFermataEditorOpen`); nilai disimpan di `beat.fermata` melalui `fermataValue()` di `src/notation.js`; batas `MAX_FERMATA = 32`. Playback-only, skor/PDF hanya menampilkan glyph + headroom.

---

## 7. Peta File untuk Navigasi Cepat

| Area | File |
|------|------|
| **Entry & bootstrap** | `app.js`, `events.js` (initEvents) |
| **State & palet** | `store.js` |
| **Logika notasi murni** | `notation.js` |
| **Parser ChordPro** | `chordPro.js` |
| **Render (DOM)** | `render.js`, `chordProEditor.js` |
| **Interaksi** | `events.js`, `chordEditor.js`, `beatMenu.js`, `fermataEditor.js` |
| **PDF** | `pdf.js`, `pdfOptions.js` |
| **Playback** | `playback.js`, `synth.js`, `sampleCache.js` |
| **Cloud / Auth** | `cloud.js`, `cloudUI.js`, `firebase-config.js` |
| **Albums** | `cloudUI.js` (UI album), `cloud.js` (Firestore), `docs/ALBUM-FEATURE.md` |
| **Styles** | `styles/styles.css` (tokens), `styles/ui.css` (shell, dark, responsif, print-hide), `styles/preview.css` (canvas + print), `styles/chordpro.css` (mandiri), `styles/fonts.css` |
| **PWA** | `sw.js`, `manifest.webmanifest` |
| **Deploy** | `.github/workflows/deploy.yml` |
| **Tests** | `tests/unit.test.mjs`, `tests/regression.mjs`, `tests/playback.test.mjs` |

*(Modul JavaScript berada di `src/` dan stylesheet di `styles/`. Tidak ada `styles.css` di root repo.)*

---

## 8. Tips Debugging

- **CSS/JS basi setelah edit**: `/?reset=1` (purge cache SW)
- **Preview layout print**: buka dialog Export PDF → `html.is-print-layout` aktif
- **Style ChordPro tidak termuat**: cek console untuk toast "ChordPro styles didn't load / out of date" — detector di `src/render.js` membandingkan token `--chordpro-css-version` dari `styles/chordpro.css`; bila SW menyajikan CSS lama, token tidak cocok
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
| `normalizeQuality()` | `src/chordBank.js` | Pemetaan kualitas kanonik (alias → kanonik) |
| `foldNashvilleKey()` | `src/chordBank.js` | Alias ketik ASCII → token kanonik (`b` → `♭`; `b7` tetap chord huruf) |
| `transposeChord()` | `src/notation.js` | Transpose dengan standar ejaan |
| `fermataValue()` | `src/notation.js` | Baca/set fermata per-beat (`beat.fermata`) |
| `markMidRowBars()` | `src/pdf.js` | Tandai bar untuk geometri nomor bar (print) |
| `writeLatestMeta()` | `src/cloud.js` | Tulis ringkasan `latest*` ke dokumen lagu |
| `initRender(hooks)` | `src/render.js` | Suntik hook event binding, menjaga graf tetap acyclic |

---

## 10. Bila Ragu

- **Baca PRD** (`docs/PRD.md`) — spec As-Is berbahasa Indonesia dengan kriteria penerimaan
- **Baca DESIGN doc** (`docs/DESIGN.md`) — tokens, komponen, rule print, konvensi (juga berbahasa Indonesia)
- **Cek unit test** (`tests/unit.test.mjs`) — mereka mengodekan kontrak
- **Cari preseden** — mis. rule print-hide baru → grep `.album-banner` di `ui.css`

---

*Panduan ini mencerminkan codebase per commit terkini. Perbarui saat konvensi berubah.*
