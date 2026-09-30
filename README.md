# WorshipNotationScore

Chord & Number Score Builder — arrange chords and number (Nashville) notation, ready to play and export to PDF.

**Live demo:** https://dhandyjoe.github.io/worship-notation-score-app/

## Features

- 🎸 Chord palette, slash-chord builder, and full Nashville Number System (with upper/lower octave dots)
- 📝 **Three writing modes** — chosen in the **New Song** dialog, where each mode gets its
  own animated preview card: **Chord Chart** (beat grid + chords), **Nashville Numbers**
  (degrees 1–7, optional lyrics under each beat) and **ChordPro** (lyrics with chords in
  `[brackets]` — the simplest one, no rhythm notation at all). A new ChordPro song opens
  with two ready-to-type sections, **Intro** and **Verse**.
- 🎹 **Instrumental playback** — chords & Nashville numbers are resolved to real piano audio
  (multi-sample **Salamander Grand Piano** V3 — Yamaha C5, recorded by Alexander Holm). Letter
  chords play as a chord, Nashville numbers as a single note; empty beats can click as a metronome.
  When a beat has a number **and** a chord above it, both sound together — the number as the
  melodic line one octave up, the chord as the harmony underneath.
- 🔢 **Chord row above the numbers (Chord Chart mode)** — write the Nashville number on the beat
  and its chord above it, so a musician reads (and hears) the melody and the harmony at once.
  It is **per section**: every section has its own *Chords On/Off* button, and the **♪** button in a
  bar, via the **♪** button in the bar tools, narrows it further. The row
  transposes with the key, follows rhythm splits, and prints with the score — bars with the row
  switched off keep the same height, so the barlines always line up.
- 🥁 Rhythm subdivisions ½ / ⅓ / ¼ per beat (nested up to two levels)
- ✍️ **Custom chords** — type a chord the palette doesn't list (`Bmaj9`, `B6/9`, `Bm7♭5`): a valid
  spelling is offered back as the first suggestion (your notation first, the canonical `Bø7` right
  below), and when nothing matches the popover offers **Use custom chord** (or just Enter). Custom
  chords transpose with the key, print like any other chord, and playback voices the quality it
  recognises (an unknown suffix falls back to a major triad instead of silence).
- 📝 Per-beat lyrics — paste a sentence to auto-distribute words across bars
- ♻️ Transpose all chords by semitone (chords + key) — works in every mode, including ChordPro
- 🌗 Light/dark theme, zoom, and a dedicated PDF-layout preview (opening *Export PDF* switches it
  on behind the dialog; app chrome that paper never contains — like the site footer — is dropped
  there so nothing slides into view behind the modal)
- 🔢 **Bar numbers in the exported PDF** (*PDF options → Bars*: Off / Line starts / Every bar,
  **on by default**: the first bar of every printed line carries a bold 3 mm number above its
  barline, **Chord Chart scores only**) — remembered *per song*. The dialog's live preview mirrors
  the choice exactly (Off shows no numbers there either).
- 📄 Export to PDF (print) and save/load projects as `.chordsheet.json`
- 📁 **Albums (Fase 3/4)** — shared albums (e.g. a church praise team) where an
  owner curates arrangements and every member can read them. Joining is
  **self-service with an invite code** verified **server-side by Firestore rules**
  (no password sharing, no links — each musician uses their own account). Members
  view read-only and can save a private copy; any owner may invite, promote
  co-owners, or remove members.

## Running

The app is built from native ES modules, so it must be served over HTTP (opening
`index.html` via `file://` will break module loading):

```sh
python3 -m http.server 4173
# then open http://127.0.0.1:4173/
```

> 🔁 **Local editing gotcha (service worker).** The app registers `sw.js`, which serves
> every `?v=__BUILD__` asset **cache-first**. `__BUILD__` is only replaced with a real
> build id by the deploy workflow, so on a local server that version never changes and
> the **first** load after you edit a stylesheet/module still runs the PREVIOUS copy —
> which looks exactly like "my change did nothing" (e.g. an export that ignores the new
> print CSS). Open **`http://127.0.0.1:4173/?reset=1`** once: it purges the caches,
> unregisters the worker and reloads, so your edits are live from then on.

> ⚠️ The score lives in memory for the session only — use **Export .file** to save your work.

## Deployment (GitHub Pages)

This is a fully static site (no build step for development). It is deployed via
**Settings → Pages → Source → "GitHub Actions"**, built by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

- All asset paths are **relative**, so the app works under the `/worship-notation-score-app/` subpath.
- A `.nojekyll` file at the repo root is kept for the branch-based fallback (Actions deployments do not run Jekyll).
- **To publish changes: commit and `git push origin master`.** The workflow runs the unit
  tests, stamps the build version automatically and deploys — there is nothing else to do.
- One-time setup (done once): Settings → Pages → **Source → GitHub Actions**. To roll back,
  switch the source back to *Deploy from a branch → `master` / `/root`*; the app keeps
  working, only the automatic version stamping stops.
- **Firebase login** requires the Pages host (`dhandyjoe.github.io`) to be listed under
  **Firebase Console → Authentication → Settings → Authorized domains**. See
  [`docs/FIREBASE-SETUP.md`](docs/FIREBASE-SETUP.md).

### Cache & deploy hygiene (no stale CSS/JS after a deploy)

The app is a PWA with a service worker, so a deploy must never be masked by a
cached copy of the previous build. Three mechanisms work together:

1. **Automatic build version — no manual bumping.** Every version string in the
   repo is the single placeholder `__BUILD__`:
   - `sw.js` → `CACHE_VERSION` (cache name: a new name makes `activate` delete the
     previous cache) **and** `ASSET_VERSION` (the `?v=` cache-buster used by
     `index.html` and every `src/*.js` import);
   - `index.html` → `window.__WNS_BUILD__` (the page-side build stamp);
   - `styles/chordpro.css` → `--chordpro-css-version` and `src/render.js` →
     `CHORDPRO_CSS_VERSION` (stale-stylesheet detector).
   The deploy workflow replaces that token with `r<run_number>-<short_sha>` in the
   deployed copy only, so every push is a new version and the values can never
   drift apart. `tests/unit.test.mjs` asserts they match and is run **twice** by
   the workflow — on the repo and again on the staged artifact — so a broken
   injection fails the deploy instead of shipping.
2. **Automatic purge on refresh.** `index.html` compares its build stamp with the
   stamp this browser last ran (`localStorage`). When they differ it purges every
   service-worker cache, then the worker update (`skipWaiting` + `clients.claim`,
   registered with `updateViaCache: "none"`) fires `controllerchange` and the page
   reloads **exactly once** — so a returning visitor lands on the new build
   instead of the previous one, with no manual cache clearing.
3. **Network-first shell.** `sw.js` serves navigations and the un-versioned entry
   points (`index.html`, `styles/styles.css`, `manifest.webmanifest`)
   network-first, revalidated with `cache: "no-cache"`, so GitHub Pages'
   `Cache-Control: max-age=600` can never hand back a pre-deploy copy. Versioned
   assets stay cache-first (instant + offline-capable); `ignoreSearch` is used
   **only** when the network fails, so a new `?v=` can never resolve to the
   previous deploy's file.

**Check which version is live:** open the app, view-source, and search for
`__WNS_BUILD__` (or check DevTools → Application → Service Workers) — the value
should look like `r12-a1b2c3d`, not the un-stamped placeholder value.

**Browser stuck on a stale/broken worker?** Open `<app-url>/?reset=1` (or
`?fresh=1`): it purges every cache, unregisters the service worker and reloads on
the clean URL. Last resort: DevTools → Application → Service Workers →
*Unregister*, then *Clear site data*.

## Architecture

The project uses a clean, flat layout that keeps concerns separated:

```
chord-sheet/
├── index.html          # App shell (server entry point)
├── README.md
├── src/                # ES modules (application logic)
│   ├── app.js          #   bootstrap entry — calls initEvents()
│   ├── events.js       #   user interaction, listeners, import/export
│   ├── render.js       #   view layer — builds score HTML
│   ├── store.js        #   single source of truth for state
│   ├── notation.js     #   pure music/notation logic (unit-tested)
│   ├── chordPro.js     #   pure ChordPro parser/transposer/normalizer (unit-tested)
│   ├── chordProEditor.js  # ChordPro workspace UI (editor panel + palette)
│   ├── pdf.js          #   PDF export pipeline
│   ├── pdfOptions.js   #   PDF layout options modal
│   ├── dom.js          #   thin browser helpers
│   ├── cloud.js        #   Firebase wrapper (lazy-loaded auth + Firestore)
│   ├── cloudUI.js      #   login modal + "My Songs"/"Albums" home + album UI
│   └── firebase-config.js  # public-safe Firebase web config
├── styles/             # Stylesheets
│   ├── styles.css      #   design tokens (:root variables)
│   ├── ui.css          #   app shell, ribbon, responsive, dark theme
│   ├── preview.css     #   score canvas + print/PDF layout
│   └── chordpro.css    #   ChordPro workspace + its print layout (self-contained)
├── assets/             # Static assets (favicon)
├── docs/               # Project docs (Firebase / Firestore setup)
└── tests/              # Unit + regression tests
    ├── unit.test.mjs
    └── regression.mjs
```

The JavaScript is split into small, focused ES modules with an acyclic dependency graph:

| Module            | Responsibility                                            | Depends on                   |
| ----------------- | --------------------------------------------------------- | ---------------------------- |
| `src/notation.js` | Pure music/notation + section-data logic (no DOM)         | —                            |
| `src/chordPro.js` | Pure ChordPro parse/transpose/normalize (no DOM)           | notation                     |
| `src/dom.js`      | Thin browser helpers (`$`, `toast`, `prefersTap`)         | —                            |
| `src/store.js`    | Single source of truth for state + palette selection      | notation                     |
| `src/render.js`   | View layer: builds score HTML and writes it to the DOM    | notation, dom, store, chordPro |
| `src/chordProEditor.js` | ChordPro workspace UI (editor panel, palette, sections) | chordPro, notation, dom, store |
| `src/events.js`   | All user interaction, listeners, import/export, bootstrap | notation, chordPro, dom, store, render, chordProEditor |
| `src/app.js`      | Entry point (`initEvents()`)                              | events                       |
| `src/cloud.js`    | Firebase wrapper — lazy-loads auth + Firestore from CDN   | firebase-config, notation    |
| `src/cloudUI.js`  | Login modal + "My Songs"/"Albums" home + album UI      | cloud, dom, notation         |

`render.js` never imports `events.js`; instead `events.js` injects its DOM-binding
hooks via `initRender(...)`, which keeps the module graph free of cycles. The cloud
feature is self-contained: `cloudUI` talks to Firebase only through `cloud.js`, and
to the editor only through injected callbacks — so it never imports `events.js`.
`chordProEditor.js` follows the same rule (`initChordProEditor(...)`), so the
ChordPro workspace never imports `events.js` either.

### Chord row above the numbers (Chord Chart mode)

The Chord Chart beat grid can show a **second row of letter chords above the numbers**, which
turns one sheet into a "melody + harmony" chart: the number on the beat is what the player sings,
the chord above it is what the band plays.

```
CHORD   |  C        G        F        Am   |   ← baris atas (.chord-above-beats)
NUMBER  |  1        5        4        6m   |   ← beat grid (Chord Chart)
```

The row is a **per-section** feature — there is deliberately **no song-wide switch** — and it stays
OFF until you turn it on for the section that needs it:

| Level | Control | Notes |
| --- | --- | --- |
| Section | *Chords On/Off* button in the section head | ON/OFF default for every bar of that section. Only rendered in Chord Chart mode, hidden for read-only members and never printed |
| Bar | **♪** button in the bar tools | Explicit per-bar override; JSON key `chordAboveBars` (`{"3": false}`). A single bar can be switched on even while its section default is off |

Rules worth knowing:

- An **absent** per-bar key means *inherit from the section*, so old files never change.
- A section with the row switched **off** renders exactly like a score without the feature: **no
  reserved strip above the beats** (the beat pitch is untouched).
- A single bar switched off *inside* an active section keeps the row's height (blank) so the
  notation lane and the barlines stay aligned with its neighbours.
- The gap under the row is wide enough to clear the **½ / ⅓ / ¼ rhythm beams** (and their click
  area), so the beams never overlap the chord fields.
- Every chord cell shares **one width** (`--chord-above-w`, 68px) so the row reads as a tidy grid
  instead of ragged, content-sized boxes.
- The beat pitch under an active row is the normal distributed pitch **plus a small delta**
  (`CHORD_ABOVE_LEAF_EXTRA` in `src/events.js`): the beats never get tighter than a score without
  the row, and a line that no longer fits simply **scrolls horizontally**.
- **Print / PDF**: the row adds **no height**. It is a zero-height grid track whose cell is drawn
  *above* the notation lane (a relative offset, so the cell still feeds the column width), which keeps
  the printed lane, rhythm beams, notes and line pitch **exactly** as a score without the row — only
  the chord tokens sit higher, at **90%** of the chord size (`--print-chord-above-size`, so it follows
  the *Chord size* slider). Every chord-row line gets extra headroom above it
  (`--print-chord-above-line-gap`, **6mm** by default, +0.4mm for a section's first line) so the floating
  row of one line can never touch the chords of the line above. The rule is scoped to
  `.bar.has-chord-above`: sections with the row switched **off** keep their default spacing untouched.
- **One distance, every beat type**: the plain chord cell and each ½ / ⅓ / ¼ sub-cell share the same
  height *and* the same single upward offset (screen `--chord-above-h`, print `--print-chord-above-row`;
  `align-self: start` inside the zero-height print track stops the offset being applied twice), so the
  gap from the chord row down to the number is identical whether or not the beat carries a rhythm marker.
- **Subdivided beats print as ONE grid**: when a ½ / ⅓ / ¼ beat carries a chord row, the number slots
  below spread over the same width as the chord cells above them and share the same slot centres
  (`max-content` tracks + `justify-content: space-around`, so a long chord still never wraps). A wide
  chord therefore widens its own beat and every number stays centred under its chord — the printed beat
  pitch follows the chord content instead of staying at the default pitch.
- **The row is saved and restored exactly as you left it.** Save to Cloud / Export `.file` stores the
  per-section `chordAboveEnabled` flag together with the chords, so a song you last had the row **ON**
  reopens with it **ON** (a cloud save round-trips — it used to reopen switched off). Conversely
  nothing ever turns the row on **by itself**: the old migration that enabled it for the legacy
  song-wide `CHORDS+` flag, or merely because a section held chord-row data, is gone — a song you
  never switched on opens OFF. Undo/redo replays a snapshot of the open document, so it restores the
  row exactly as that snapshot had it.
- When at least one bar shows the row, the whole section **reserves the row height**, so bars with
  the row switched off keep their empty track and the notation lane + barlines stay aligned (on
  screen and on paper).
- The row is a **chord** row: it is entered through the same "type → pick a suggestion" popover as a
  beat (Tab walks to the next cell, emptiness + Enter removes the chord), it **transposes with the
  key**, it follows rhythm subdivisions (½ / ⅓ / ¼, merged back on removal), it rides along with
  bar copy/paste, and it prints using the *Chord size* slider from the PDF options.
- Numbers and `N.C.` are never transposed, so a row that only holds numbers stays put.
- **Custom chords** work in the row exactly like on a beat: type anything the palette doesn't list
  (`Bmaj9`, `B6/9`, `Bm7♭5`) — the popover echoes a valid spelling as the *first* suggestion and, when
  nothing matches at all, offers **Use custom chord** (Enter does the same). Nothing is lost: custom
  chords transpose with the key, ride along with bar copy/paste, and print with the score.

### Chord spelling, quality & playback

The palette stores **canonical symbols** (`G+`, `B°`, `Bø7`) and accepts the spellings a player
actually types as aliases:

| Typed | Canonical | Plays as |
| --- | --- | --- |
| `aug`, `augmented` | `+` | augmented triad |
| `dim`, `diminished`, `o` | `°` | diminished triad |
| `m7♭5`, `m7b5`, `min7b5`, `ø`, `o7`, `halfdim` | `ø7` | half-diminished (B–D–F–A) |
| `min7`, `mi7` | `m7` | minor 7th |
| `ma7`, `Δ7` | `maj7` | major 7th |
| `omit3` | `no3` | no third |

`normalizeQuality()` (`src/chordBank.js`) is the **single source of truth** for that mapping: the audio
engine asks it before it looks up a voicing, so a chord can never mean one thing to the suggestion list
and another to the speakers — the reported `Bm7♭5` bug, where the popover offered `Bø7` but the speaker
played a plain B major triad, is impossible now. The quality table (`QUALITY_INTERVALS` in
`src/playback.js`) covers the whole palette plus the common custom spellings: `maj9`, `m11`, `11`, `13`,
`6/9`, `m6/9`, `add11`, `madd9`, `7sus4`, `9sus4`, `dim7`, `aug7`, `7♯5`, `7♯9`, `7♭5`, `mmaj7` and the
`5` power chord. A suffix it doesn't recognise still sounds (a major triad) — never silence.

**Transpose** always moves the root, even for a spelling the grammar doesn't know: `Cxyz` +1 → `D♭xyz`
(the suffix is preserved verbatim, so a chord you invented keeps its own name while the chart stays in
key). Nashville degrees and `N.C.` are never touched, and text that isn't a chord token is passed
through unchanged.

### Sharp vs flat: the transposition spelling standard

Transposing moves **intervals**, and a player reads the result — so the spelling is never "always
sharps" or "always flats"; it follows the **target key**. `src/notation.js` implements three rules:

1. **The target key decides the side.** Keys are named with the smallest signature (`C` +1 → **D♭**,
   because D♭ has 5 flats against C♯'s 7 sharps), and that side then drives every chord: from C +2 the
   chart lands in **D** and the chords come out `D`, `Em`, **`F♯m`**, `G`, `A`, **`Bm`** — never `G♭m`.
   The one exact tie is pitch class 6 (F♯ 6♯ vs G♭ 6♭): the chart keeps **its own** side, so a flat
   score stays flat (`D♭` +5 → `G♭`, `F` +1 → `G♭`) while a sharp/neutral one gets the familiar `F♯`.
2. **Outside the key, the readable defaults apply** — `C♯`, `E♭`, `F♯`, `A♭`, `B♭` in a sharp/neutral
   key, and the flat names in a flat key (borrowed chords are ♭-altered in practice: ♭III/♭VI/♭VII).
   A player never expects to read `D♯`, `G♯`, `A♯`, `C♭`, `F♭`, `E♯` or a double accidental.
3. **A slash bass that is a chord tone follows the chord's own degree**, which is what keeps the
   spellings players actually use: `D/F♯` → `E/G♯`, `A/C♯` → `B/D♯`, `G/B` → `A♭/C`, `C/E` → `D/F♯`.

The key itself moves with the same delta and the same rules (`transposeKeyName()`), so the key field
and the chords can never end up on opposite sides of the circle — that was the reported bug where
`C` +1 looked right but `Em` inside a D-major chart came out `G♭m` instead of `F♯m`. Playback is
unaffected: the audio engine resolves notes by pitch class, so `F♯`/`G♭` sound identical.

### Bar numbers on paper (PDF option)

*Export PDF → Bars → Bar numbers* controls the measure numbers. It is **ON by default** in the
***Line starts*** density: the FIRST bar of every printed line carries a bold (3 mm, weight 800)
number directly above its barline — exactly the spot a player scans when rehearsal says "from bar 9".
The alternatives are ***Every bar*** (the dense variant: a small 2.6 mm number above every barline) and
***Off***. The choice is **stored per song**, like paper size and the size sliders.

Why line starts as the default: within a section the printed rows are stacked with **no vertical
gap** (`row-gap: 0`), so a number above *every* bar sits squeezed between two rows of music and reads
as clutter/part of the row above. One big number per line has room to breathe and is legible at a
glance; `src/pdf.js` already tags every bar that does not start a row with `.pdf-mid-bar`
(`markMidRowBars()`), and the rules simply skip those, so the density costs no extra JS.

The number sits above the barline because the geometry reserves a band at the top of every bar in a
counted row (`--print-bar-num-row` → `--print-bar-num-extra-top`, added to the bar's top padding).
It is reserved on *all* bars of the row, not only the one that draws the digit: the bars share one
flex row (`align-items: stretch`), so a band on the first bar alone would stretch its neighbours and
shift their notation. The band makes those rows slightly taller, so the barline rules stay locked to
the notation with
`top: calc(50% + (var(--print-bar-num-extra-top) - var(--print-bar-num-extra-bottom)) / 2)` — with
the numbers off both extras are `0mm` and the base geometry is untouched.

Turning them off is remembered: clicking *Off* writes a deliberate-choice marker
(`barNumbersChoice`) next to `barNumbers: "off"`. Without that marker a stored `"off"` is treated as
the **legacy default** and migrated back to the current default — which is exactly what gives songs
saved before this option existed their numbers instead of staying number-less (the old dialog
persisted the whole settings snapshot on any tweak, so `"off"` used to mean nothing at all). The
values briefly stored a horizontal side (`"left"`/`"right"`); that axis is gone, so `sanitize()` maps
them to `"line"`, the look they described.

Nudging the stamp: `--print-bar-num-top` moves it DOWN from the bar's top edge (3.5 mm), while
`--print-bar-num-inset` moves it RIGHT from the barline (1.3 mm) and `--print-bar-num-size` sets the
digit height (3 mm). The reserved band and the fixed 0.5 mm clearance between the digit's box and
the first line of music follow automatically, so the digit can never collide with the notation — the
digit and the barline always end up the same 0.2 mm apart, whatever `--print-bar-num-top` is set to.

Three scopes paint that stamp and they are kept identical: `@media print` (the real job),
`html.is-print-layout` (the on-screen PDF-layout preview) and the live pane inside the *PDF options*
dialog. That pane hosts the **real** `#previewCard` node, so its own rule only HIDES the editor's
faint 10px/0.34 numbers — the stamp itself comes from the shared `html.is-print-layout` rules, which
are active there too because opening the dialog switches the layout preview on. One definition,
so paper and pane cannot drift apart. `setPrintLayoutPreview()` (src/events.js) and the dialog call
`markMidRowBars()` for the same reason: without it the preview would number every bar while the PDF
numbers the line starts.


It is a **Chord Chart feature only**. Nashville Numbers mode already prints the numbers *as* the
notation (a corner stamp would just duplicate them) and ChordPro has no bars at all, so in those modes
the whole *Bars* group is taken out of the dialog (`pdfOptions.syncBarNumAvailability()` hides
`#pdfBarsDivider` + `#pdfBarNumField`) and every stamp selector additionally requires
`body[data-editor-mode="chords"]`. A per-song value saved while the song was a Chord Chart therefore
stays harmless if it is later opened/imported in another mode — the paper stays clean either way.

### ChordPro mode

A third writing mode for musicians who just want lyrics with chords above them —
no beat grid, no rhythm notation. Each section keeps its source text verbatim in
`section.chordPro`, and rendering/transposing are pure transforms over that text.

Supported syntax (a deliberate, minimal subset of the ChordPro spec):

```
[C]Amazing [G]grace        inline chords — letter, slash (G/B), Nashville (1, ♭7) and N.C.
{soc} / {eoc}              section header (also {sov}, {sob}, {sopc}, long {start_of_*})
{c: play softly}           comment line
{title:} {artist:} {key:}  metadata (read on .cho/.pro import)
[Verse 1]                  a bracket-only line that is NOT a chord = section label
```

Why not the `chordsheetjs` npm package: this app is a no-build-step static site with
a service-worker offline shell, so a runtime dependency would break both the
"serve over HTTP" workflow and offline use. The hand-written parser is ~400 lines of
pure code, unit-tested, and **unknown directives are parsed then ignored**, so text
pasted from another ChordPro app can never break a score.

Editor behaviour: the left panel holds the song metadata (title, creator, key, time
signature, transpose) plus one plain text field per section — chords are typed inline
as `[C]`, and the right panel updates live as you type. There is intentionally **no
chord palette and no drag & drop** in this mode: typing brackets is the whole point
for beginners. Typing commits through a debounced save, so one typing burst is one
undo step.

**Starting a ChordPro song.** **+ New Song** first asks for the first arrangement's name,
then shows the three mode cards — pick **♬ ChordPro** and the editor opens with two
sections already in place, so the format is obvious at a glance:

```
Intro    [C] [Am7] [Dm7] [G7] [Cmaj7]                          ← chord-only progression
Verse    [C]Type your lyric here and wrap each [G]chord in square [Am]brackets [F]
```

Both are ordinary sections — rename, reorder (↑ ↓), delete (×) or add more with
**+ Add section** (up to `MAX_SECTIONS`). Only ChordPro gets this two-section start; the
other two modes still begin with a single empty *Intro*.

**Adjacent chords stay readable.** The parser keeps the whitespace *between* bracketed
chords instead of throwing it away, and a run of chords with no lyrics after it is flagged
`is-chord-only`, which gets a little trailing padding. So `[C] [Am7] [Dm7] [G7] [Cmaj7]`
renders as `C Am7 Dm7 G7 Cmaj7` with breathing room — not the collided `CAm7Dm7G7Cmaj7`.

**Print parity.** The right-hand pane is labelled *LIVE PREVIEW · Exported to PDF exactly
like this*, and that is literally true: the ChordPro page reuses the Chord Chart print
geometry (same page padding, title margin, `KEY`/`TIME` row and section-label box), only
the lyrics are printed at score size (chord ≈ 5.4 mm, lyric ≈ 4.3 mm, both derived from the
PDF-options sliders). Chord size, lyric size, paper and margins are stored **per song**, and
the label above the preview lines up with the preview's own content column.

### Cloud sync (optional)

Sign-in is **optional** — the editor works fully without an account. Signing in
adds a personal cloud library (**Save to Cloud** / **My Songs**) backed by Firebase
Auth + Firestore. The Firebase web config in `src/firebase-config.js` is
**public-safe**; data is protected by Firestore security rules and the project's
authorized domains. See [`docs/FIREBASE-SETUP.md`](docs/FIREBASE-SETUP.md) for the
Firestore rules, data model, and setup checklist.

### Stylesheets

| File                 | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `styles/styles.css`  | Design tokens (`:root` variables)                                    |
| `styles/ui.css`      | Application shell, ribbon, dark theme, responsive rules              |
| `styles/preview.css` | Score canvas + print/PDF layout (`@media print` / `is-print-layout`) |
| `styles/chordpro.css`| ChordPro workspace + its print layout — fully self-contained (`cp-`-prefixed selectors or `body[data-editor-mode="chordpro"]` gated, so the two original modes are untouched) |

> Print parity note: interactive-only chrome (the multi-bar selection ring/tint
> and its ✓ badge) is neutralised in **both** `@media print` and
> `html.is-print-layout` in `styles/ui.css`, and the export flow clears the
> selection before printing — so a green selection box can never appear in the
> exported PDF even if the user exports mid-selection.

## Testing

**Unit tests** (pure logic — transpose, normalization, slots; no browser needed):

```sh
node --test tests/unit.test.mjs
```

**Regression tests** (layout/print geometry — requires Chrome with remote debugging):

```sh
# Terminal 1 — app server
python3 -m http.server 4173
# Terminal 2 — Chrome with a debugging port
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9223
# Terminal 3 — run the suite
node tests/regression.mjs
```
