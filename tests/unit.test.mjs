import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
   transposeNote,
   transposeChord,
   transposeBeats,
   transposeChordMap,
   transposeKeyName,
   spellPitch,
   isKnownKey,
   keyNames,
   normalizeSection,
   removeBar,
   safeFileName,
   isNashvilleChord,
   beatValue,
   lyricValue,
   setLyric,
   prepareLyricsForDuration,
   prepareChordAboveForDuration,
   collapseChordAbove,
   moveChordAbove,
   chordAboveValue,
   setChordAbove,
   chordAboveShownForBar,
   sectionShowsChordAbove,
   setChordAboveForBar,
   barHasContent,
   slotBarIndex,
   splitSyllables,
   syllabifyLyrics,
   MAX_BARS,
   fermataValue,
   setFermata,
   clearFermata,
   restoreCollapsedBeat,
   sectionHasFermata,
   MAX_FERMATA,
   nextSectionName,
   meters,
   editorModeMeta,
   normalizeEditorMode,
   modeIconSvg,
   modeIconMarkup,
   isSingleBeatMeter,
   barUnitWord,
} from "../src/notation/notation.js";
import { encodeShare, decodeShare, buildShareLink, extractPayloadFromLink, canCompress } from "../src/util/share.js";
import {
   composeSong,
   isLegacySongDoc,
   generateInviteCode,
   normalizeInviteCode,
   versionCopyPayload,
   sortVersionsByRecency,
   sortAlbumSongsByRecency,
   applyVersionSummary,
} from "../src/cloud.js";
import { friendlyName } from "../src/util/identity.js";
import { parseYoutubeUrl, canonicalUrl, thumbnailUrl, youtubeFields, parseStartTime, formatStartTime, youtubeChipMeta } from "../src/util/youtube.js";
import { beatHTML, chordProSectionHTML, chordLabel } from "../src/render/render.js";
import { isValidChordSpelling, withTypedSpelling } from "../src/editor/chordEditor.js";
import {
   PDF_BAR_NUMBERS,
   PDF_PAPER,
   defaultPdfOptions,
   sanitize,
   applyPdfOptions,
   computePreviewScale,
} from "../src/pdf/pdfOptions.js";
import { getState, setState } from "../src/core/store.js";
import {
   MAX_CHORDPRO_CHARS,
   normalizeChordPro,
   normalizeChordProSections,
   carryChordProSections,
   isChordToken,
   parseChordProLine,
   parseChordPro,
   transposeChordToken,
   transposeChordProText,
   chordProPlainText,
   chordProMeta,
   chordProFromFile,
} from "../src/notation/chordPro.js";
import { buildPlaybackQueue, entryDuration, fermataPulseTimes, chordToMidiNotes } from "../src/playback/playback.js";
import { clearHistory, saveState, undo, redo } from "../src/core/history.js";
import { clearClipboard, getClipboard, hasClipboard, setClipboard } from "../src/core/clipboard.js";
import { cloudUIState, setActiveAlbumCtx } from "../src/cloud/ui/state.js";

test("history undo and redo share a boolean return contract", () => {
   clearHistory();
   saveState({ value: 1 });
   saveState({ value: 2 });

   assert.equal(undo(), true);
   assert.equal(undo(), false);
   assert.equal(redo(), true);
   assert.equal(redo(), false);
});

test("the clipboard deep-clones its payload and scopes by kind", () => {
   clearClipboard();
   assert.equal(hasClipboard(), false);

   const payload = { name: "Intro", beats: [{ chord: "C" }] };
   setClipboard("section", payload, { label: "Intro" });
   // The caller keeps editing its own object; the snapshot must not change.
   payload.name = "mutated";
   payload.beats[0].chord = "G";

   assert.equal(hasClipboard(), true);
   assert.equal(hasClipboard("section"), true);
   assert.equal(hasClipboard("bar"), false);

   const entry = getClipboard();
   assert.equal(entry.kind, "section");
   assert.equal(entry.payload.name, "Intro");
   assert.equal(entry.payload.beats[0].chord, "C");
   assert.deepEqual(entry.meta, { label: "Intro" });

   clearClipboard();
   assert.equal(getClipboard(), null);
   assert.equal(hasClipboard(), false);
});

test("setActiveAlbumCtx keeps only a usable album context", () => {
   setActiveAlbumCtx({ albumId: "album-1", albumName: "Setlist", role: "member", ignored: true });
   assert.deepEqual(cloudUIState.activeAlbumCtx, {
      albumId: "album-1",
      albumName: "Setlist",
      role: "member",
   });

   setActiveAlbumCtx({ albumId: "album-2" });
   assert.deepEqual(cloudUIState.activeAlbumCtx, { albumId: "album-2", albumName: "", role: null });

   setActiveAlbumCtx({ albumName: "No album id" });
   assert.equal(cloudUIState.activeAlbumCtx, null);
   setActiveAlbumCtx(null);
   assert.equal(cloudUIState.activeAlbumCtx, null);
});

test("transposeNote wraps around 12 notes and spells for the target key", () => {
   assert.equal(transposeNote("B", 1), "C");
   assert.equal(transposeNote("C", -1), "B");
   // Without a key context the readable chromatic defaults apply (C♯/E♭/F♯/A♭/B♭).
   assert.equal(transposeNote("C", 1), "C♯");
   assert.equal(transposeNote("F", 1), "F♯");
   // With a target key the spelling follows that key's side, so a flat chart stays flat.
   assert.equal(transposeNote("C", 1, { key: "D♭" }), "D♭");
   assert.equal(transposeNote("E", 2, { key: "D" }), "F♯");
   assert.equal(transposeNote("X", 1), "X"); // unknown note is left untouched
});

// ---- The sharp-vs-flat spelling standard ------------------------------------
// Transposition moves INTERVALS, so the result is spelled for the TARGET key: a sharp key writes
// F♯/C♯/G♯, a flat key writes G♭/D♭/A♭, and a slash bass that is a chord tone follows the chord's
// own degree. This is what keeps `D/F♯` (the spelling players expect) instead of `D/G♭`.
test("transposed chords are spelled for the target key, not always with flats", () => {
   // Sharp keys: the third of D is F♯, never G♭.
   assert.equal(transposeChord("Em", 2, { key: "D" }), "F♯m");
   assert.equal(transposeChord("C", 2, { key: "D" }), "D");
   assert.equal(transposeChord("F", 2, { key: "D" }), "G");
   assert.equal(transposeChord("Am", 2, { key: "D" }), "Bm");
   // Flat keys keep their own side (no stray sharps appear in an existing flat chart).
   assert.equal(transposeChord("G♭", 2, { key: "A♭" }), "A♭");
   assert.equal(transposeChord("D♭m7", 2, { key: "A♭" }), "E♭m7");
   assert.equal(transposeChord("E♭", 1, { key: "E♭" }), "E");
   // The classic slash basses stay chord degrees: D/F♯ → E/G♯, A/C♯ → B/D♯, G/B → A♭/C.
   assert.equal(transposeChord("D/F#", 2, { key: "E" }), "E/G♯");
   assert.equal(transposeChord("A/C#", 2, { key: "B" }), "B/D♯");
   assert.equal(transposeChord("G/B", 1, { key: "A♭" }), "A♭/C");
   assert.equal(transposeChord("C/E", 2, { key: "D" }), "D/F♯");
   // Borrowed (chromatic) chords follow the key's side too: flat in a flat key, readable flats
   // in a sharp/neutral one (a ♭VI/♭III is never written as a sharp).
   assert.equal(transposeChord("A♭/G♭", 0, { key: "A♭" }), "A♭/G♭");
   assert.equal(spellPitch(6, "A♭"), "G♭", "a flat key spells the borrowed ♭VII as G♭");
   assert.equal(spellPitch(3, "D"), "E♭", "a sharp key still reads the borrowed ♭III as E♭");
   assert.equal(spellPitch(1, "F♯"), "C♯", "diatonic degrees follow the key signature");
});

test("transposeKeyName picks the name with the smallest signature and keeps the chart's side", () => {
   assert.equal(transposeKeyName("C", 1), "D♭"); // 5♭ beats 7♯
   assert.equal(transposeKeyName("C", 2), "D");
   assert.equal(transposeKeyName("C", 6), "F♯"); // F♯/G♭ tie → neutral/sharp source gets F♯
   assert.equal(transposeKeyName("F", 1), "G♭"); // ...but a flat source stays flat
   assert.equal(transposeKeyName("D♭", 5), "G♭");
   assert.equal(transposeKeyName("G♭", 1), "G");
   assert.equal(transposeKeyName("G", 1), "A♭");
   assert.equal(transposeKeyName("D", 1), "E♭");
   assert.equal(transposeKeyName("A", 1), "B♭");
   assert.equal(transposeKeyName("B", 1), "C");
   assert.equal(transposeKeyName("C", 11), "B");
   assert.equal(transposeKeyName("B♭", 1), "B"); // never C♭
   assert.ok(isKnownKey("F♯") && isKnownKey("D♭") && isKnownKey("F#"));
   assert.ok(!isKnownKey("H"));
});

test("no transposition ever produces an unreadable spelling", () => {
   // Sweep every key × every shift: chord symbols must never contain C♭/F♭/E♯/B♯ or a double
   // accidental, which is exactly what a naive letter+accidental algorithm produces.
   const chords = ["C", "Dm7", "E♭maj7", "F♯m7", "G7sus4", "A♭", "Bm7♭5", "C/F♯", "G/B", "D/A"];
   const bad = /C♭|F♭|E♯|B♯|♯♯|♭♭/;
   keyNames.forEach((key) => {
      for (let steps = -11; steps <= 11; steps += 1) {
         const target = transposeKeyName(key, steps);
         chords.forEach((chord) => {
            const out = transposeChord(chord, steps, { key: target });
            assert.ok(!bad.test(out), `${chord} ${steps} in ${key} → ${out} (key ${target})`);
         });
      }
   });
   // spellPitch itself must never hand back an unreadable name either.
   for (let pc = 0; pc < 12; pc += 1) {
      keyNames.forEach((key) => assert.ok(!bad.test(spellPitch(pc, key)), `${pc} in ${key}`));
   }
});

test("transposeChord moves the root of a hand-typed chord too", () => {
   // A suffix our grammar doesn't know still keeps the chart in key: the ROOT moves and
   // the suffix is preserved exactly as the user wrote it.
   assert.equal(transposeChord("Cxyz", 1), "C♯xyz"); // no context → readable default
   assert.equal(transposeChord("Cxyz", 1, { key: "D♭" }), "D♭xyz"); // a flat key keeps flats
   assert.equal(transposeChord("Cxyz", 2), "Dxyz");
   assert.equal(transposeChord("Gm7b5", 1), "A♭m7b5"); // ascii spelling kept
   assert.equal(transposeChord("Bm7♭5", 1), "Cm7♭5"); // unicode spelling kept
   assert.equal(transposeChord("Cmaj9", 2), "Dmaj9");
   assert.equal(transposeChord("C6/9", 2), "D6/9");
   assert.equal(transposeChord("Cxyz/G", 2), "Dxyz/A");
   // Text that isn't a chord token stays put, so a stray word is never rewritten.
   assert.equal(transposeChord("N.C.", 1), "N.C.");
   assert.equal(transposeChord("Amazing grace", 1), "Amazing grace");
});

test("transposeChord keeps quality and slash bass", () => {
   assert.equal(transposeChord("Cmaj7", 2), "Dmaj7");
   assert.equal(transposeChord("G/B", 1), "A♭/C");
   assert.equal(transposeChord("F#m7", -1), "Fm7");
});

test("Nashville notation is never transposed", () => {
   assert.equal(transposeChord("1maj7", 3), "1maj7");
   assert.equal(transposeChord("♭7", 1), "♭7");
   assert.ok(isNashvilleChord("♭3m"));
});

test("non-chord text is passed through untouched", () => {
   assert.equal(transposeChord("N.C.", 1), "N.C.");
   assert.equal(transposeChord("Hello", 5), "Hello");
});

test("slotBarIndex parses the leading bar number", () => {
   assert.equal(slotBarIndex("2-1"), 2);
   assert.equal(slotBarIndex("0-3:1"), 0);
   assert.equal(slotBarIndex("nope"), -1);
});

test("removeBar shifts slots after the removed bar", () => {
   const section = { bars: 3, beats: { "0-0": "C", "1-0": "G", "2-1": "F" }, lyricBeats: { "1-0": "lord" } };
   removeBar(section, 1);
   assert.equal(section.bars, 2);
   assert.deepEqual(section.beats, { "0-0": "C", "1-1": "F" });
   assert.deepEqual(section.lyricBeats, {});
});

test("normalizeSection distributes legacy lyrics per beat", () => {
   const section = normalizeSection({ id: "s1", name: "Verse", bars: 1, lyrics: "amazing grace how sweet" }, "4/4");
   assert.equal(section.lyricBeats["0-0"], "amazing");
   assert.equal(section.lyricBeats["0-3"], "sweet");
});

test("normalizeSection caps bars and strips invalid beat data", () => {
   const section = normalizeSection({
      id: "s2",
      bars: 9999,
      beats: { "0-0": { chord: "C", duration: "evil" }, "0-1": 42 },
   });
   assert.equal(section.bars, MAX_BARS);
   assert.equal(section.beats["0-0"].duration, null);
   assert.equal(section.beats["0-0"].chord, "C");
   assert.equal(section.beats["0-1"], undefined);
});

test("beatValue normalizes string and object beats", () => {
   const section = { beats: { "0-0": "C", "0-1": { chord: "G", duration: "half" } } };
   assert.deepEqual(beatValue(section, "0-0"), { chord: "C", duration: null });
   assert.deepEqual(beatValue(section, "0-1"), { chord: "G", duration: "half" });
   assert.deepEqual(beatValue(section, "9-9"), { chord: null, duration: null });
});

test("setLyric writes and clears entries", () => {
   const section = { lyricBeats: {} };
   setLyric(section, "0-0", "grace");
   assert.equal(section.lyricBeats["0-0"], "grace");
   setLyric(section, "0-0", "   ");
   assert.equal(section.lyricBeats["0-0"], undefined);
});

test("prepareLyricsForDuration moves a whole-beat lyric onto the first subdivision", () => {
   const section = { beats: {}, lyricBeats: { "0-0": "hallelujah" } };
   prepareLyricsForDuration(section, "0-0", "half");
   assert.equal(lyricValue(section, "0-0:0"), "hallelujah");
   assert.equal(lyricValue(section, "0-0"), "");
});

test("barHasContent detects chords and lyrics in a bar", () => {
   const section = { beats: { "1-0": "C" }, lyricBeats: { "2-0": "word" } };
   assert.ok(barHasContent(section, 1));
   assert.ok(barHasContent(section, 2));
   assert.equal(barHasContent(section, 0), false);
});

test("setChordAbove writes and clears entries", () => {
   const section = { chordAboveBeats: {} };
   setChordAbove(section, "0-0", "Am7");
   assert.equal(section.chordAboveBeats["0-0"], "Am7");
   setChordAbove(section, "0-0", "   ");
   assert.equal(section.chordAboveBeats["0-0"], undefined);
});

test("chordAboveValue returns empty string for unset slots", () => {
   const section = { chordAboveBeats: { "0-0": "G" } };
   assert.equal(chordAboveValue(section, "0-0"), "G");
   assert.equal(chordAboveValue(section, "0-1"), "");
   assert.equal(chordAboveValue({}, "0-0"), "");
});

test("barHasContent detects chord-above entries in a bar", () => {
   const section = { beats: {}, lyricBeats: {}, chordAboveBeats: { "1-0": "Dm" } };
   assert.ok(barHasContent(section, 1));
   assert.equal(barHasContent(section, 0), false);
});

test("normalizeSection preserves and sanitizes chordAboveBeats", () => {
   const section = { name: "Verse", bars: 2, chordAboveBeats: { "0-0": "C", "0-1": "  " } };
   const out = normalizeSection(section, "4/4");
   assert.equal(out.chordAboveBeats["0-0"], "C");
   assert.equal(out.chordAboveBeats["0-1"], undefined);
   // The chord row is a PER-SECTION opt-in now: only an explicit `true` turns it on.
   assert.equal(out.chordAboveEnabled, false);
   assert.equal(normalizeSection({ name: "X", bars: 1 }).chordAboveEnabled, false);
   assert.equal(normalizeSection({ name: "X", bars: 1, chordAboveEnabled: true }).chordAboveEnabled, true);
   assert.equal(normalizeSection({ name: "X", bars: 1, chordAboveEnabled: "yes" }).chordAboveEnabled, false);
});

test("extractBar/replaceBarContent preserve chordAboveBeats", () => {
   const source = {
      beats: { "1-0": { chord: "C", duration: null } },
      lyricBeats: { "1-0": "sing" },
      chordAboveBeats: { "1-0": "G/B" },
   };
   const payload = extractBar(source, 1);
   assert.equal(payload.chordAboveBeats["0-0"], "G/B");
   const target = { beats: {}, lyricBeats: {}, chordAboveBeats: { "2-0": "old" } };
   replaceBarContent(target, 2, payload);
   assert.equal(target.chordAboveBeats["2-0"], "G/B");
   assert.equal(target.chordAboveBeats["2-1"], undefined);
});

test("extractBars/overwriteBars preserve chordAboveBeats for multi-bar ranges", () => {
   const source = {
      bars: 4,
      beats: {},
      lyricBeats: {},
      chordAboveBeats: { "0-0": "C", "1-0": "F", "2-0": "G", "3-0": "Am" },
   };
   const payload = extractBars(source, 0, 1);
   assert.equal(payload.chordAboveBeats["0-0"], "C");
   assert.equal(payload.chordAboveBeats["1-0"], "F");
   const target = { bars: 4, beats: {}, lyricBeats: {}, chordAboveBeats: {} };
   overwriteBars(target, 2, payload);
   assert.equal(target.chordAboveBeats["2-0"], "C");
   assert.equal(target.chordAboveBeats["3-0"], "F");
});

// ---- Chord row visibility: section → bar ----------------------------------
// The chord row is a PER-SECTION feature (no song-wide switch). Resolution is
// "section default → explicit per-bar override", and an absent per-bar key always
// means "inherit from the section".
test("chordAboveShownForBar resolves the section → bar chain", () => {
   const section = { bars: 3, chordAboveEnabled: true, chordAboveBars: {} };
   // Section on → every bar inherits "shown".
   assert.equal(chordAboveShownForBar(section, 2), true);
   // An explicit override wins over the section default.
   section.chordAboveBars = { "1": false };
   assert.equal(chordAboveShownForBar(section, 1), false);
   assert.equal(chordAboveShownForBar(section, 0), true);
   // A forced-on bar works even when the section default is off.
   section.chordAboveEnabled = false;
   section.chordAboveBars = { "2": true };
   assert.equal(chordAboveShownForBar(section, 2), true);
   assert.equal(chordAboveShownForBar(section, 0), false);
   // A section without the flag at all (fresh / older file) is off.
   assert.equal(chordAboveShownForBar({ bars: 1 }, 0), false);
});

test("sectionShowsChordAbove reserves the row when a single bar is forced on", () => {
   const section = { bars: 4, chordAboveEnabled: false, chordAboveBars: {} };
   assert.equal(sectionShowsChordAbove(section), false);
   setChordAboveForBar(section, 3, true);
   assert.equal(sectionShowsChordAbove(section), true);
   const all = { bars: 2, chordAboveEnabled: true, chordAboveBars: {} };
   assert.equal(sectionShowsChordAbove(all), true);
   all.chordAboveEnabled = false;
   assert.equal(sectionShowsChordAbove(all), false);
});

test("the chord row is restored exactly as saved and never turns itself on", () => {
   // 1) What was saved comes back: normalizeSection restores the file's own per-section flag, so
   // Save to Cloud / Export .file round-trips the row (the reported "saved it, reopened OFF" bug).
   const saved = normalizeSection(
      {
         name: "Verse",
         bars: 2,
         chordAboveEnabled: true,
         chordAboveBeats: { "0-0": "C" },
         chordAboveBars: { "1": false },
      },
      "4/4",
   );
   assert.equal(saved.chordAboveEnabled, true);
   assert.deepEqual(saved.chordAboveBeats, { "0-0": "C" });
   assert.deepEqual(saved.chordAboveBars, { "1": false });
   assert.equal(sectionShowsChordAbove(saved), true);
   // 2) Nothing enables it by itself. A song that never switched the row on stays OFF even when it
   // holds chord-row data — the removed migration used to force those sections ON ("Chords+ turns
   // itself on" for existing songs).
   const dataOnly = normalizeSection(
      { name: "Intro", bars: 2, chordAboveBeats: { "0-0": "G" } },
      "4/4",
   );
   assert.equal(dataOnly.chordAboveEnabled, false);
   assert.equal(sectionShowsChordAbove(dataOnly), false);
   assert.deepEqual(dataOnly.chordAboveBeats, { "0-0": "G" }, "the chords themselves are kept");
   // A legacy song-wide `CHORDS+` flag is ignored outright (it is not read anywhere).
   assert.equal(normalizeSection({ name: "Intro", bars: 1 }, "4/4").chordAboveEnabled, false);
   // 3) Wiring: no load path resets the row, and the auto-enable migration is gone for good.
   const events = readProjectFile("src/events.js");
   const notation = readProjectFile("src/notation/notation.js");
   assert.ok(!/resetChordRow/.test(events), "loading must never reset the chord row");
   assert.ok(!/migrateSongChordAbove/.test(notation), "the auto-enable migration is gone");
   assert.ok(!/migrateSongChordAbove|chordAboveEnabled === true\)\)/.test(events));
   assert.match(events, /\n\s+applyProject\(snapshot\);\n/, "undo/redo replay the snapshot as-is");
});

test("setChordAboveForBar writes and clears the per-bar override", () => {
   const section = { bars: 3, chordAboveEnabled: true, chordAboveBars: { "2": false } };
   setChordAboveForBar(section, 0, false);
   assert.equal(section.chordAboveBars["0"], false);
   // Clearing returns that bar to "inherit from the section".
   setChordAboveForBar(section, 0, undefined);
   assert.equal(section.chordAboveBars["0"], undefined);
   assert.equal(chordAboveShownForBar(section, 0, true), true);
   // A bar may be forced ON even while the section default is off.
   const off = { bars: 2, chordAboveEnabled: false, chordAboveBars: {} };
   setChordAboveForBar(off, 1, true);
   assert.equal(sectionShowsChordAbove(off), true);
   assert.equal(chordAboveShownForBar(off, 0), false);
});

test("removeBar shifts and drops the per-bar chord-row overrides", () => {
   const section = {
      bars: 3,
      beats: {},
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: { "0": true, "2": false },
   };
   removeBar(section, 1);
   // Bar 0 keeps its flag, the deleted bar is gone, old bar 2 moves up to bar 1.
   assert.deepEqual(section.chordAboveBars, { "0": true, "1": false });
   assert.equal(section.bars, 2);
   // The removed bar's own override disappears with it.
   const dropped = { bars: 2, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: { "0": true, "1": false } };
   removeBar(dropped, 1);
   assert.deepEqual(dropped.chordAboveBars, { "0": true });
});

test("normalizeSection sanitizes per-bar chord-row overrides", () => {
   const out = normalizeSection({
      name: "Verse",
      bars: 2,
      chordAboveBars: { "0": true, "1": false, "7": true, "-1": true, x: true, "0.5": true, "1b": "yes" },
   });
   // Only explicit booleans for bars that actually exist survive.
   assert.deepEqual(out.chordAboveBars, { "0": true, "1": false });
   assert.deepEqual(normalizeSection({ name: "X", bars: 1 }).chordAboveBars, {});
   assert.deepEqual(normalizeSection({ name: "X", bars: 1, chordAboveBars: null }).chordAboveBars, {});
});

// ---- Chord row above the numbers: transpose + rhythm markers --------------
test("transposeChordMap moves letter chords and leaves Nashville numbers alone", () => {
   const map = { "0-0": "C", "0-1": "G/B", "0-2": "1", "0-3": "♭7", "0-4": "N.C.", "0-5": "" };
   assert.equal(transposeChordMap(map, 1), 2);
   assert.deepEqual(map, {
      "0-0": "C♯",
      "0-1": "A♭/C",
      "0-2": "1",
      "0-3": "♭7",
      "0-4": "N.C.",
      "0-5": "",
   });
   // A number-only row is a no-op, and a missing map never throws.
   assert.equal(transposeChordMap({ "0-0": "1", "0-1": "5" }, 1), 0);
   assert.equal(transposeChordMap(undefined, 1), 0);
});

test("transposeBeats handles both slot shapes and reports the count", () => {
   const beats = {
      "0-0": { chord: "C", duration: null },
      "0-1": "Am",
      "0-2": { chord: "1", duration: null },
   };
   assert.equal(transposeBeats(beats, 1), 2);
   assert.deepEqual(beats, {
      "0-0": { chord: "C♯", duration: null },
      "0-1": "B♭m",
      "0-2": { chord: "1", duration: null },
   });
   assert.equal(transposeBeats(undefined, 1), 0);
});

test("prepareChordAboveForDuration moves the chord row into the first subdivision", () => {
   const section = {
      beats: { "0-0": { chord: "1", duration: null } },
      chordAboveBeats: { "0-0": "C" },
   };
   prepareChordAboveForDuration(section, "0-0", "quarter");
   // The single cell follows its beat into the first of the four quarter cells.
   assert.deepEqual(section.chordAboveBeats, { "0-0:0": "C" });
   // quarter → half collapses :2/:3 into the 2nd half (:1); a chord cell holds ONE
   // chord, so the first non-empty cell wins instead of being joined.
   section.chordAboveBeats = { "0-0:0": "C", "0-0:1": "G", "0-0:2": "Am", "0-0:3": "F" };
   section.beats["0-0"].duration = "quarter";
   prepareChordAboveForDuration(section, "0-0", "half");
   assert.deepEqual(section.chordAboveBeats, { "0-0:0": "C", "0-0:1": "G" });
   // Nothing to move → the map is left untouched.
   const empty = { beats: { "0-1": { chord: null, duration: null } }, chordAboveBeats: {} };
   prepareChordAboveForDuration(empty, "0-1", "half");
   assert.deepEqual(empty.chordAboveBeats, {});
});

test("collapseChordAbove pulls the first chord back onto the beat", () => {
   const section = { chordAboveBeats: { "0-0:2": "Am", "0-0:0": "C", "0-0:1": "G", "1-0": "F" } };
   assert.equal(collapseChordAbove(section, "0-0"), true);
   assert.deepEqual(section.chordAboveBeats, { "0-0": "C", "1-0": "F" });
   // No descendant cells → nothing to collapse, and neighbours stay untouched.
   assert.equal(collapseChordAbove(section, "2-0"), false);
   assert.deepEqual(section.chordAboveBeats, { "0-0": "C", "1-0": "F" });
});

test("moveChordAbove relocates a chord cell and clears the source slot", () => {
   const section = { chordAboveBeats: { "0-0:0": "C" } };
   assert.equal(moveChordAbove(section, "0-0:0", "0-0:0.0"), true);
   assert.deepEqual(section.chordAboveBeats, { "0-0:0.0": "C" });
   // Nothing to move → the map is untouched.
   assert.equal(moveChordAbove(section, "9-9", "0-0"), false);
   assert.deepEqual(section.chordAboveBeats, { "0-0:0.0": "C" });
});

// ---- Chord row: the rendered cell (no ghost row when it is off) ------------
// Regression guard for the reported bug: an extra chord cell inside a single-row
// column became a SECOND grid row, which pushed the beats down and left an empty
// strip above a score that must look exactly like one without the feature.
test("beatHTML emits no chord-row cell while the row is switched off", () => {
   const section = {
      id: "sec-chord-above",
      name: "Intro",
      bars: 1,
      beats: { "0-0": { chord: "1", duration: null } },
      lyricBeats: {},
      chordAboveEnabled: false,
      chordAboveBeats: { "0-0": "C" },
      chordAboveBars: {},
   };
   const before = getState();
   setState({ ...before, editorMode: "chords", lyricsEnabled: false, sections: [section], activeId: section.id });
   try {
      // Section OFF → the column has exactly ONE child (the notation cell): no
      // reserved track and no placeholder, i.e. the pre-feature layout.
      const off = beatHTML(section, 0, 0, false, false);
      assert.match(off, /^<span class="beat-column\s*"><span class="notation-cell">/, off);
      assert.ok(!/chord-above-(input|editor|print)/.test(off), off);
      assert.ok(!off.includes("with-chord-above"), off);
      assert.ok(!off.includes("is-chord-above-off"), off);
      // Section ON → a real input sits in the reserved track, and the value is kept
      // verbatim: the CSS gives EVERY cell the same wide box, so nothing is clipped.
      const on = beatHTML(section, 0, 0, true, true);
      assert.match(on, /with-chord-above/);
      assert.match(on, /class="chord-above-input"/);
      section.chordAboveBeats["0-0"] = "Em/C#";
      const wide = beatHTML(section, 0, 0, true, true);
      assert.match(wide, /value="Em\/C#"/, wide);
      assert.ok(!wide.includes("chord-above-sizer"), wide);
      // Bar switched OFF inside an ON section → the track stays (so the notation
      // lane and the barlines keep their pitch) but there is nothing to type in.
      const barOff = beatHTML(section, 0, 0, true, false);
      assert.match(barOff, /with-chord-above/);
      assert.match(barOff, /is-chord-above-off/);
      assert.ok(!barOff.includes("chord-above-input"), barOff);
   } finally {
      setState(before);
   }
});

test("safeFileName produces a filesystem-safe slug", () => {
   assert.equal(safeFileName("My Song! (v2)"), "My-Song-v2");
   assert.equal(safeFileName(""), "spartio");
   assert.equal(safeFileName("///"), "spartio");
});

// ---- App identity: the branded name must ship everywhere it is shown ---------
test("the app is branded Spartio.app everywhere it shows", () => {
   const html = readProjectFile("index.html");
   const manifest = readProjectFile("manifest.webmanifest");
   // Tab title, the two print signatures (PDF + ChordPro) and the footer credit.
   assert.match(html, /<title>Spartio\.app — Chord &amp; Number Score Builder<\/title>/);
   assert.equal(
      (html.match(/Generated with Spartio\.app/g) || []).length,
      2,
      "both print signatures must carry the brand",
   );
   assert.match(html, /<strong>Spartio\.app<\/strong>/);
   // The three brand lockups: login aside, login card, My Songs header.
   assert.equal(
      (html.match(/class="home-brand-text">Spartio\.app/g) || []).length,
      3,
      "every brand lockup must read Spartio.app",
   );
   // Home-screen label + install name.
   assert.match(html, /<meta name="apple-mobile-web-app-title" content="Spartio\.app" \/>/);
   assert.match(manifest, /"name": "Spartio\.app — Chord & Number Score Builder"/);
   assert.match(manifest, /"short_name": "Spartio\.app"/);
   // The old name must be gone from every file a user can read or download
   // (src/pdf/pdf.js is the "Save as PDF" filename fallback).
   for (const file of [
      "index.html",
      "manifest.webmanifest",
      "README.md",
      "docs/FIREBASE-SETUP.md",
      "assets/logo-mark.png",
      "assets/icon-maskable-1024.png",
      "src/pdf/pdf.js",
      "src/events.js",
   ]) {
      assert.ok(!readProjectFile(file).includes("WorshipNotationScore"), `${file} still ships the old name`);
   }
   // The brand slug is also the fallback file name for exports / PDF.
   assert.equal(safeFileName(""), "spartio");
});

test("splitSyllables keeps short words and single-nucleus words intact", () => {
   assert.deepEqual(splitSyllables("God"), ["God"]);
   assert.deepEqual(splitSyllables("the"), ["the"]);
   assert.deepEqual(splitSyllables("grace"), ["grace"]); // silent trailing e
   assert.deepEqual(splitSyllables("saved"), ["saved"]); // silent -ed
});

test("splitSyllables breaks multi-syllable words naturally", () => {
   assert.deepEqual(splitSyllables("wonderful"), ["won", "der", "ful"]);
   assert.deepEqual(splitSyllables("mercy"), ["mer", "cy"]);
   assert.deepEqual(splitSyllables("salvation"), ["sal", "va", "tion"]);
});

test("splitSyllables respects user-supplied hyphenation", () => {
   assert.deepEqual(splitSyllables("a-maz-ing"), ["a", "maz", "ing"]);
});

test("splitSyllables preserves attached punctuation", () => {
   const pieces = splitSyllables("gone,");
   assert.equal(pieces[pieces.length - 1].endsWith(","), true);
});

test("syllabifyLyrics returns hymnal-style tokens with trailing hyphens", () => {
   assert.deepEqual(syllabifyLyrics("amazing grace"), ["a-", "ma-", "zing", "grace"]);
   assert.deepEqual(syllabifyLyrics("  God   is  "), ["God", "is"]);
   assert.deepEqual(syllabifyLyrics(""), []);
});

// ---- chordBank suggestion engine ----------------------------------------
import {
   suggestChords,
   hasSuggestions,
   detectMode,
   foldChordKey,
   foldNashvilleKey,
   normalizeQuality,
   BANK_QUALITIES,
} from "../src/notation/chordBank.js";

test("normalizeQuality folds every alias onto the spelling the audio engine voices", () => {
   // The reported case: Bm7♭5 must resolve to the canonical half-diminished symbol, so
   // playback cannot disagree with the suggestion list any more.
   assert.equal(normalizeQuality("m7♭5"), "ø7");
   assert.equal(normalizeQuality("m7b5"), "ø7");
   assert.equal(normalizeQuality("min7b5"), "ø7");
   assert.equal(normalizeQuality("ø"), "ø7");
   assert.equal(normalizeQuality("o7"), "ø7");
   assert.equal(normalizeQuality("dim"), "°");
   assert.equal(normalizeQuality("diminished"), "°");
   assert.equal(normalizeQuality("aug"), "+");
   assert.equal(normalizeQuality("augmented"), "+");
   // Generic spelling rules (min/mi, omit, Δ/ma) run before the alias lookup.
   assert.equal(normalizeQuality("min7"), "m7");
   assert.equal(normalizeQuality("mi7"), "m7");
   assert.equal(normalizeQuality("ma7"), "maj7");
   assert.equal(normalizeQuality("Δ7"), "maj7");
   assert.equal(normalizeQuality("omit3"), "no3");
   // Known spellings outside the alias table stay as they are (just folded for audio).
   assert.equal(normalizeQuality("maj9"), "maj9");
   assert.equal(normalizeQuality("7♭9"), "7b9");
   // A custom suffix is preserved, so it can still fall back to the default voicing.
   assert.equal(normalizeQuality("xyz"), "xyz");
   assert.equal(normalizeQuality(""), "");
   assert.equal(normalizeQuality(undefined), "");
});

test("detectMode distinguishes letter chords from Nashville degrees", () => {
   assert.equal(detectMode("Cmaj7"), "chord");
   assert.equal(detectMode("g/b"), "chord");
   assert.equal(detectMode("1"), "nashville");
   assert.equal(detectMode("♭3"), "nashville");
   assert.equal(detectMode("#4m"), "nashville");
   assert.equal(detectMode(""), "chord");
});

test("foldChordKey normalizes unicode accidentals and casing", () => {
   assert.equal(foldChordKey("C♯m7"), "c#m7");
   assert.equal(foldChordKey("E♭maj7"), "ebmaj7");
   assert.equal(foldChordKey("  g / b "), "g/b");
});

test("suggestChords returns normalized letter chords, exact-first", () => {
   const out = suggestChords("cm7");
   assert.equal(out[0], "Cm7"); // exact match wins even from lowercase input
   assert.ok(out.every((value) => value.startsWith("C")));
});

test("suggestChords normalizes ascii accidentals to unicode", () => {
   const out = suggestChords("bb");
   assert.ok(out.includes("B♭")); // 'bb' → B♭ root
});

test("suggestChords generates slash chords on demand after '/'", () => {
   const out = suggestChords("g/b");
   assert.ok(out.includes("G/B"));
   assert.ok(out.every((value) => value.startsWith("G/")));
});

test("suggestChords offers the curated family for a bare degree (no quality colours)", () => {
   // The numeric dropdown is a notation writer's palette: the degree plus its two octaves —
   // NOT the quality colours (`1m`, `1maj7`, `2sus2`, …), which used to fill the whole list and
   // bury `#1` / `♭1` out of reach. The accidental is a FILTER (tested below): the crossed forms
   // are never mixed into the plain list, they swap it in one chip tap.
   assert.deepEqual(suggestChords("1"), ["1", "1\u0307", "1\u0323"]);
   assert.deepEqual(suggestChords("4", { mode: "numbers" }), ["4", "4\u0307", "4\u0323"]);
   // Neither a quality colour nor a crossed form may appear while no accidental is chosen.
   assert.ok(!suggestChords("1").some((value) => /[^\u0307\u03230-9]/u.test(value)));
});

test("suggestChords gives the sharp/flat family once the accidental is typed", () => {
   assert.deepEqual(suggestChords("#1"), ["#1", "#1\u0307", "#1\u0323"]);
   assert.deepEqual(suggestChords("♭1"), ["♭1", "♭1\u0307", "♭1\u0323"]);
   // `b` is only the TYPABLE alias for ♭; it canonicalises to the stored symbol.
   assert.deepEqual(suggestChords("b1"), ["♭1", "♭1\u0307", "♭1\u0323"]);
   assert.deepEqual(suggestChords("b3", { mode: "numbers" }), ["♭3", "♭3\u0307", "♭3\u0323"]);
   // Re-typing a placed note keeps its exact form first, so Enter commits what you see.
   assert.equal(suggestChords("#1\u0307")[0], "#1\u0307");
   assert.equal(suggestChords("1\u0323")[0], "1\u0323");
});

test("suggestChords: a bare accidental lists every degree without quality colours", () => {
   const out = suggestChords("#", { mode: "numbers" });
   assert.deepEqual(out.slice(0, 6), ["#1", "#1\u0307", "#1\u0323", "#2", "#2\u0307", "#2\u0323"]);
   assert.ok(!out.some((value) => /[^\u0307\u0323#♭0-9]/u.test(value)));
   // Chord Chart keeps its sharp-CHORD browsing for a bare "#" (the numbers arm is Numbers-mode only).
   assert.ok(suggestChords("#").every((value) => /^[A-G]/.test(value)));
});

test("suggestChords: quality colours stay reachable by typing them", () => {
   assert.ok(!suggestChords("1", { mode: "numbers" }).includes("1m"));
   assert.equal(suggestChords("1m", { mode: "numbers" })[0], "1m");
   assert.equal(suggestChords("1aug", { mode: "numbers" })[0], "1+");
   assert.equal(suggestChords("1m7b5", { mode: "numbers" })[0], "1ø7");
});

test("isNashvilleChord accepts the whole shared token grammar (and nothing more)", () => {
   for (const value of ["1", "0", "#1", "♯1", "♭7", "1\u0307", "♭3\u0307", "#5\u0323", "1m", "1maj7", "5", "1ø7"]) {
      assert.ok(isNashvilleChord(value), `${value} should be a Nashville token`);
   }
   // A lowercase letter chord is NOT swallowed by the number grammar: the bank stores a flat
   // seventh as `♭7`, so a `b7` value stays the chord the user typed.
   assert.equal(isNashvilleChord("b7"), false);
   assert.equal(isNashvilleChord("Am7"), false);
   assert.equal(isNashvilleChord("N.C."), false);
});

test("foldNashvilleKey drops combining octave dots for matching", () => {
   assert.equal(foldNashvilleKey("1\u0307"), "1");
   assert.equal(foldNashvilleKey("1\u0323"), "1");
   // The ♭ ↔ `b` fold is what makes the alias a QUERY convenience only.
   assert.equal(foldNashvilleKey("♭1"), foldNashvilleKey("b1"));
});

// ---- Half-step alterations: playback and the score -------------------------
// A raised degree must SOUND a semitone higher and a lowered one a semitone lower, in the
// register that degree sits in. The lowered tonic used to be broken: normalising the pitch
// class before the octave made `♭1` in C sound B4 (an octave + a semitone ABOVE the tonic)
// instead of B3, and `♭1̇` drifted a full octave away.
test("chordToMidiNotes moves an accidentalled degree exactly one semitone", () => {
   const KEY = "C";
   for (const degree of [1, 2, 3, 4, 5, 6, 7]) {
      const plain = chordToMidiNotes(String(degree), KEY)[0];
      const high = chordToMidiNotes(`${degree}\u0307`, KEY)[0];
      const low = chordToMidiNotes(`${degree}\u0323`, KEY)[0];
      assert.equal(chordToMidiNotes(`#${degree}`, KEY)[0], plain + 1, `#${degree} rises ½`);
      assert.equal(chordToMidiNotes(`\u266d${degree}`, KEY)[0], plain - 1, `\u266d${degree} falls ½`);
      // The same rule with each octave marker on top of the accidental.
      assert.equal(chordToMidiNotes(`#${degree}\u0307`, KEY)[0], high + 1, `#${degree}\u0307`);
      assert.equal(chordToMidiNotes(`\u266d${degree}\u0307`, KEY)[0], high - 1, `\u266d${degree}\u0307`);
      assert.equal(chordToMidiNotes(`#${degree}\u0323`, KEY)[0], low + 1, `#${degree}\u0323`);
      assert.equal(chordToMidiNotes(`\u266d${degree}\u0323`, KEY)[0], low - 1, `\u266d${degree}\u0323`);
   }
});

test("chordToMidiNotes keeps the documented registers for accidentals (key of C)", () => {
   assert.deepEqual(chordToMidiNotes("1", "C"), [60]);
   assert.deepEqual(chordToMidiNotes("#1", "C"), [61]); // C♯4
   assert.deepEqual(chordToMidiNotes("\u266d1", "C"), [59]); // B3 — BELOW the tonic, not B4
   assert.deepEqual(chordToMidiNotes("#1\u0307", "C"), [73]);
   assert.deepEqual(chordToMidiNotes("\u266d1\u0307", "C"), [71]);
   assert.deepEqual(chordToMidiNotes("\u266d1\u0323", "C"), [47]);
   // Pre-existing contracts that must not move — the regression net for this fix.
   assert.deepEqual(chordToMidiNotes("\u266d3\u0307", "C"), [75]);
   assert.deepEqual(chordToMidiNotes("#5\u0323", "C"), [56]);
   assert.deepEqual(chordToMidiNotes("\u266d7", "C"), [70]);
   // "0" is a REST and a typed `b` is only an alias: neither is ever stored, neither sounds.
   assert.deepEqual(chordToMidiNotes("0", "C"), []);
   assert.deepEqual(chordToMidiNotes("b1", "C"), []);
});

test("every suggested number is one playback can sound (no silent tokens)", () => {
   for (const query of ["1", "#1", "b1", "#", "\u266d3", "7"]) {
      for (const value of suggestChords(query, { mode: "numbers" })) {
         assert.ok(isNashvilleChord(value), `${value} (from "${query}") is not a Nashville token`);
         assert.ok(chordToMidiNotes(value, "C").length > 0, `${value} (from "${query}") would be silent`);
      }
   }
});

test("chordLabel draws the coret slash for a half-step alteration", () => {
   // Sharp → the slash rises to the right; flat → it falls to the right. The stored ♯/♭ glyph
   // stays in the DOM (hidden in the score) so the value is still selectable and announced.
   const sharp = chordLabel("#1");
   assert.match(sharp, /nashville-altered nashville-alt-sharp/);
   assert.match(sharp, /class="nashville-slash"/);
   assert.match(sharp, /aria-label="♯1"/);
   assert.match(sharp, /class="nashville-sign"/);
   const flat = chordLabel("\u266d1");
   assert.match(flat, /nashville-altered nashville-alt-flat/);
   assert.match(flat, /aria-label="♭1"/);
   // With an octave dot the wrapper every existing dot rule targets is kept, plus the mark.
   const high = chordLabel("#1\u0307");
   assert.match(high, /nashville-octave nashville-octave-high nashville-alt-sharp/);
   assert.match(high, /nashville-octave-dot/);
   assert.match(high, /nashville-slash/);
});

test("chordLabel output for plain values is byte-identical to before the feature", () => {
   assert.equal(chordLabel("1"), '<span class="chord-token">1</span>');
   assert.equal(chordLabel("1m7"), '<span class="chord-token">1m7</span>');
   assert.equal(chordLabel("Am7"), '<span class="chord-token">Am7</span>');
   assert.equal(chordLabel("G/B"), '<span class="chord-token">G/B</span>');
   assert.equal(
      chordLabel("1\u0307"),
      '<span class="chord-token"><span class="nashville-octave nashville-octave-high"><span class="nashville-degree">1</span><span class="nashville-octave-dot" aria-hidden="true">●</span></span></span>',
   );
});

test("beatHTML marks an accidentalled beat for the coret", () => {
   const section = {
      id: "sec-altered",
      name: "Intro",
      bars: 1,
      beats: { "0-0": { chord: "#1\u0307", duration: null }, "0-1": { chord: "\u266d3", duration: null } },
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: {},
   };
   const before = getState();
   setState({ ...before, editorMode: "numbers", lyricsEnabled: false, sections: [section], activeId: section.id });
   try {
      const high = beatHTML(section, 0, 0);
      assert.match(high, /nashville-alt-sharp/);
      assert.match(high, /nashville-slash/);
      assert.match(high, /nashville-octave-high/);
      const flat = beatHTML(section, 0, 1);
      assert.match(flat, /nashville-alt-flat/);
      assert.match(flat, /nashville-slash/);
   } finally {
      setState(before);
   }
});

test("the coret slash cannot change the printed layout (score geometry is measured)", () => {
   const css = readProjectFile("styles/score/preview.css");
   const block = (selector) => {
      const start = css.indexOf(`${selector} {`);
      return start === -1 ? "" : css.slice(start, css.indexOf("\n}", start) + 2);
   };
   const slash = block(".nashville-slash");
   assert.ok(slash, "the .nashville-slash rule is missing");
   assert.ok(slash.includes("position: absolute"), "the mark must stay out of flow");
   // pdf.js decides which printed barlines to drop (markMidRowBars) and how the paper
   // paginates by MEASURING the rendered bars, so the mark may add no width to the token.
   assert.ok(!/padding|letter-spacing|min-width|margin/.test(slash), `the slash widens the token: ${slash}`);
   assert.ok(slash.includes("print-color-adjust: exact"), "the stroke must survive printing");
   const wrapper = block(".nashville-altered");
   assert.ok(!/width|padding|letter-spacing/.test(wrapper), `the wrapper widens the token: ${wrapper}`);
   // Print geometry that other features are pinned to stays untouched.
   assert.ok(css.includes("--print-notation-h: 11.5mm;"));
   const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
   assert.equal((stripped.match(/var\(--print-notation-h\) \+ 1px/g) || []).length, 2);
});

test("the popover offers the half-step chips to number queries only", () => {
   const editor = readProjectFile("src/editor/chordEditor.js");
   assert.ok(editor.includes("chord-popover-accidentals"), "the chip row is missing");
   assert.ok(editor.includes('data-accidental="${value}"'), "the chips carry no value");
   assert.ok(editor.includes('{ value: "", label: "♮"'), "the natural chip is missing");
   assert.ok(editor.includes('{ value: "#", label: "♯"'), "the sharp chip is missing");
   assert.ok(editor.includes('{ value: "♭", label: "♭"'), "the flat chip is missing");
   // The chips appear for a NUMBER query (and a bare accidental in Numbers mode) — never for a
   // Chord Chart letter query, whose popover must stay exactly as it was.
   assert.ok(editor.includes('/^[♯#♭b]?[0-7]/u.test(raw)'), "the number-query gate is missing");
   assert.ok(editor.includes('ctx?.mode === "numbers" && /^[♯#♭b]?$/u.test(raw)'), "the numbers-mode gate is missing");
});

test("suggestChords keeps Nashville accidental in results", () => {
   const out = suggestChords("♭3");
   assert.ok(out.every((value) => value.startsWith("♭3")));
});

test("foldNashvilleKey drops combining octave dots for matching", () => {
   assert.equal(foldNashvilleKey("1\u0307"), "1");
   assert.equal(foldNashvilleKey("1\u0323"), "1");
});

test("suggestChords returns empty for blank input and unknown text", () => {
   assert.deepEqual(suggestChords(""), []);
   assert.deepEqual(suggestChords("   "), []);
   assert.equal(hasSuggestions("Xyz123"), false);
});

test("suggestChords respects the limit option", () => {
   assert.ok(suggestChords("C", { limit: 3 }).length <= 3);
});

test("BANK_QUALITIES is the agreed Option-1 practical set", () => {
   assert.equal(BANK_QUALITIES[0], ""); // major first
   assert.ok(BANK_QUALITIES.includes("maj7"));
   assert.ok(BANK_QUALITIES.includes("ø7")); // half-diminished (music symbol)
   assert.ok(BANK_QUALITIES.includes("°")); // diminished (music symbol)
   assert.ok(BANK_QUALITIES.includes("+")); // augmented (music symbol)
   assert.ok(!BANK_QUALITIES.includes("aug")); // spelled words are aliases, not stored values
   assert.ok(!BANK_QUALITIES.includes("dim"));
   assert.ok(!BANK_QUALITIES.includes("alt")); // jazz-only qualities excluded
});

test("suggestChords maps augmented/diminished/half-diminished words to music symbols", () => {
   // Augmented → "+"
   assert.equal(suggestChords("Gaug")[0], "G+");
   assert.equal(suggestChords("Gau")[0], "G+"); // partial word
   assert.equal(suggestChords("G+")[0], "G+"); // symbol itself still matches
   // Diminished → "°"
   assert.equal(suggestChords("Gdim")[0], "G°");
   assert.equal(suggestChords("Gdiminished")[0], "G°");
   // Half-diminished → "ø7"
   assert.equal(suggestChords("Gm7b5")[0], "Gø7");
   assert.equal(suggestChords("Ghalfdim")[0], "Gø7");
});

test("suggestChords maps quality aliases in Nashville mode too", () => {
   assert.equal(suggestChords("1aug")[0], "1+");
   assert.equal(suggestChords("1dim")[0], "1°");
   assert.equal(suggestChords("1m7b5")[0], "1ø7");
});

// Chord Chart mode: a numeric query surfaces Nashville degrees (incl. octave
// variants) so users can add numbers with high/low octaves without switching
// out of Chord Chart mode. Letters and slash queries keep letter-chord results.
test("suggestChords in chords mode surfaces Nashville octave variants for numeric queries", () => {
   const out = suggestChords("1", { mode: "chords", limit: 6 });
   assert.equal(out[0], "1"); // base degree first
   assert.ok(out.includes("1\u0307")); // octave-high 1̇
   assert.ok(out.includes("1\u0323")); // octave-low 1̣
   // Chord Chart gets the same curated family as Numbers mode.
   assert.deepEqual(out, ["1", "1\u0307", "1\u0323"]);
});

test("suggestChords in chords mode keeps letter chords for letter queries", () => {
   const out = suggestChords("C", { mode: "chords", limit: 4 });
   assert.ok(out.every((value) => /^[A-G]/.test(value))); // no Nashville leaked in
   assert.equal(out[0], "C");
});

test("suggestChords in chords mode still resolves slash chords first", () => {
   const out = suggestChords("G/", { mode: "chords", limit: 3 });
   assert.ok(out.every((value) => value.startsWith("G/")));
});

test("suggestChords in chords mode honours Nashville accidentals", () => {
   const out = suggestChords("♭3", { mode: "chords", limit: 5 });
   assert.ok(out.length > 0);
   assert.ok(out.every((value) => value.startsWith("♭3")));
});

// ---- Copy / paste helpers (extractBar, replaceBarContent, cloneSection) ----
import {
   extractBar,
   replaceBarContent,
   cloneSection,
   extractBars,
   extractBarsByIndices,
   insertBars,
   overwriteBars,
} from "../src/notation/notation.js?v=20260808-hide-dot-active";

test("extractBar pulls out a single bar's beats and lyrics normalized to bar 0", () => {
   const section = {
      id: "sec-test",
      name: "Test",
      bars: 3,
      beats: { "0-0": "C", "0-1:0": "G", "1-0": "F", "1-1": "Am" },
      lyricBeats: {},
   };
   const payload = extractBar(section, 0);
   assert.deepStrictEqual(payload, {
      beats: { "0-0": "C", "0-1:0": "G" },
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: {},
   });
});

test("extractBar includes lyrics", () => {
   const section = {
      id: "sec-test",
      name: "Test",
      bars: 2,
      beats: {},
      lyricBeats: { "1-0": "hallelujah" },
   };
   const payload = extractBar(section, 1);
   assert.deepStrictEqual(payload, {
      beats: {},
      lyricBeats: { "0-0": "hallelujah" },
      chordAboveBeats: {},
      chordAboveBars: {},
   });
});

test("replaceBarContent overwrites target bar with copied payload", () => {
   const section = {
      id: "sec-test",
      name: "Test",
      bars: 2,
      beats: { "0-0": "C", "0-1": "Dm" },
      lyricBeats: {},
   };
   const payload = { beats: { "0-0": "G", "0-1:0": "Em" }, lyricBeats: {} };
   replaceBarContent(section, 1, payload);
   assert.strictEqual(section.bars, 2);
   assert.strictEqual(section.beats["1-0"], "G");
   assert.strictEqual(section.beats["1-1:0"], "Em");
   // Bar 0 is untouched
   assert.strictEqual(section.beats["0-0"], "C");
   assert.strictEqual(section.beats["0-1"], "Dm");
});

test("cloneSection creates a fresh id and allows renaming", () => {
   const original = {
      id: "original-id",
      name: "Verse",
      bars: 4,
      beats: {},
      lyricBeats: {},
   };
   const clone = cloneSection(original, "Verse Copy");
   assert.ok(clone.id !== original.id);
   assert.match(clone.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
   assert.equal(clone.name, "Verse Copy");
   // Original untouched
   assert.equal(original.id, "original-id");
   assert.equal(original.name, "Verse");
});

test("replaceBarContent clears existing content before writing payload", () => {
   const section = {
      id: "sec-test",
      name: "Test",
      bars: 2,
      beats: { "1-0": "X", "1-1": "Y" },
      lyricBeats: {},
   };
   const payload = { beats: { "0-0": "Z" }, lyricBeats: {} };
   replaceBarContent(section, 1, payload);
   assert.equal(section.beats["1-0"], "Z");
   assert.equal(section.beats["1-1"], undefined); // cleared
});

test("extractBar/replaceBarContent carry the per-bar chord-row override", () => {
   const source = { bars: 3, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: { "1": false } };
   const payload = extractBar(source, 1);
   assert.deepEqual(payload.chordAboveBars, { "0": false });
   const target = { bars: 3, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: { "2": true } };
   replaceBarContent(target, 2, payload);
   // The copied bar's own visibility wins.
   assert.equal(target.chordAboveBars["2"], false);
   // A source bar without an explicit override resets the target to "inherit".
   const plain = extractBar({ bars: 1, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: {} }, 0);
   replaceBarContent(target, 2, plain);
   assert.equal(target.chordAboveBars["2"], undefined);
});

test("extractBars pulls a contiguous range normalized to bar 0", () => {
   const section = {
      id: "s",
      name: "T",
      bars: 5,
      beats: { "0-0": "C", "1-0": "F", "2-0": "G", "2-1:0": "Am", "3-0": "Dm" },
      lyricBeats: { "2-0": "hymn" },
   };
   const payload = extractBars(section, 1, 2);
   assert.equal(payload.count, 2);
   // bar 1 -> 0, bar 2 -> 1
   assert.deepStrictEqual(payload.beats, { "0-0": "F", "1-0": "G", "1-1:0": "Am" });
   assert.deepStrictEqual(payload.lyricBeats, { "1-0": "hymn" });
});

test("extractBars is order-agnostic (start/end swapped)", () => {
   const section = { id: "s", name: "T", bars: 4, beats: { "1-0": "F", "2-0": "G" }, lyricBeats: {} };
   const a = extractBars(section, 1, 2);
   const b = extractBars(section, 2, 1);
   assert.deepStrictEqual(a, b);
});

test("extractBarsByIndices packs a non-contiguous set ascending and pastes in order", () => {
   const section = {
      id: "s",
      name: "T",
      bars: 5,
      beats: { "0-0": "C", "1-0": "F", "2-0": "G", "3-0": "Dm", "4-0": "Am" },
      lyricBeats: { "2-0": "word" },
      chordAboveBars: { "2": false },
   };
   // Passed unsorted on purpose: the payload must come out in ascending bar order.
   const payload = extractBarsByIndices(section, [2, 0]);
   assert.equal(payload.count, 2);
   // bar 0 -> output bar 0, bar 2 -> output bar 1
   assert.deepStrictEqual(payload.beats, { "0-0": "C", "1-0": "G" });
   assert.deepStrictEqual(payload.lyricBeats, { "1-0": "word" });
   // The chord-row override follows its bar into the packed payload.
   assert.deepStrictEqual(payload.chordAboveBars, { "1": false });
   // Paste fills consecutive bars in that order: target 3 gets bar 0's "C",
   // target 4 gets bar 2's "G" (this is the copy-{1,3}-then-paste behaviour).
   const target = { id: "t", name: "T", bars: 5, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: {} };
   assert.equal(overwriteBars(target, 3, payload), true);
   assert.equal(target.beats["3-0"], "C");
   assert.equal(target.beats["4-0"], "G");
   // Duplicate indices collapse (a Set), and an empty set yields an empty payload.
   assert.equal(extractBarsByIndices(section, [2, 2, 0]).count, 2);
   assert.equal(extractBarsByIndices(section, []).count, 0);
});

test("insertBars shifts existing bars right and writes payload before target", () => {
   const section = {
      id: "s",
      name: "T",
      bars: 3,
      beats: { "0-0": "C", "1-0": "F", "2-0": "G" },
      lyricBeats: {},
   };
   const payload = { count: 2, beats: { "0-0": "X", "1-0": "Y" }, lyricBeats: {} };
   const ok = insertBars(section, 1, payload); // insert BEFORE bar 1
   assert.equal(ok, true);
   assert.equal(section.bars, 5);
   // bar 0 stays
   assert.equal(section.beats["0-0"], "C");
   // payload lands at bars 1 and 2
   assert.equal(section.beats["1-0"], "X");
   assert.equal(section.beats["2-0"], "Y");
   // old bar 1 (F) shifted to bar 3, old bar 2 (G) shifted to bar 4
   assert.equal(section.beats["3-0"], "F");
   assert.equal(section.beats["4-0"], "G");
});

test("insertBars respects MAX_BARS and refuses to overflow", () => {
   const section = { id: "s", name: "T", bars: 95, beats: {}, lyricBeats: {} };
   const payload = { count: 2, beats: { "0-0": "X" }, lyricBeats: {} };
   const ok = insertBars(section, 0, payload); // 95 + 2 = 97 > 96
   assert.equal(ok, false);
   assert.equal(section.bars, 95); // unchanged
});

test("extractBars/insertBars/overwriteBars keep per-bar chord-row overrides aligned", () => {
   const source = {
      bars: 4,
      beats: {},
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: { "1": true, "2": false, "3": true },
   };
   const payload = extractBars(source, 1, 2);
   assert.deepEqual(payload.chordAboveBars, { "0": true, "1": false });
   // insert before bar 2 → flags at/after bar 2 shift right by `count`
   const inserted = {
      bars: 4,
      beats: {},
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: { "0": true, "1": false, "2": false, "3": true },
   };
   insertBars(inserted, 2, payload);
   assert.equal(inserted.bars, 6);
   assert.deepEqual(inserted.chordAboveBars, {
      "0": true,
      "1": false,
      "2": true,
      "3": false,
      "4": false,
      "5": true,
   });
   // overwrite clears the target range first, then writes the payload there
   const overwritten = {
      bars: 4,
      beats: {},
      lyricBeats: {},
      chordAboveBeats: {},
      chordAboveBars: { "0": true, "2": false, "3": true },
   };
   overwriteBars(overwritten, 2, payload);
   assert.deepEqual(overwritten.chordAboveBars, { "0": true, "2": true, "3": false });
});

// --- share.js: encode/decode roundtrip -------------------------------------

const SAMPLE_PROJECT = {
   format: "chord-sheet",
   version: 2,
   title: "Amazing Grace ♭",
   artist: "Traditional",
   key: "G",
   meter: "3/4",
   sections: [
      {
         id: "a",
         name: "Verse 1",
         bars: 4,
         beats: { "0-0": { chord: "G" }, "1-0": { chord: "C" } },
         lyricBeats: { "0-0": "A-ma-zing" },
      },
   ],
};

test("encodeShare/decodeShare roundtrip preserves the project (gzip when available)", async () => {
   const payload = await encodeShare(SAMPLE_PROJECT);
   assert.equal(typeof payload, "string");
   assert.equal(payload[0], "w"); // magic marker
   assert.ok(payload[1] === "g" || payload[1] === "p"); // scheme
   const decoded = await decodeShare(payload);
   assert.deepEqual(decoded, SAMPLE_PROJECT);
});

test("gzip payload is smaller than plain for a realistic project", async () => {
   if (!canCompress()) return; // environment without CompressionStream
   const payload = await encodeShare(SAMPLE_PROJECT);
   assert.equal(payload[1], "g"); // should pick gzip
});

test("decodeShare rejects non-share strings", async () => {
   await assert.rejects(() => decodeShare("not-a-payload"));
   await assert.rejects(() => decodeShare(""));
   await assert.rejects(() => decodeShare("wz123")); // unknown scheme 'z'
});

test("buildShareLink puts payload in the fragment after #/import?d=", async () => {
   const link = await buildShareLink(SAMPLE_PROJECT, "https://host/app/index.html#/editor");
   assert.ok(link.startsWith("https://host/app/index.html#/import?d="));
   // and it must decode back to the same project
   const payload = extractPayloadFromLink(link);
   assert.deepEqual(await decodeShare(payload), SAMPLE_PROJECT);
});

test("extractPayloadFromLink handles full links, bare fragments, and raw payloads", async () => {
   const payload = await encodeShare(SAMPLE_PROJECT);
   assert.equal(extractPayloadFromLink(`https://host/app/#/import?d=${payload}`), payload);
   assert.equal(extractPayloadFromLink(`#/import?d=${payload}`), payload);
   assert.equal(extractPayloadFromLink(`  ${payload}  `), payload); // raw payload with whitespace
   assert.equal(extractPayloadFromLink("https://host/app/"), null); // no payload
   assert.equal(extractPayloadFromLink(""), null);
});

// ---- Multi-bar clipboard: extract / insert / overwrite ----
// These back the "Copy bars" selection feature (copy a bar range, paste it
// over another range). They are pure data transforms on section.beats.

test("extractBars pulls a bar range and rebases slot indices to 0", () => {
   const section = {
      bars: 4,
      beats: {
         "0-0": { chord: "C", duration: null },
         "1-0": { chord: "G", duration: null },
         "2-0": { chord: "Am", duration: null },
         "3-0": { chord: "F", duration: null },
      },
      lyricBeats: { "1-0": "hello", "2-0": "world" },
   };
   const payload = extractBars(section, 1, 2);
   assert.equal(payload.count, 2);
   // bar 1 -> 0, bar 2 -> 1 (rebased)
   assert.equal(payload.beats["0-0"].chord, "G");
   assert.equal(payload.beats["1-0"].chord, "Am");
   assert.equal(payload.lyricBeats["0-0"], "hello");
   assert.equal(payload.lyricBeats["1-0"], "world");
   // bars outside the range are excluded
   assert.equal(payload.beats["2-0"], undefined);
});

test("extractBars normalizes a reversed range (endBar < startBar)", () => {
   const section = {
      bars: 3,
      beats: { "0-0": { chord: "C", duration: null }, "2-0": { chord: "F", duration: null } },
      lyricBeats: {},
   };
   const payload = extractBars(section, 2, 0);
   assert.equal(payload.count, 3);
   assert.equal(payload.beats["0-0"].chord, "C");
   assert.equal(payload.beats["2-0"].chord, "F");
});

test("overwriteBars replaces the target range in place without shifting other bars", () => {
   const section = {
      bars: 4,
      beats: {
         "0-0": { chord: "C", duration: null },
         "1-0": { chord: "G", duration: null },
         "2-0": { chord: "Am", duration: null },
         "3-0": { chord: "F", duration: null },
      },
      lyricBeats: { "3-0": "keep-me" },
   };
   const payload = extractBars(section, 0, 1); // copy C, G
   const ok = overwriteBars(section, 2, payload); // paste over bars 2..3
   assert.equal(ok, true);
   assert.equal(section.beats["2-0"].chord, "C");
   assert.equal(section.beats["3-0"].chord, "G");
   // Overwritten bar 3's old lyric is cleared (range was replaced).
   assert.equal(section.lyricBeats["3-0"], undefined);
   // Bars before the paste target are untouched.
   assert.equal(section.beats["0-0"].chord, "C");
   assert.equal(section.beats["1-0"].chord, "G");
   // No extra bars were inserted.
   assert.equal(section.bars, 4);
});

test("overwriteBars grows section.bars when the pasted range extends past the end", () => {
   const section = {
      bars: 2,
      beats: { "0-0": { chord: "C", duration: null }, "1-0": { chord: "G", duration: null } },
      lyricBeats: {},
   };
   const payload = extractBars(section, 0, 1); // 2 bars
   const ok = overwriteBars(section, 1, payload); // paste at bar 1 -> covers bars 1,2
   assert.equal(ok, true);
   assert.equal(section.bars, 3); // grew from 2 to 3
   assert.equal(section.beats["1-0"].chord, "C");
   assert.equal(section.beats["2-0"].chord, "G");
});

test("overwriteBars refuses to exceed MAX_BARS", () => {
   const section = { bars: MAX_BARS, beats: {}, lyricBeats: {} };
   const payload = { count: 2, beats: { "0-0": { chord: "C", duration: null } }, lyricBeats: {} };
   // Pasting 2 bars at the last index would need MAX_BARS+1 bars.
   const ok = overwriteBars(section, MAX_BARS - 1, payload);
   assert.equal(ok, false);
   assert.equal(section.bars, MAX_BARS); // unchanged
});

test("insertBars shifts existing bars right and respects MAX_BARS", () => {
   const section = {
      bars: 2,
      beats: { "0-0": { chord: "C", duration: null }, "1-0": { chord: "G", duration: null } },
      lyricBeats: { "1-0": "world" },
   };
   const payload = { count: 1, beats: { "0-0": { chord: "Am", duration: null } }, lyricBeats: {} };
   const ok = insertBars(section, 1, payload); // insert 1 bar before bar 1
   assert.equal(ok, true);
   assert.equal(section.bars, 3);
   assert.equal(section.beats["0-0"].chord, "C"); // unchanged
   assert.equal(section.beats["1-0"].chord, "Am"); // inserted
   assert.equal(section.beats["2-0"].chord, "G"); // shifted right
   assert.equal(section.lyricBeats["2-0"], "world"); // lyric followed its bar
});

// ---- song + version composition (pure helpers from cloud.js) ----

test("composeSong produces a clean editor project without version meta fields", () => {
   const meta = { title: "O Holy Night", artist: "Adolphe Adam" };
   const version = {
      versionId: "version-x",
      label: "Pop",
      number: 2,
      createdAt: 1,
      updatedAt: 2,
      cloudId: "song-c",
      songId: "song-s",
      format: "chord-sheet",
      version: 2,
      title: "O Holy Night",
      artist: "Adolphe Adam",
      key: "C",
      meter: "4/4",
      sections: [{ name: "Intro", bars: [] }],
      pdfOptions: { paper: "A4" },
   };
   const out = composeSong(meta, version);
   assert.equal(out.title, "O Holy Night");
   assert.equal(out.artist, "Adolphe Adam");
   assert.equal(out.key, "C");
   assert.deepEqual(out.sections, [{ name: "Intro", bars: [] }]);
   assert.equal(out.pdfOptions.paper, "A4");
   for (const key of ["label", "number", "createdAt", "updatedAt", "cloudId", "songId", "versionId"]) {
      assert.ok(!(key in out), `version meta field "${key}" must not leak into the project`);
   }
});

test("composeSong prefers the song metadata for title/artist", () => {
   const meta = { title: "From Meta", artist: "Arranger" };
   const version = { format: "chord-sheet", title: "From Version", artist: "Old", sections: [] };
   const out = composeSong(meta, version);
   assert.equal(out.title, "From Meta");
   assert.equal(out.artist, "Arranger");
});

test("composeSong falls back to the version's own title when metadata is missing", () => {
   const out = composeSong({}, { format: "chord-sheet", title: "Fallback", artist: "A", sections: [] });
   assert.equal(out.title, "Fallback");
});

test("composeSong fills generic placeholders when nothing provides a title", () => {
   const out = composeSong(null, { format: "chord-sheet", sections: [] });
   assert.equal(out.title, "Song Title");
   assert.equal(out.artist, "Artist / Composer");
});

// ---- Per-version YouTube links ---------------------------------------------
// Every arrangement of a song owns its OWN link (`youtubeUrl` + `youtubeId` on the version
// document). The editor document carries it, so a save writes the same link back instead of
// erasing it — that was the reported "the YouTube link I attached doesn't stick" bug.
test("each version keeps its own YouTube link through the whole round-trip", () => {
   const version = {
      versionId: "v2",
      label: "Acoustic",
      number: 2,
      youtubeUrl: "https://youtu.be/aBcD_eFgH1-",
      youtubeId: "aBcD_eFgH1-",
      format: "chord-sheet",
      sections: [{ name: "Intro", bars: [] }],
   };
   // 1) Loading a version into the editor keeps the link (composeSong used to delete it).
   const project = composeSong({ title: "Song", artist: "Band" }, version);
   assert.equal(project.youtubeId, "aBcD_eFgH1-");
   assert.equal(project.youtubeUrl, "https://youtu.be/aBcD_eFgH1-");
   assert.ok(!("label" in project) && !("number" in project), "version meta is still stripped");
   // 2) The album copy carries it too.
   const copy = versionCopyPayload(version);
   assert.equal(copy.youtubeId, "aBcD_eFgH1-");
   assert.equal(copy.youtubeUrl, "https://youtu.be/aBcD_eFgH1-");
   // 3) The editor document normalizes both halves, so neither can go missing.
   const canonical = { youtubeUrl: canonicalUrl("aBcD_eFgH1-"), youtubeId: "aBcD_eFgH1-" };
   assert.deepEqual(youtubeFields({ youtubeUrl: "https://youtu.be/aBcD_eFgH1-", youtubeId: "" }), canonical);
   assert.deepEqual(youtubeFields({ youtubeId: "aBcD_eFgH1-" }), canonical);
   assert.deepEqual(youtubeFields({ youtubeUrl: "aBcD_eFgH1-" }), canonical, "a bare id counts");
   // Removing the link (dialog → ✕) clears both halves…
   assert.deepEqual(youtubeFields({ youtubeUrl: null, youtubeId: null }), { youtubeUrl: "", youtubeId: "" });
   assert.deepEqual(youtubeFields(null), { youtubeUrl: "", youtubeId: "" });
   // …and an unrecognizable URL is preserved verbatim instead of being dropped.
   assert.deepEqual(youtubeFields({ youtubeUrl: "https://example.com/v/1" }), {
      youtubeUrl: "https://example.com/v/1",
      youtubeId: "",
   });
   // 4) Wiring: the editor document carries the link, the version dialog writes IMMEDIATELY
   //    (no staging that a navigation could drop), and the song's "latest" summary keeps the id.
   const events = readProjectFile("src/events.js");
   assert.match(events, /youtubeUrl: youtube\.youtubeUrl \|\| null/, "projectData must export the link");
   assert.match(events, /youtubeId: youtube\.youtubeId \|\| null/);
   assert.match(events, /youtubeFields\(project\)/, "applyProject must restore the link");
   assert.match(
      events,
      /isRestoring \? youtubeFields\(getState\(\)\) : youtubeFields\(project\)/,
      "undo/redo must keep the live link (a replay is score-only)",
   );
   const cloud = readProjectFile("src/cloud.js");
   assert.ok(!/delete project\.youtubeUrl/.test(cloud), "composeSong must keep the version link");
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.ok(
      !/setPendingVersionDetails|persistPendingVersionDetails/.test(cloudUI),
      "the version-details dialog writes immediately instead of staging",
   );
   assert.match(cloudUI, /saveVersionFor\(ctx, versionId, \{/, "✎ writes that version's document");
   assert.match(cloudUI, /bridge\.setVersionYoutube\(\{/, "the open document follows the edit");
   assert.equal(
      (cloudUI.match(/project\.youtubeId \|\| undefined/g) || []).length,
      2,
      "both first-version saves must pass the real id (they used to wipe latestYoutubeId)",
   );
});

test("isLegacySongDoc flags flat documents that still hold sections inline", () => {
   assert.equal(isLegacySongDoc({ sections: [] }), true);
   assert.equal(isLegacySongDoc({ title: "new", versionCount: 1 }), false);
   assert.equal(isLegacySongDoc({}), false);
   assert.equal(isLegacySongDoc(null), false);
});

test("composeSong preserves the full project shape for PDF/export compatibility", () => {
   const meta = { title: "T", artist: "A" };
   const version = {
      format: "chord-sheet",
      version: 2,
      title: "T",
      artist: "A",
      key: "G",
      meter: "3/4",
      bpm: 90,
      lyricsEnabled: true,
      chordAboveEnabled: false,
      nashvilleNumber: "1",
      nashvilleAccidental: "#",
      slashChords: ["G/B"],
      sections: [{ name: "Verse", bars: 2, beats: { "0-0": "C" } }],
      pdfOptions: { fontSize: 14 },
   };
   const out = composeSong(meta, version);
   assert.deepEqual(out, {
      format: "chord-sheet",
      version: 2,
      title: "T",
      artist: "A",
      key: "G",
      meter: "3/4",
      bpm: 90,
      lyricsEnabled: true,
      chordAboveEnabled: false,
      nashvilleNumber: "1",
      nashvilleAccidental: "#",
      slashChords: ["G/B"],
      sections: [{ name: "Verse", bars: 2, beats: { "0-0": "C" } }],
      pdfOptions: { fontSize: 14 },
   });
});

// ---- YouTube link parsing (pure helpers from youtube.js) ----

test("parseYoutubeUrl extracts the id from common URL forms", () => {
   const id = "dQw4w9WgXcQ";
   const forms = [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/watch?v=${id}&list=PL1234`,
      id, // bare 11-char id
   ];
   for (const form of forms) {
      const out = parseYoutubeUrl(form);
      assert.equal(out?.videoId, id, `expected id for ${form}`);
      assert.equal(out?.url, `https://www.youtube.com/watch?v=${id}`);
   }
});

test("parseYoutubeUrl rejects invalid or non-YouTube input", () => {
   const bad = ["", "   ", "not a video", "https://vimeo.com/12345", "https://example.com/dQw4w9WgXcQ", "abc"];
   for (const value of bad) {
      assert.equal(parseYoutubeUrl(value), null, `expected null for ${JSON.stringify(value)}`);
   }
});

// A chart is often taken from a full-set video, so the "start at" marker must survive: it is
// parsed into seconds and re-emitted on the canonical URL (which is what gets stored per version).
test("a youtu.be start time is kept and normalized to &t=<seconds>", () => {
   const id = "fT68qylOwWg";
   const withStart = [
      [`https://youtu.be/${id}?t=3214`, 3214],
      [`https://www.youtube.com/watch?v=${id}&t=3214s`, 3214],
      [`https://www.youtube.com/watch?v=${id}&start=3214`, 3214],
      [`https://www.youtube.com/watch?v=${id}#t=53m34s`, 3214],
      [`https://www.youtube.com/watch?v=${id}&t=53m34s`, 3214],
      [`https://youtu.be/${id}?si=AbCdEf12345&t=1h2m3s&list=PL123`, 3723],
   ];
   for (const [form, seconds] of withStart) {
      const out = parseYoutubeUrl(form);
      assert.equal(out?.videoId, id, `id for ${form}`);
      assert.equal(out?.start, seconds, `seconds for ${form}`);
      assert.equal(out?.url, `https://www.youtube.com/watch?v=${id}&t=${seconds}`, `url for ${form}`);
   }
   // No marker (or a useless one) → plain canonical URL, exactly as before this change.
   for (const form of [
      `https://youtu.be/${id}`,
      `https://www.youtube.com/watch?v=${id}&t=0`,
      `https://www.youtube.com/watch?v=${id}&t=junk`,
      `https://youtu.be/${id}?list=PL123`,
      id,
   ]) {
      const out = parseYoutubeUrl(form);
      assert.equal(out?.start, null, `no start for ${form}`);
      assert.equal(out?.url, `https://www.youtube.com/watch?v=${id}`, `plain url for ${form}`);
   }
   // Formatting + parsing helpers.
   assert.equal(parseStartTime("3214"), 3214);
   assert.equal(parseStartTime("90s"), 90);
   assert.equal(parseStartTime("2m"), 120);
   assert.equal(parseStartTime("1h2m3s"), 3723);
   assert.equal(parseStartTime("0"), null);
   assert.equal(parseStartTime("-5"), null);
   assert.equal(parseStartTime("abc"), null);
   assert.equal(parseStartTime(null), null);
   assert.equal(formatStartTime(3214), "53:34");
   assert.equal(formatStartTime(3723), "1:02:03");
   assert.equal(formatStartTime(0), "");
});

test("a version keeps its YouTube start time through every save", () => {
   const id = "fT68qylOwWg";
   const pasted = `https://youtu.be/${id}?t=3214`;
   const canonical = `https://www.youtube.com/watch?v=${id}&t=3214`;
   // 1) What the dialog saves (parsed.url) already carries the marker.
   assert.equal(parseYoutubeUrl(pasted).url, canonical);
   // 2) …and the editor document round-trips it (id ↔ URL normalization keeps the time).
   assert.deepEqual(youtubeFields({ youtubeUrl: pasted }), { youtubeUrl: canonical, youtubeId: id });
   assert.deepEqual(youtubeFields({ youtubeUrl: canonical, youtubeId: id }), {
      youtubeUrl: canonical,
      youtubeId: id,
   });
   assert.deepEqual(youtubeFields({ youtubeId: id }), {
      youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
      youtubeId: id,
   });
   // 3) composeSong (loading a version) keeps the stored URL verbatim — marker included.
   const project = composeSong({ title: "T" }, { label: "A", youtubeUrl: canonical, youtubeId: id, sections: [] });
   assert.equal(project.youtubeUrl, canonical);
   // 4) The dialog's thumbnail opens YouTube at that second and says so.
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /thumb\.title = at \? `\$\{DEFAULT_YT_THUMB_TITLE\} — starts at \$\{at\}`/);
});

// The editor shows the link of the arrangement being edited as a topbar chip, in EVERY writing
// mode. It is painted from the document (render.js), so it can never disagree with the score, and
// it never reaches paper (the whole topbar is hidden while printing).
test("the editor shows the arrangement's YouTube link as a topbar chip", () => {
   const id = "fT68qylOwWg";
   const canonical = `https://www.youtube.com/watch?v=${id}&t=3214`;
   // 1) View-model: with a link (+ start), with a link, and with nothing to show.
   assert.deepEqual(youtubeChipMeta({ youtubeUrl: `https://youtu.be/${id}?t=3214` }), {
      hasLink: true,
      href: canonical,
      thumb: thumbnailUrl(id, "mqdefault"),
      label: "▶ 53:34",
      title: "Open on YouTube — starts at 53:34",
   });
   assert.deepEqual(youtubeChipMeta({ youtubeId: id }), {
      hasLink: true,
      href: `https://www.youtube.com/watch?v=${id}`,
      thumb: thumbnailUrl(id, "mqdefault"),
      label: "▶",
      title: "Open on YouTube",
   });
   for (const empty of [{}, null, { youtubeUrl: "" }, { youtubeId: "  " }]) {
      assert.equal(youtubeChipMeta(empty).hasLink, false, `no chip for ${JSON.stringify(empty)}`);
   }
   // 2) Markup: ONE chip container with two states (no separate "add" button), plus the
   // link dialog. The chip lives in the topbar (print-hidden) and says so when a version has
   // no video yet instead of leaving the previous version's thumbnail on screen.
   const html = readProjectFile("index.html");
   assert.match(html, /id="youtubeChip" data-state="none"/);
   assert.match(html, /id="youtubeChipOpen"/);
   assert.match(html, /id="youtubeChipEdit"/);
   assert.match(html, /id="youtubeChipNone"/);
   assert.match(html, /<\/svg><\/span> No video/);
   assert.ok(!/youtubeChipAdd/.test(html), "the separate + YouTube button is gone");
   assert.match(html, /id="youtubeLinkDialog"/);
   assert.match(html, /id="youtubeLinkInput"/);
   const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/);
   assert.ok(topbar && /id="youtubeChip"/.test(topbar[0]), "the chip belongs to the topbar");
   assert.match(readProjectFile("styles/ui.css"), /html\.is-print-layout \.topbar,/);
   // State-driven visibility: a `hidden` attribute would lose against the chip's own `display`
   // (that is exactly how a stale link stayed visible after a version switch).
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.youtube-chip\[data-state="none"\] \.youtube-chip-open \{\s*display: none;/);
   assert.match(css, /\.youtube-chip\[data-state="link"\] \.youtube-chip-none \{\s*display: none;/);
   // Empty state: one quiet dashed pill that is itself the action (the ✎ is hidden there), so
   // the "no video" case is a single, simple control instead of a pill plus a second button.
   assert.match(css, /\.youtube-chip\[data-state="none"\] \.youtube-chip-edit \{\s*display: none;/);
   assert.match(css, /\.youtube-chip-none \{\s*display: inline-flex;[\s\S]{0,220}?border: 1px dashed/);
   assert.ok(!/youtube-chip-add/.test(css), "no leftover styles for the removed button");
   // 3) Wiring: render paints BOTH states (and clears the stale still), events owns the clicks.
   const render = readProjectFile("src/render/render.js");
   assert.match(render, /const chipMeta = youtubeChipMeta\(state\);/);
   assert.match(render, /chipWrap\.dataset\.state = chipMeta\.hasLink \? "link" : "none";/);
   assert.match(render, /openBtn\.dataset\.href = chipMeta\.href;/);
   assert.match(render, /else thumb\.removeAttribute\("src"\);/);
   const events = readProjectFile("src/events.js");
   assert.match(events, /function bindYoutubeChip\(\)/);
   assert.match(events, /window\.open\(href, "_blank", "noopener"\)/);
   assert.match(events, /cloudControl\.openVersionDetailsForCurrent\(\)/);
   assert.match(events, /setVersionYoutube\(\{ youtubeUrl: result\.url, youtubeId: result\.id \}\)/);
   assert.match(events, /isMemberReadOnly: \(\) => memberReadOnly\(\)/);
   assert.match(events, /\$\("#youtubeChipNone"\)\?\.addEventListener\("click"/, "the empty pill is the action");
   assert.ok(!/youtubeChipAdd/.test(events), "no leftover binding for the removed button");
   assert.match(readProjectFile("src/cloudUI.js"), /openVersionDetailsForCurrent: \(\) => \{/);
   // Read-only members keep the chip but lose the ✎.
   assert.match(css, /\.youtube-chip\[data-readonly="true"\] \.youtube-chip-edit/);
});

test("canonicalUrl and thumbnailUrl helpers", () => {
   assert.equal(canonicalUrl("abc123XYZ-q"), "https://www.youtube.com/watch?v=abc123XYZ-q");
   assert.equal(thumbnailUrl("abc"), "https://i.ytimg.com/vi/abc/mqdefault.jpg");
   assert.equal(thumbnailUrl("abc", "hqdefault"), "https://i.ytimg.com/vi/abc/hqdefault.jpg");
   assert.equal(thumbnailUrl("abc", "bogus"), "https://i.ytimg.com/vi/abc/mqdefault.jpg");
});

// ---- Member identity (pure helper from identity.js) ----
// Google sign-in fills Auth.displayName, but email/password sign-up does NOT —
// so the member list derives a readable name from the email's local part instead
// of showing a generic "Musician" for everyone.

test("friendlyName prefers the explicit displayName / member name", () => {
   assert.equal(friendlyName({ displayName: "Dhandy J", email: "x7k2p9@gmail.com" }), "Dhandy J");
   assert.equal(friendlyName({ name: "Pak Budi", email: "bud@gmail.com" }), "Pak Budi");
   assert.equal(friendlyName({ displayName: "  Sarah  ", email: "x@y.com" }), "Sarah");
});

test("friendlyName derives a readable name from the email local part", () => {
   assert.equal(friendlyName({ email: "dhandy.joe@gmail.com" }), "Dhandy Joe");
   assert.equal(friendlyName({ email: "sarah_w@example.com" }), "Sarah W");
   assert.equal(friendlyName({ email: "joe2@gmail.com" }), "Joe");
   assert.equal(friendlyName({ email: "d.handy-joenathan+team@gmail.com" }), "D Handy Joenathan");
});

test("friendlyName returns empty for id-like or missing addresses (caller keeps its fallback)", () => {
   const rejected = ["x7k2p9@gmail.com", "a@b.com", "", "   ", "user_12345678@mail.com", "12345678@mail.com"];
   for (const email of rejected) {
      assert.equal(friendlyName({ email }), "", `expected no derived name for ${JSON.stringify(email)}`);
   }
   assert.equal(friendlyName(), "");
   assert.equal(friendlyName({}), "");
   assert.equal(friendlyName({ email: undefined, name: "" }), "");
});

test("friendlyName caps the derived name to three words and 28 characters", () => {
   assert.equal(friendlyName({ email: "one.two.three.four.five@example.com" }), "One Two Three");
   assert.ok(friendlyName({ email: "abcdefghijklmnopqrstuvwxyz1234@example.com" }).length <= 28);
});

// ---- Album invite codes (pure helpers from cloud.js) ----

test("generateInviteCode produces XXXX-XXXX from an unambiguous alphabet", () => {
   for (let i = 0; i < 25; i++) {
      const code = generateInviteCode();
      assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      // I / O / 0 / 1 are excluded so a code read from a photo is never ambiguous.
      assert.ok(!/[IO01]/.test(code), `code must avoid I/O/0/1: ${code}`);
   }
});

test("normalizeInviteCode canonicalises typed codes and rejects the rest", () => {
   assert.equal(normalizeInviteCode("7fq3-xk2n"), "7FQ3-XK2N");
   assert.equal(normalizeInviteCode("7fq3xk2n"), "7FQ3-XK2N");
   assert.equal(normalizeInviteCode("  7FQ3 XK2N "), "7FQ3-XK2N");
   for (const bad of ["", "ABC", "7FQ3-XK2N9", "abcdefghij", null, undefined]) {
      assert.equal(normalizeInviteCode(bad), null, `expected null for ${JSON.stringify(bad)}`);
   }
});

// ---- Version payload copy (album "Add from My Songs", from cloud.js) ----
// Every copied version is re-created through saveAlbumVersion, which assigns its
// own label/number/timestamps — so those transport fields must be stripped while
// the whole arrangement content is carried over.

test("versionCopyPayload strips transport + version-meta fields", () => {
   const source = {
      cloudId: "c1",
      songId: "s1",
      versionId: "v1",
      label: "Version 3",
      number: 3,
      createdAt: 1,
      updatedAt: 2,
      legacy: true,
      hasNoVersions: true,
      title: "Amazing Grace",
      sections: [{ name: "Verse" }],
   };
   const payload = versionCopyPayload(source);
   const stripped = ["cloudId", "songId", "versionId", "label", "number", "createdAt", "updatedAt", "legacy", "hasNoVersions"];
   for (const key of stripped) {
      assert.equal(key in payload, false, `${key} should be stripped from the copy`);
   }
   assert.equal(payload.title, "Amazing Grace");
});

test("versionCopyPayload keeps every content field and never mutates the source", () => {
   const source = {
      title: "Amazing Grace",
      artist: "John Newton",
      key: "G",
      meter: "4/4",
      bpm: 84,
      editorMode: "numbers",
      lyricsEnabled: true,
      chordAboveEnabled: true,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      sections: [{ id: "sec1", name: "Verse", bars: 4, beats: { "0:0": "G" } }],
      label: "Version 3",
      number: 3,
      cloudId: "c1",
   };
   const snapshot = structuredClone(source);
   const payload = versionCopyPayload(source);
   assert.equal(payload.title, "Amazing Grace");
   assert.equal(payload.artist, "John Newton");
   assert.equal(payload.key, "G");
   assert.equal(payload.meter, "4/4");
   assert.equal(payload.bpm, 84);
   assert.equal(payload.editorMode, "numbers");
   assert.equal(payload.lyricsEnabled, true);
   assert.equal(payload.chordAboveEnabled, true);
   assert.equal(payload.youtubeId, "dQw4w9WgXcQ");
   assert.deepEqual(payload.sections, source.sections);
   // A fresh object (the caller may add its own label/number on top)...
   assert.notEqual(payload, source);
   // ...and the source document is untouched.
   assert.deepEqual(source, snapshot);
});

test("versionCopyPayload is safe with missing input", () => {
   assert.deepEqual(versionCopyPayload(), {});
   assert.deepEqual(versionCopyPayload({}), {});
});

// ============================================================================
// Editor modes (from notation.js)
// ----------------------------------------------------------------------------
// Regression guard for the ChordPro release: the two ORIGINAL modes must keep the
// exact badge label and glyph they had before the third mode existed, so the
// topbar pill and the library cards look identical for existing songs.
// ============================================================================

test("editorModeMeta keeps the mode labels and glyphs in one place", () => {
   assert.deepEqual(editorModeMeta.chords, { id: "chords", badge: "Chord Chart", cardMark: "♪" });
   // The number grid + lyrics row is named for what you write — the ID stays `numbers`, so files,
   // cloud documents and the `data-editor-mode="numbers"` styling hooks never depend on the label.
   assert.deepEqual(editorModeMeta.numbers, {
      id: "numbers",
      badge: "Numeric Notation + Lyrics",
      cardMark: "#",
   });
   assert.equal(editorModeMeta.chordpro.id, "chordpro");
   assert.equal(editorModeMeta.chordpro.badge, "ChordPro");
   // The New Song card, the help dialog and the README all use the same wording, and the card's
   // mode hook is untouched (`data-mode="numbers"` = stored id).
   const html = readProjectFile("index.html");
    assert.match(html, /<span class="mode-card-title">Numeric Notation \+ Lyrics<\/span>/);
    assert.match(html, /id="modeCardNumbers" type="button" data-mode="numbers" aria-pressed="false"/);
   assert.match(html, /Lyrics row, optional \(Lyrics toggle\)/);
   assert.match(html, /Numeric Notation uses degrees 1 to 7 with optional lyrics/);
   assert.ok(!/Nashville Numbers/.test(html), "the old mode label must be gone");
   assert.match(readProjectFile("README.md"), /\*\*Numeric Notation \+ Lyrics\*\*/);
});

test("mode marks come from one shared SVG set", () => {
   assert.match(modeIconSvg("chords"), /M9 18V5l10-2v13/);
   assert.match(modeIconSvg("numbers"), /m240-160 40-160H120/);
   assert.match(modeIconSvg("chordpro"), /M160-320v-480/);
   assert.equal(modeIconSvg("numeric"), modeIconSvg("numbers"), "legacy mode ids fold in");
   assert.equal(modeIconSvg("chord-pro"), modeIconSvg("chordpro"));
   assert.match(modeIconMarkup("numbers", "topbar-mark"), /class="mode-mark is-numbers topbar-mark"/);
   assert.match(modeIconMarkup("unknown"), /mode-mark is-chords/);
});

test("editor header keeps the title on the sheet and utility controls in the sticky bar", () => {
   const html = readProjectFile("index.html");
   const css = readProjectFile("styles/ui.css");
   const events = readProjectFile("src/events.js");
   const render = readProjectFile("src/render/render.js");

   assert.doesNotMatch(html, /editor-breadcrumb|editorSongName/, "the duplicate topbar title is gone");
   assert.match(html, /<h1 id="previewTitle"/, "the sheet title is the page heading");
   assert.match(html, /<h1 class="cp-card-title" id="cpPreviewTitle"/);
   assert.match(html, /class="transport-control" role="group" aria-label="Playback and tempo"/);
   assert.match(html, /id="playBtn"/);
   assert.match(html, /id="bpmInput"/);
   assert.doesNotMatch(html, /id="cpUndoBtn"|id="cpRedoBtn"/, "ChordPro uses the one global history control");

   const topbarActions = html.slice(html.indexOf('<div class="topbar-actions">'), html.indexOf("</header>"));
   assert.match(topbarActions, /id="bpmInput"/);
   assert.match(topbarActions, /class="history-toolbar"[\s\S]*id="undoBtn"[\s\S]*id="redoBtn"/);
   assert.ok(
      html.indexOf('id="bpmInput"') > html.indexOf('<div class="topbar-actions">'),
      "tempo lives in the topbar, not in the printable sheet",
   );

   assert.match(css, /position: sticky;[\s\S]{0,120}?z-index: 60;/, "the topbar follows the scroll");
   assert.match(css, /\.topbar\.is-stuck \{[\s\S]{0,120}?box-shadow: 0 1px 0 var\(--editor-line\)/);
   assert.match(events, /function initStickyTopbar\(/);
   assert.match(events, /initStickyTopbar\(\);/);
   assert.match(events, /getPastLength\(\)/);
   assert.match(events, /getFutureLength\(\)/);
   assert.match(render, /modeIconSvg\(mode\)/);
});

test("the sheet h1 keeps the PDF title geometry", () => {
   const preview = readProjectFile("styles/score/preview.css");
   const css = readProjectFile("styles/ui.css");
   // The old h2 carried a 5px/4px margin and a 30px print size. Moving the
   // heading to h1 must not change either the screen or the paper metrics.
   assert.match(css, /\.preview-header h1 \{[\s\S]{0,220}?margin: 5px 0 4px;[\s\S]{0,220}?font-size: 31px;/);
   assert.match(preview, /\.preview-header h1 \{[\s\S]{0,220}?margin: 5px 0 4px;[\s\S]{0,220}?font-size: 30px;/);
   assert.match(preview, /html\.is-print-layout #previewCard \.preview-header h1 \{/);
   assert.doesNotMatch(preview, /\.preview-header h2/, "print selectors follow the h1");
});

test("normalizeEditorMode accepts the three modes and falls back to chords", () => {
   assert.equal(normalizeEditorMode("chordpro"), "chordpro");
   assert.equal(normalizeEditorMode("numbers"), "numbers");
   assert.equal(normalizeEditorMode("chords"), "chords");
   // Legacy documents may carry the older spelling of the mode ids.
   assert.equal(normalizeEditorMode("numeric"), "numbers");
   assert.equal(normalizeEditorMode("chord-pro"), "chordpro");
   // Legacy projects have no editorMode at all — they must stay Chord Chart.
   for (const bad of [undefined, null, "", "Chords", "CHORDPRO", "nashville", 0, {}, []]) {
      assert.equal(normalizeEditorMode(bad), "chords", `expected chords for ${JSON.stringify(bad)}`);
   }
});

test("the library summary is repaired from the arrangement it describes", () => {
   const song = { latestEditorMode: "chords", latestKey: "C", latestMeter: "4/4", latestBPM: "" };
   // A Nashville arrangement stored under the old mode id must be repaired to
   // "numbers" — never silently shown as a Chord Chart.
   const patch = applyVersionSummary(song, { editorMode: "numeric", key: "G", meter: "6/8", bpm: 72 });
   assert.equal(song.latestEditorMode, "numbers");
   assert.equal(patch.latestEditorMode, "numbers");
   assert.equal(song.latestKey, "G");
   assert.equal(song.latestMeter, "6/8");
   assert.equal(song.latestBPM, 72);
   // A version without a tempo falls back to the editor default (120).
   const bare = { latestEditorMode: "numbers" };
   applyVersionSummary(bare, { editorMode: "numbers" });
   assert.equal(bare.latestBPM, 120);
   // A version with no mode at all leaves the summary's mode alone.
   const unknown = { latestEditorMode: "chordpro" };
   applyVersionSummary(unknown, { key: "D" });
   assert.equal(unknown.latestEditorMode, "chordpro");
   assert.equal(unknown.latestKey, "D");
});

// ============================================================================
// ChordPro mode (from chordPro.js)
// ============================================================================

test("isChordToken recognises letter, slash, Nashville and N.C. tokens", () => {
   for (const value of ["C", "Am7", "Cmaj7", "G/B", "F#m7", "A♭", "am", "N.C.", "nc", "1", "♭7", "5̇"]) {
      assert.ok(isChordToken(value), `expected a chord token: ${value}`);
   }
});

test("isChordToken rejects section labels, plain words and empty input", () => {
   for (const value of ["", "  ", "Verse 1", "Chorus", "hello", "Amazing grace", null, undefined]) {
      assert.ok(!isChordToken(value), `expected a non-chord token: ${JSON.stringify(value)}`);
   }
});

test("parseChordProLine attaches each chord to the word it precedes", () => {
   assert.deepEqual(parseChordProLine("[C]Amazing [G]grace"), [
      { chord: "C", text: "Amazing " },
      { chord: "G", text: "grace" },
   ]);
});

test("parseChordProLine keeps text before the first chord unchorded", () => {
   assert.deepEqual(parseChordProLine("Oh [C]happy day"), [
      { chord: null, text: "Oh " },
      { chord: "C", text: "happy " },
      { chord: null, text: "day" },
   ]);
});

test("parseChordProLine splits a multi-word run into one chunk per word", () => {
   // Only the first word of a run carries the chord, so the printed sheet can wrap
   // between words without dragging the chord along.
   assert.deepEqual(parseChordProLine("[C]how sweet the sound"), [
      { chord: "C", text: "how " },
      { chord: null, text: "sweet " },
      { chord: null, text: "the " },
      { chord: null, text: "sound" },
   ]);
});

test("parseChordProLine emits a chord-only chunk for a trailing chord", () => {
   assert.deepEqual(parseChordProLine("Amazing [C]"), [
      { chord: null, text: "Amazing " },
      { chord: "C", text: "" },
   ]);
   assert.deepEqual(parseChordProLine("[C]"), [{ chord: "C", text: "" }]);
});

test("parseChordProLine keeps non-chord brackets as literal text", () => {
   assert.deepEqual(parseChordProLine("Hello [world]"), [
      { chord: null, text: "Hello " },
      { chord: null, text: "[world]" },
   ]);
});

test("parseChordProLine tolerates an unclosed bracket", () => {
   assert.deepEqual(parseChordProLine("[C]Amazing [G"), [
      { chord: "C", text: "Amazing " },
      { chord: null, text: "[G" },
   ]);
});

test("parseChordPro classifies sections, comments, metadata, ends and blanks", () => {
   const blocks = parseChordPro("{soc}\n{c: soft}\n[C]Sing\n{eoc}\n{unknown_thing: x}\n\n{sov}\n[G]Again");
   assert.deepEqual(
      blocks.map((block) => block.type),
      ["section", "comment", "line", "end", "directive", "blank", "section", "line"],
   );
   assert.equal(blocks[0].label, "Chorus");
   assert.equal(blocks[1].text, "soft");
   assert.equal(blocks[6].label, "Verse");
});

test("parseChordPro accepts the long section form with a custom label", () => {
   assert.deepEqual(parseChordPro("{start_of_chorus: Chorus 2}")[0], { type: "section", label: "Chorus 2" });
   assert.deepEqual(parseChordPro("{start_of_bridge}")[0], { type: "section", label: "Bridge" });
});

test("parseChordPro treats a bracket-only non-chord line as a section label", () => {
   const blocks = parseChordPro("[Verse 1]\n[C]Amazing");
   assert.deepEqual(blocks[0], { type: "section", label: "Verse 1" });
   assert.equal(blocks[1].type, "line");
});

test("parseChordPro keeps an inline-chord line a lyric line, not a label", () => {
   const blocks = parseChordPro("[C]Amazing [G]grace");
   assert.equal(blocks.length, 1);
   assert.equal(blocks[0].type, "line");
});

test("parseChordPro ignores unknown directives without breaking the score", () => {
   const blocks = parseChordPro("{define: C base-fret 1}\n[C]Sing");
   assert.equal(blocks[0].type, "directive");
   assert.equal(blocks[0].name, "define");
   assert.equal(blocks[1].type, "line");
   assert.equal(blocks[1].chunks[0].chord, "C");
});

test("parseChordPro returns an empty block list for empty input", () => {
   assert.deepEqual(parseChordPro(""), []);
   assert.deepEqual(parseChordPro(null), []);
   assert.deepEqual(parseChordPro("   \n\n  "), []);
});

test("transposeChordProText transposes letter and slash chords only", () => {
   assert.equal(transposeChordProText("[C]Amazing [G/B]grace", 1), "[C♯]Amazing [A♭/C]grace");
   assert.equal(transposeChordProText("[F#m7]how [Cmaj7]sweet", 2), "[A♭m7]how [Dmaj7]sweet");
   // With the target key as context the spelling matches the new key (here D → F♯m, not G♭m).
   assert.equal(
      transposeChordProText("[Em]Sing [D/F#]on", 2, { key: "D" }),
      "[F♯m]Sing [E/G♯]on",
   );
});

test("transposeChordProText never transposes Nashville degrees or N.C.", () => {
   assert.equal(transposeChordProText("[1]Sing [♭7]soft [N.C.]rest", 2), "[1]Sing [♭7]soft [N.C.]rest");
});

test("transposeChordProText canonicalises a lowercase root", () => {
   // The root is upper-cased so the shared chord grammar accepts it, which means a
   // lowercase `[am]` transposes instead of being silently skipped.
   assert.equal(transposeChordProText("[am]Sing", 2), "[Bm]Sing");
});

test("transposeChordProText leaves comments, unknown directives and lyrics untouched", () => {
   const source = "{c: play [C] twice}\n{x_custom: [G]}\nAmazing [C]grace";
   assert.equal(transposeChordProText(source, 2), "{c: play [C] twice}\n{x_custom: [G]}\nAmazing [D]grace");
});

test("transposeChordProText rewrites the {key:} directive and keeps its spacing", () => {
   assert.equal(transposeChordProText("{key: G}", 1), "{key: A♭}");
   assert.equal(transposeChordProText("{ key : G }", 1), "{ key : A♭ }");
   assert.equal(transposeChordProText("{k: C}", -1), "{k: B}");
});

test("transposeChordProText returns identical text for 0 semitones", () => {
   const source = "[C]Amazing [G/B]grace";
   assert.equal(transposeChordProText(source, 0), source);
   assert.equal(transposeChordProText(source, null), source);
});

test("transposeChordProText is reversible", () => {
   // Spellings the app already prefers (flats) survive a round trip; F#/G♭ style
   // enharmonic swaps are the same behaviour as the existing beat-grid transpose.
   const source = "[C]Amazing [G/B]grace [Am7]how [N.C.]sweet";
   assert.equal(transposeChordProText(transposeChordProText(source, 3), -3), source);
});

test("transposeChordToken keeps an unknown token as-is", () => {
   assert.equal(transposeChordToken("N.C.", 1), "N.C.");
   assert.equal(transposeChordToken("1", 1), "1");
   assert.equal(transposeChordToken("C", 1), "C♯");
   assert.equal(transposeChordToken("C", 1, { key: "D♭" }), "D♭");
});

test("normalizeChordPro normalises line endings, control chars and blank runs", () => {
   assert.equal(normalizeChordPro("  [C]Amazing  \r\n\r\n\r\n\r\n[G]grace\r"), "  [C]Amazing\n\n[G]grace");
   assert.equal(normalizeChordPro("A\u0000B"), "AB");
   assert.equal(normalizeChordPro(""), "");
   assert.equal(normalizeChordPro(null), "");
   assert.equal(normalizeChordPro(42), "");
});

test("normalizeChordPro clamps oversized input", () => {
   const long = "x".repeat(MAX_CHORDPRO_CHARS + 500);
   assert.equal(normalizeChordPro(long).length, MAX_CHORDPRO_CHARS);
});

test("normalizeChordProSections guarantees name + chordPro and keeps other fields", () => {
   const out = normalizeChordProSections([
      { id: "a", name: "Verse", chordPro: "  [C]x  \r\n" },
      { id: "b" },
   ]);
   assert.equal(out[0].id, "a");
   assert.equal(out[0].name, "Verse");
   assert.equal(out[0].chordPro, "  [C]x");
   assert.equal(out[1].id, "b");
   assert.equal(out[1].name, "Section");
   assert.equal(out[1].chordPro, "");
   assert.deepEqual(normalizeChordProSections(null), []);
});

test("carryChordProSections restores lyrics that normalizeSection() drops", () => {
   // Regression guard for the import path: normalizeSection() only knows the beat
   // grid, so it silently loses `section.chordPro` — which is exactly the field a
   // ChordPro song stores its lyrics in. This proves the carry-over works.
   const raw = [
      { id: "s1", name: "Verse", chordPro: "  [C]Amazing  \r\n[G]grace" },
      { id: "s2", name: "Chorus" },
   ];
   const normalized = raw.map((section) => normalizeSection(section, "4/4"));
   assert.equal("chordPro" in normalized[0], false, "normalizeSection is expected to drop chordPro");
   const carried = carryChordProSections(raw, normalized);
   assert.equal(carried[0].chordPro, "  [C]Amazing\n[G]grace");
   assert.equal(carried[1].chordPro, "");
   assert.equal(carried[0].id, "s1");
   assert.equal(carried[0].name, "Verse");
   assert.equal(carried[1].name, "Chorus");
   assert.deepEqual(carryChordProSections(null, null), []);
});

test("a ChordPro project survives a save/load round trip through normalizeSection", () => {
   const saved = {
      format: "chord-sheet",
      version: 2,
      editorMode: "chordpro",
      sections: [
         { id: "a", name: "Verse 1", chordPro: "[C]Amazing [G]grace" },
         { id: "b", name: "Chorus", chordPro: "{soc}\n[F]How sweet [C]the sound" },
      ],
   };
   const normalized = saved.sections.map((section) => normalizeSection(section, "4/4"));
   const reloaded = carryChordProSections(saved.sections, normalized);
   assert.equal(reloaded.length, 2);
   assert.deepEqual(
      reloaded.map((section) => section.chordPro),
      ["[C]Amazing [G]grace", "{soc}\n[F]How sweet [C]the sound"],
   );
   assert.deepEqual(
      reloaded.map((section) => section.name),
      ["Verse 1", "Chorus"],
   );
});

test("chordProPlainText strips chords and directives", () => {
   const text = "{soc}\n{c: soft}\n[C]Amazing [G]grace\n{eoc}";
   assert.equal(chordProPlainText(text), "Chorus\nsoft\nAmazing grace");
});

test("chordProMeta reads the metadata directive aliases", () => {
   const meta = chordProMeta("{t: Amazing Grace}\n{artist: John Newton}\n{key: G}\n{tempo: 84}");
   assert.equal(meta.title, "Amazing Grace");
   assert.equal(meta.artist, "John Newton");
   assert.equal(meta.key, "G");
   assert.equal(meta.tempo, "84");
   assert.equal(chordProMeta("no metadata here").title, "");
});

test("chordProFromFile splits sections on headers and numbers duplicates", () => {
   const file = "{title: Test}\n{sov}\n[C]Verse line\n{soc}\n[G]Chorus line\n{soc}\n[C]Chorus again";
   const { meta, sections } = chordProFromFile(file);
   assert.equal(meta.title, "Test");
   assert.deepEqual(
      sections.map((section) => section.name),
      ["Verse", "Chorus", "Chorus 2"],
   );
   assert.equal(sections[0].chordPro, "[C]Verse line");
   assert.equal(sections[2].chordPro, "[C]Chorus again");
});

test("chordProFromFile keeps text before the first header as a leading section", () => {
   const { sections } = chordProFromFile("[C]Instrumental intro\n{soc}\n[G]Sing");
   assert.deepEqual(
      sections.map((section) => section.name),
      ["Intro", "Chorus"],
   );
});

test("chordProFromFile returns no sections for metadata-only or empty input", () => {
   assert.deepEqual(chordProFromFile("{title: Only meta}").sections, []);
   assert.deepEqual(chordProFromFile("").sections, []);
   assert.deepEqual(chordProFromFile(null).sections, []);
});

// ============================================================================
// ChordPro workspace wiring (static checks — no browser needed)
// ----------------------------------------------------------------------------
// These guard the failure modes that unit-testing the pure modules cannot catch:
// a typo'd element id, a stylesheet that was never linked, and cache-version drift
// between index.html / the ES modules / the service worker.
// ============================================================================

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// `styles/ui.css` is a virtual aggregate of the split stylesheets, kept so the
// static CSS contracts read as one file in the order index.html loads them.
const sourceGroups = {
   "src/cloudUI.js": [
      "src/cloud/ui/markup.js",
      "src/cloud/ui/gallery.js",
      "src/cloud/ui/auth.js",
      "src/cloud/ui/dialogs.js",
      "src/cloud/ui/state.js",
      "src/cloud/ui/album.js",
      "src/cloud/ui/controller.js",
      "src/cloudUI.js",
   ],
   "src/cloud.js": [
      "src/cloud.js",
      "src/cloud/data/runtime.js",
      "src/cloud/data/constants.js",
      "src/cloud/data/auth.js",
      "src/cloud/data/songs.js",
      "src/cloud/data/albums.js",
   ],
   "src/events.js": ["src/editor/bindings/preview.js", "src/editor/bindings/controls.js", "src/events.js"],
   "styles/ui.css": [
      "styles/layout/shell.css",
      "styles/layout/responsive.css",
      "styles/components/editor.css",
      "styles/components/editor-chrome.css",
      "styles/components/gallery.css",
      "styles/components/album.css",
      "styles/components/library.css",
      "styles/components/library-desktop.css",
      "styles/themes/dark.css",
      "styles/base/print.css",
   ],
   // Split files are read as one file again, in load order, so the existing CSS
   // contracts keep matching what index.html actually ships.
   "styles/score/preview.css": ["styles/score/preview.css", "styles/score/preview-print.css"],
   "styles/layout/shell.css": ["styles/layout/shell.css", "styles/layout/responsive.css"],
   "styles/components/editor.css": ["styles/components/editor.css", "styles/components/editor-chrome.css"],
   "styles/components/library.css": ["styles/components/library.css", "styles/components/library-desktop.css"],
};
const readProjectFile = (relative) =>
   (sourceGroups[relative] || [relative]).map((file) => readFileSync(join(projectRoot, file), "utf8")).join("\n");
const sourceFiles = (directory = "src") =>
   readdirSync(join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
   });

test("ChordPro workspace: every id used by chordProEditor.js exists in index.html", () => {
   const ids = new Set([...readProjectFile("index.html").matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
   const used = [...readProjectFile("src/render/chordProEditor.js").matchAll(/\$\("#([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
   assert.ok(used.length >= 8, `expected several lookups, found ${used.length}`);
   for (const id of used) assert.ok(ids.has(id), `#${id} is used by chordProEditor.js but missing from index.html`);
});

test("ChordPro workspace: render.js and events.js look up ids that exist too", () => {
   const ids = new Set([...readProjectFile("index.html").matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
   // Documented pre-existing lookups that are intentionally absent from index.html:
   //   previewHint      legacy guard (replaced by the how-to dialog)
   //   placingLabel     optional, written only when present
   //   projectFileInput / saveBtn  created dynamically by the cloud UI
   const legacyOptional = new Set(["previewHint", "placingLabel", "projectFileInput", "saveBtn"]);
   for (const file of ["src/render/render.js", "src/events.js", "src/pdf/pdfOptions.js"]) {
      const used = [...readProjectFile(file).matchAll(/\$\("#([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
      for (const id of used) {
         if (legacyOptional.has(id)) continue;
         assert.ok(ids.has(id), `#${id} is used by ${file} but missing from index.html`);
      }
   }
});

test("index.html ships the ChordPro workspace, its stylesheet and the third mode card", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /styles\/score\/chordpro\.css\?v=/);
   assert.match(html, /id="cpWorkspace"/);
   assert.match(html, /id="cpSectionsPreview"/);
   assert.match(html, /id="cpPreviewCard"/);
   assert.match(html, /id="cpPreviewScroll"/);
   assert.match(html, /data-mode="chordpro"/);
   // The grid workspace must still be there — ChordPro is additive, never a replace.
   assert.match(html, /id="sectionsPreview"/);
   assert.match(html, /id="previewCard"/);
   assert.match(html, /id="previewViewport"/);
});

test("both meter selectors offer every supported time signature, including 1/4", () => {
   assert.ok(meters.includes("1/4"), "1/4 must be a supported meter");
   const html = readProjectFile("index.html");
   const optionsFor = (id) => {
      const start = html.indexOf(`id="${id}"`);
      assert.notEqual(start, -1, `#${id} is missing`);
      const openEnd = html.indexOf(">", start);
      const close = html.indexOf("</select>", openEnd);
      assert.notEqual(close, -1, `#${id} must be a select`);
      return [...html.slice(openEnd, close).matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
   };
   // Both the beat-grid metadata store and the ChordPro panel read the same list.
   assert.deepEqual(optionsFor("timeSignature"), meters);
   assert.deepEqual(optionsFor("cpMeterSelect"), meters);
});

test("1/4 normalizes to one beat per bar", () => {
   const section = normalizeSection({ name: "Pickup", bars: 2, lyrics: "one two" }, "1/4");
   assert.deepEqual(section.lyricBeats, { "0-0": "one", "1-0": "two" });
});

test("1/4 is the only single-beat meter: the bar IS a beat", () => {
   // The pure helper is the single source of truth for "the bar IS a beat" — the
   // renderer, the event handlers and the CSS scope all read it from here.
   assert.equal(isSingleBeatMeter("1/4"), true);
   assert.equal(barUnitWord("1/4"), "beat");
   for (const meter of ["2/4", "3/4", "4/4", "6/8"]) {
      assert.equal(isSingleBeatMeter(meter), false, `${meter} is not a single-beat meter`);
      assert.equal(barUnitWord(meter), "bar");
   }
   // Defensive: an unknown / missing meter falls back to the normal "bar".
   assert.equal(isSingleBeatMeter(undefined), false);
   assert.equal(isSingleBeatMeter(""), false);
   assert.equal(barUnitWord(""), "bar");
});

test("1/4 keeps the bar line only at the edges of the line (live preview + both print scopes)", () => {
   const css = readProjectFile("styles/score/preview.css");
   const flat = (value) => value.replace(/\s+/g, " ");
   // The three scopes that must stay identical (AGENTS.md §3.7): @media print (the
   // real PDF), html.is-print-layout (the PDF layout preview + the dialog pane).
   const printAt = css.indexOf("@media print {");
   const printEnd = css.indexOf("\n}\n", printAt);
   assert.ok(printAt > -1 && printEnd > printAt, "the @media print block is not where we expect it");
   const screenScope = flat(css.slice(0, printAt));
   const printScope = flat(css.slice(printAt, printEnd));
   const layoutScope = flat(css.slice(printEnd));
   // 1) Live preview (screen).
   assert.match(
      screenScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar::before \{ display: none; \}/,
      "the live preview must not draw a bar line BETWEEN the beats in 1/4",
   );
   assert.match(
      screenScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar:first-child::before \{ display: block; left: 0; \}/,
      "the live preview must open the line of the score with a bar line in 1/4",
   );
   assert.match(
      screenScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar:last-child::after \{[^}]*right: 0\.5px;/,
      "the live preview must close the line of the score with a bar line in 1/4",
   );
   // 2) @media print — the real PDF.
   assert.match(
      printScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar::before, body\[data-meter="1\/4"\] \.bar-batch \.bar::after \{ display: none; \}/,
      "@media print must not draw a bar line between the beats in 1/4",
   );
   assert.match(
      printScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar\.pdf-row-start::before, body\[data-meter="1\/4"\] \.bar-batch \.bar\.pdf-row-end::after \{ display: block; \}/,
      "@media print must open AND close every printed row with a bar line in 1/4",
   );
   // 3) html.is-print-layout — the on-screen PDF layout preview + the dialog pane.
   assert.match(
      layoutScope,
      /html\.is-print-layout body\[data-meter="1\/4"\] #previewCard \.bar-batch \.bar::before, html\.is-print-layout body\[data-meter="1\/4"\] #previewCard \.bar-batch \.bar::after \{ display: none; \}/,
      "the PDF layout preview must not draw a bar line between the beats in 1/4",
   );
   assert.match(
      layoutScope,
      /html\.is-print-layout body\[data-meter="1\/4"\] #previewCard \.bar-batch \.bar\.pdf-row-start::before, html\.is-print-layout body\[data-meter="1\/4"\] #previewCard \.bar-batch \.bar\.pdf-row-end::after \{ display: block; \}/,
      "the PDF layout preview must open AND close every printed row with a bar line in 1/4",
   );
   // The bar number stamp has no bar line to sit on in 1/4, so it stays out of both
   // print scopes — and the faint editor counter goes with it.
   assert.match(
      printScope,
      /html\[data-pdf-bar-numbers="line"\] body\[data-editor-mode="chords"\]\[data-meter="1\/4"\] \.bar-batch \.bar \.bar-num, html\[data-pdf-bar-numbers="every"\] body\[data-editor-mode="chords"\]\[data-meter="1\/4"\] \.bar-batch \.bar \.bar-num \{ display: none !important; \}/,
   );
   assert.match(
      layoutScope,
      /html\.is-print-layout\[data-pdf-bar-numbers="line"\] body\[data-editor-mode="chords"\]\[data-meter="1\/4"\] \.bar-batch \.bar \.bar-num, html\.is-print-layout\[data-pdf-bar-numbers="every"\] body\[data-editor-mode="chords"\]\[data-meter="1\/4"\] \.bar-batch \.bar \.bar-num \{ display: none !important; \}/,
   );
   assert.match(
      screenScope,
      /body\[data-meter="1\/4"\] \.bar-batch \.bar \.bar-num \{ display: none; \}/,
      "the faint editor bar counter must not show in 1/4",
   );
});

test("1/4 prints its beats at the normal beat pitch (the bar's padding moves to the row)", () => {
   const css = readProjectFile("styles/score/preview.css");
   const flat = (value) => value.replace(/\s+/g, " ");
   // The default geometry is untouched: every bar keeps its own side padding.
   assert.match(css, /--print-bar-pad-x: 2\.6mm;/);
   assert.match(css, /--print-bar-pad-x-lyrics: 2\.6mm;/);
   assert.match(css, /--print-row-pad-x: 0mm;/);
   // In 1/4 the bar's side padding is zero and the inset is handed to the ROW, so
   // the beats of the growing bar sit at the same pitch as the beats of any bar.
   assert.match(
      flat(css),
      /body\[data-meter="1\/4"\] #previewCard \{ --print-bar-pad-x: 0mm; --print-bar-pad-x-lyrics: 0mm; --print-row-pad-x: 2\.6mm; \}/,
   );
   // Both print scopes must use the row inset (parity).
   assert.equal((flat(css).match(/padding: 0 var\(--print-row-pad-x\);/g) || []).length, 2);
});

test("the export tags the edges of every printed row (the 1/4 bar line lives there)", () => {
   const pdf = readProjectFile("src/pdf/pdf.js");
   assert.match(pdf, /const ROW_START_CLASS = "pdf-row-start";/);
   assert.match(pdf, /const ROW_END_CLASS = "pdf-row-end";/);
   // The row starts at the bar glued to the grid's content edge...
   assert.match(pdf, /bar\.classList\.toggle\(ROW_START_CLASS, rowStart\);/);
   // ...and ends at the bar with the largest right edge in that row (the bars of one
   // printed row share a top offset, so the rows are grouped by it).
   assert.match(pdf, /const key = Math\.round\(rect\.top\);/);
   assert.match(pdf, /const first = row\.reduce\(\(a, b\) => \(b\.rect\.left < a\.rect\.left \? b : a\)\);/);
   assert.match(pdf, /const last = row\.reduce\(\(a, b\) => \(b\.rect\.right > a\.rect\.right \? b : a\)\);/);
   // Both tags are removed again when the print preview closes.
   assert.match(pdf, /MID_BAR_CLASS, ROW_START_CLASS, ROW_END_CLASS/);
});

test("the 1/4 rules never touch the other time signatures", () => {
   const css = readProjectFile("styles/score/preview.css");
   for (const meter of ["2/4", "3/4", "4/4", "6/8"]) {
      assert.ok(!css.includes(`data-meter="${meter}"`), `no rule may be scoped to ${meter}`);
   }
   // The meter reaches the stylesheet through the body attribute the renderer sets.
   const render = readProjectFile("src/render/render.js");
   assert.match(render, /document\.body\.dataset\.meter = state\.meter;/);
});

test("1/4 speaks in beats: add / delete / copy labels and the caption", () => {
   const render = readProjectFile("src/render/render.js");
   const events = readProjectFile("src/events.js");
   // The editor offers "+ Add 1 beat" and counts the section as one growing bar.
   assert.match(render, /\+ Add 1 beat/);
   assert.match(render, /1 bar · \$\{section\.bars\}/);
   assert.match(render, /title="Delete \$\{unit\} \$\{globalBarNum\}"/);
   // The handlers speak the same word.
   assert.match(events, /scoreUnit\(\)\.unit/);
   // The PDF dialog hides the Bars group in 1/4: there is no bar to number.
   assert.match(events, /!isSingleBeatMeter\(getState\(\)\.meter\)/);
});

test("service worker precaches every new ChordPro asset", () => {
   const sw = readProjectFile("sw.js");
   for (const asset of ["./styles/score/chordpro.css", "./src/notation/chordPro.js", "./src/render/chordProEditor.js"]) {
      assert.ok(sw.includes(asset), `${asset} is missing from CORE_ASSETS`);
   }
});
test("the self-hosted Inter webfont is wired link → SW precache → file on disk", () => {
   // The app's font stacks ask for `Inter`, but it must be SELF-HOSTED so the heavy
   // chord weights (850/900) render identically on every OS. Without it, macOS fell
   // back to a variable system font (fine) while Windows fell back to Segoe UI, which
   // SYNTHESISES a faux-bold — the "too bold / too cramped" chord bug. A variable font
   // (wght 100 900) is what makes a real 850 possible, so the range is asserted too.
   const css = readProjectFile("styles/base/fonts.css");
   assert.match(css, /@font-face/);
   // The family name must stay "Inter" (NOT "Inter Variable") so the untouched app
   // stacks pick it up — no selector anywhere has to change.
   assert.match(css, /font-family: "Inter";/);
   assert.match(css, /font-weight: 100 900;/);
   assert.match(css, /inter-latin-wght-normal\.woff2\?v=__BUILD__/);
   // Accidentals: Inter has no ♭/♯ (U+266D/266F), so they used to fall back to a
   // platform symbol font (Segoe UI Symbol on Windows vs Hiragino on macOS). A
   // tiny Noto Serif JP subset, registered on the SAME "Inter" family for the
   // music range only, pins one shape on every OS.
   assert.match(css, /noto-serif-jp-accidentals\.woff2\?v=__BUILD__/);
   assert.match(css, /unicode-range: U\+266D-266F;/);
   // ...and the score's accidental must ASK for Inter first, or the glyph would
   // keep coming from the OS serif fallback.
   assert.match(readProjectFile("styles/score/preview.css"), /\.chord-accidental \{[\s\S]{0,600}?font-family: Inter, Georgia/);
   // The stylesheet is linked from the page…
   assert.match(readProjectFile("index.html"), /styles\/base\/fonts\.css\?v=/);
   // …and precached by the service worker, so the font also works offline.
   const sw = readProjectFile("sw.js");
   assert.ok(sw.includes("./styles/base/fonts.css"), "fonts.css is missing from CORE_ASSETS");
   assert.ok(
      sw.includes("./assets/fonts/inter-latin-wght-normal.woff2"),
      "the Inter woff2 is missing from CORE_ASSETS",
   );
   assert.ok(
      sw.includes("./assets/fonts/noto-serif-jp-accidentals.woff2"),
      "the accidental woff2 is missing from CORE_ASSETS",
   );
   // The binary really exists on disk (a link to a missing file is exactly the bug
   // this guards against — the old stacks pointed at a font nobody ever shipped).
   assert.ok(
      existsSync(join(projectRoot, "assets/fonts/inter-latin-wght-normal.woff2")),
      "assets/fonts/inter-latin-wght-normal.woff2 does not exist",
   );
   assert.ok(
      existsSync(join(projectRoot, "assets/fonts/noto-serif-jp-accidentals.woff2")),
      "assets/fonts/noto-serif-jp-accidentals.woff2 does not exist",
   );
});



test("every relative ES module import resolves to a file on disk", () => {
   const files = sourceFiles();
   for (const file of files) {
      const source = readFileSync(join(projectRoot, file), "utf8");
      for (const match of source.matchAll(/from "(\.[^"?]+\.js)/g)) {
         const target = normalize(join(dirname(file), match[1]));
         assert.ok(files.includes(target), `${file} imports ${match[1]}, which does not exist`);
      }
   }
});

test("the ES module graph is acyclic (facades never import their consumers)", () => {
   const files = sourceFiles();
   const graph = new Map();
   for (const file of files) {
      const source = readFileSync(join(projectRoot, file), "utf8");
      const deps = [...source.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)]
         .map((match) => normalize(join(dirname(file), match[1].split("?")[0])))
         .filter((dep) => files.includes(dep));
      graph.set(file, deps);
   }

   const state = new Map();
   const stack = [];
   const cycles = [];
   const visit = (file) => {
      state.set(file, 1);
      stack.push(file);
      for (const dep of graph.get(file) || []) {
         const status = state.get(dep) || 0;
         if (status === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep].join(" -> "));
         else if (status === 0) visit(dep);
      }
      stack.pop();
      state.set(file, 2);
   };
   for (const file of files) if (!state.get(file)) visit(file);
   assert.deepEqual(cycles, [], `import cycle(s) found:\n${cycles.join("\n")}`);
});

test("every stylesheet on disk is linked from index.html and precached", () => {
   const cssFiles = [];
   const visit = (directory) => {
      for (const entry of readdirSync(join(projectRoot, directory), { withFileTypes: true })) {
         const path = `${directory}/${entry.name}`;
         if (entry.isDirectory()) visit(path);
         else if (entry.isFile() && entry.name.endsWith(".css")) cssFiles.push(path);
      }
   };
   visit("styles");

   const html = readProjectFile("index.html");
   const sw = readProjectFile("sw.js");
   assert.ok(cssFiles.length >= 15, `expected the split stylesheets, found ${cssFiles.length}`);
   for (const file of cssFiles) {
      assert.ok(html.includes(file), `${file} is not linked from index.html`);
      assert.ok(sw.includes(`./${file}`), `${file} is missing from CORE_ASSETS`);
   }
});

test("every source module is precached for the offline shell", () => {
   const sw = readProjectFile("sw.js");
   for (const file of sourceFiles()) {
      assert.ok(sw.includes(`./${file}?v=\${ASSET_VERSION}`), `${file} is missing from CORE_ASSETS`);
   }
});

test("every asset version query matches the service worker's ASSET_VERSION", () => {
   const version = readProjectFile("sw.js").match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
   assert.ok(version, "ASSET_VERSION not found in sw.js");
   const files = ["index.html", ...sourceFiles()];
   const mismatches = [];
   for (const file of files) {
      for (const match of readProjectFile(file).matchAll(/\?v=([A-Za-z0-9._-]+)/g)) {
         if (match[1] !== version) mismatches.push(`${file} → ${match[1]}`);
      }
   }
   assert.deepEqual(mismatches, [], `cache-buster drift vs ASSET_VERSION ${version}`);
});

test("cloud and editor binding modules are included in the offline shell", () => {
   const sw = readProjectFile("sw.js");
   const styles = [
      "styles/layout/shell.css",
      "styles/layout/responsive.css",
      "styles/components/editor.css",
      "styles/components/editor-chrome.css",
      "styles/components/gallery.css",
      "styles/components/album.css",
      "styles/components/library.css",
      "styles/components/library-desktop.css",
      "styles/themes/dark.css",
      "styles/base/print.css",
   ];
   for (const style of styles) {
      assert.ok(sw.includes(`./${style}?v=\${ASSET_VERSION}`), `${style} must be precached`);
   }
   const modules = [
      "cloud/data/runtime.js",
      "cloud/data/constants.js",
      "cloud/data/auth.js",
      "cloud/data/songs.js",
      "cloud/data/albums.js",
      "cloud/ui/controller.js",
      "cloud/ui/auth.js",
      "cloud/ui/dialogs.js",
      "cloud/ui/gallery.js",
      "cloud/ui/album.js",
      "cloud/ui/markup.js",
      "cloud/ui/state.js",
      "editor/bindings/preview.js",
      "editor/bindings/controls.js",
   ];
   for (const module of modules) {
      assert.ok(sw.includes(`./src/${module}?v=\${ASSET_VERSION}`), `${module} must be precached`);
   }
});

test("confirm dialog icons use named SVGs without a text-glyph fallback", () => {
   const dialogs = readProjectFile("src/cloud/ui/dialogs.js");
   const cloudUI = readProjectFile("src/cloudUI.js");
   for (const key of ["question", "playback-stop", "delete", "warning", "link", "copy", "leave", "refresh", "music", "person"]) {
      assert.match(dialogs, new RegExp(`"${key}":`), `${key} needs an SVG`);
   }
   assert.match(dialogs, /CONFIRM_ICON_SVG\[icon\] \|\| CONFIRM_ICON_SVG\.question/);
   assert.doesNotMatch(dialogs, /escapeHtml\(icon\)/);
   assert.doesNotMatch(cloudUI, /icon:\s*"[🗑⚠🔗🎼👤⇥↻⏹⧉]/);
});

test("chordpro.css keeps the two original modes untouched (no grid selectors, all cp- or gated)", () => {
   // Comments are stripped first: the file *documents* the names it must avoid.
   const css = readProjectFile("styles/score/chordpro.css").replace(/\/\*[\s\S]*?\*\//g, "");
   // Nothing may restyle the grid score: those class names belong to the component sheets and score/preview.css.
   for (const forbidden of [".preview-card", ".preview-section", ".bar-grid", ".placed-chord", ".lyric-input", ".section-tools"]) {
      assert.ok(!css.includes(forbidden), `chordpro.css must not style ${forbidden}`);
   }
   // Every selector line must be cp-prefixed, gated to ChordPro mode, or one of the
   // documented shared selectors below:
   //   • .mode-picker-card / .mode-picker-grid — the New Song dialog now shows three
   //     cards, which needs a wider dialog + a 3-column grid (layout only; the two
   //     original cards keep their own styling in the component sheets);
   //   • .song-card.is-chordpro — the gold library card;
   //   • :root — declares ONLY the --chordpro-css-version marker variable.
   const allowedShared = [".mode-picker-card", ".mode-picker-grid", ".song-card.is-chordpro", ":root"];
   const offenders = css
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("{") && !line.startsWith("@") && !line.startsWith("/*"))
      .filter((line) => !/^[\d.]+%\s*\{$/.test(line))
      .filter(
         (line) =>
            !line.includes("cp-") &&
            !line.includes("cpPreviewCard") &&
            !line.includes("is-print-layout") &&
            !line.includes("chordpro") &&
            !line.includes("prefers-reduced-motion") &&
            !allowedShared.some((selector) => line.includes(selector)),
      );
   assert.deepEqual(offenders, [], "ungated selectors found in chordpro.css");
});

test("the ChordPro mode card is one of three equal writing-mode choices", () => {
   const css = readProjectFile("styles/ui.css");
   const at = css.indexOf(".mode-picker-grid", css.indexOf("LIBRARY REDESIGN"));
   const block = css.slice(at, at + 280);
   assert.ok(!block.includes("grid-column: 1 / -1"), "the mode card must not span the whole grid");
   assert.ok(!block.includes("grid-column: 1/-1"));
   assert.match(block, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("ChordPro song rows use the shared neutral row treatment", () => {
   const css = readProjectFile("styles/ui.css");
   const start = css.indexOf("LIBRARY REDESIGN");
   const rows = css.slice(start, css.indexOf(".cloud-gallery.library-redesign .song-card-cover", start));
   assert.match(rows, /\.cloud-gallery\.library-redesign \.song-card,[\s\S]*?background:\s*transparent/);
   assert.doesNotMatch(rows, /\.song-card\.is-chordpro/);
   const html = readProjectFile("index.html");
   assert.match(html, /id="modeCardChordPro"[^>]*data-mode="chordpro"/);
});

test("the ChordPro editor has no chord palette / drag-and-drop UI", () => {
   const html = readProjectFile("index.html");
   const source = readProjectFile("src/render/chordProEditor.js");
   for (const gone of ["cp-palette", "cpRootPicker", "cpChordBank", "cp-snippet"]) {
      assert.ok(!html.includes(gone), `index.html still contains ${gone}`);
      assert.ok(!source.includes(gone), `chordProEditor.js still references ${gone}`);
   }
   // The palette CSS must be gone too.
   const css = readProjectFile("styles/score/chordpro.css");
   for (const gone of [".cp-palette", ".cp-root", ".cp-chord-btn", ".cp-snippet"]) {
      assert.ok(!css.includes(gone), `chordpro.css still styles ${gone}`);
   }
});

test("ChordPro mode takes the beat-grid workspace out of the page", () => {
   // The structural swap lives INLINE in index.html (not in chordpro.css alone):
   // score/preview.css sets `.ribbon-workspace { display: block }` and base/tokens.css
   // re-declares `.workspace { display: block }` for print, so a stylesheet that
   // 404s or is served stale would otherwise leave BOTH workspaces on screen.
   const html = readProjectFile("index.html");
   const gate = html.match(/body\[data-editor-mode="chordpro"\] \.ribbon-workspace[^{]*\{([^}]*)\}/);
   assert.ok(gate, "the beat-grid workspace must be gated to ChordPro mode inline in index.html");
   assert.match(gate[1], /display:\s*none\s*!important/, "the grid workspace gate needs !important");
   // The chord-chart LIVE PREVIEW is a SIBLING of .ribbon-workspace inside <main>, so
   // gating only .ribbon-workspace leaves the grid score visible in ChordPro mode.
   assert.match(html, /body\[data-editor-mode="chordpro"\] \.preview-stage/);
   assert.match(html, /body\[data-editor-mode="chordpro"\] main > \.preview-stage/);
   // The side-by-side split must be inline too, so the layout survives a missing CSS.
   assert.match(html, /body\[data-editor-mode="chordpro"\] \.cp-workspace\s*\{[^}]*display:\s*grid/);
   assert.match(html, /\.cp-workspace\s*\{\s*display:\s*none/);
   // JS half: the swap is ALSO applied with inline styles, so it can never depend on
   // the stylesheet being present/fresh, plus hidden/aria-hidden (restored for the
   // other two modes).
   const render = readProjectFile("src/render/render.js");
   assert.match(render, /const chordproMode = mode === "chordpro"/);
   assert.match(render, /gridParts = \[document\.querySelector\("main > \.ribbon-workspace"\), document\.querySelector\("main > \.preview-stage"\)\]/);
   assert.match(render, /part\.style\.display = chordproMode \? "none" : ""/);
   assert.match(render, /cpWorkspace\.style\.display = chordproMode \? "grid" : "none"/);
   assert.match(render, /part\.hidden = chordproMode/);
   assert.match(render, /part\.setAttribute\("aria-hidden", "true"\)/);
   assert.match(render, /part\.removeAttribute\("aria-hidden"\)/);
   // A missing/stale stylesheet is surfaced instead of silently rendering unstyled.
   assert.match(render, /warnIfChordProCssMissing/);
});

test("the stylesheet version marker matches render.js and sw.js ASSET_VERSION", () => {
   // The marker is how a STALE stylesheet (service worker / HTTP cache) becomes
   // visible instead of silently rendering the page with old rules — so all three
   // copies must be bumped together.
   const cssVersion = readProjectFile("styles/score/chordpro.css").match(/--chordpro-css-version:\s*([^\s;]+)/)?.[1];
   const jsVersion = readProjectFile("src/render/render.js").match(/CHORDPRO_CSS_VERSION = "([^"]+)"/)?.[1];
   const swVersion = readProjectFile("sw.js").match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
   assert.ok(cssVersion, "--chordpro-css-version is missing from chordpro.css");
   assert.ok(jsVersion, "CHORDPRO_CSS_VERSION is missing from render.js");
   assert.equal(cssVersion, jsVersion, "chordpro.css and render.js version markers must match");
   assert.equal(cssVersion, swVersion, "chordpro.css and sw.js ASSET_VERSION must match");
});

// ---- Deploy hygiene: a new deploy must never be masked by a cache ----

test("the build stamp matches the service worker's ASSET_VERSION", () => {
   // index.html uses the stamp to decide "this deploy is newer than what I
   // cached". If the two ever drift, returning visitors keep the previous
   // deploy's CSS/JS — exactly the "weird PDF after deploy" class of bug.
   const stamp = readProjectFile("index.html").match(/window\.__WNS_BUILD__ = "([^"]+)"/)?.[1];
   const version = readProjectFile("sw.js").match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
   assert.ok(stamp, "window.__WNS_BUILD__ is missing from index.html");
   assert.equal(stamp, version, "index.html build stamp and sw.js ASSET_VERSION must match");
   // One token drives BOTH version strings in sw.js: CACHE_VERSION embeds
   // ASSET_VERSION, so the workflow's single replacement renames the cache
   // (activate then deletes the previous deploy's cache) AND busts every ?v= URL.
   const cache = readProjectFile("sw.js").match(/const CACHE_VERSION = "([^"]+)"/)?.[1];
   assert.ok(cache, "CACHE_VERSION is missing from sw.js");
   assert.ok(cache.includes(version), `CACHE_VERSION (${cache}) must embed ASSET_VERSION (${version})`);
});

test(
   "the deploy workflow injects ONE build version into the staged site",
   // Skipped when this suite runs against the staged artifact, which has no CI
   // metadata (the workflow itself runs the suite there to verify the injection).
   { skip: !existsSync(join(projectRoot, ".github/workflows/deploy.yml")) },
   () => {
      const workflow = readProjectFile(".github/workflows/deploy.yml");
      assert.match(workflow, /branches: \[master\]/, "deploys on push to master");
      assert.match(workflow, /run: node --test tests\/unit\.test\.mjs/, "unit tests are a deploy gate");
      assert.match(
         workflow,
         /VERSION="r\$\{GITHUB_RUN_NUMBER\}-\$\{GITHUB_SHA:0:7\}"/,
         "the build id is r<run_number>-<short sha>",
      );
      assert.match(workflow, /sed -i "s\|__BUILD__\|\$\{VERSION\}\|g"/, "the placeholder is replaced in one pass");
      assert.match(workflow, /grep -rq '__BUILD__' _site/, "a leftover placeholder fails the deploy");
      assert.match(workflow, /path: _site/, "only the stamped copy is deployed");
   },
);

test("a new deploy purges every cache and reloads the page once", () => {
   const html = readProjectFile("index.html");
   // Purge + worker-update wiring.
   assert.match(html, /const keys = await caches\.keys\(\);/);
   assert.match(html, /caches\.delete\(key\)/);
   assert.match(html, /getRegistrations\(\)/);
   assert.match(html, /register\("sw\.js", \{ updateViaCache: "none" \}\)/);
   assert.match(html, /addEventListener\("controllerchange"/);
   // The stamp comparison is what triggers the purge on a returning visit.
   assert.match(html, /const lastBuild = read\(localStorage, STAMP_KEY\);/);
   assert.match(html, /if \(lastBuild !== BUILD\) \{/);
   // Manual escape hatch + the local-only harness opt-out that keeps ?test= cache-free.
   assert.match(html, /params\.has\("reset"\) \|\| params\.has\("fresh"\)/);
   assert.match(html, /if \(document\.documentElement\.dataset\.testMode === "1"\) return;/);
   // Cache Storage is origin-wide (all GitHub Pages projects share one origin),
   // so the page purge AND the worker's activate purge must be prefix-scoped.
   assert.match(html, /const CACHE_PREFIX = "wns-shell-";/);
   assert.match(readProjectFile("sw.js"), /const CACHE_PREFIX = "wns-shell-";/);
   assert.match(readProjectFile("sw.js"), /k\.startsWith\(CACHE_PREFIX\) && k !== CACHE_VERSION/);
});

test("the service worker revalidates the shell instead of serving a stale copy", () => {
   const sw = readProjectFile("sw.js");
   // Un-versioned entry points (no ?v=) are network-first, by pathname so the
   // GitHub Pages subpath and a local server behave the same.
   assert.match(
      sw,
      /const NETWORK_FIRST_PATHS = \["\/", "\/index\.html", "\/styles\/base\/tokens\.css", "\/manifest\.webmanifest"\];/,
   );
   assert.match(
      sw,
      /const networkFirst =[\s\S]{0,30}?request\.mode === "navigate" \|\| NETWORK_FIRST_PATHS\.some\(\(path\) => url\.pathname\.endsWith\(path\)\);/,
   );
   // Every network read revalidates the browser's HTTP cache (GitHub Pages sends
   // max-age=600, so a plain fetch() could return a pre-deploy file).
   assert.match(sw, /new Request\(request, \{ cache: "no-cache" \}\)/);
   // Online reads of a versioned asset must be EXACT matches: the old
   // `cache.match(request) || cache.match(request, { ignoreSearch: true })` made
   // a new ?v= resolve to the previous deploy's file for one extra load.
   assert.match(sw, /const cached = devAsset \? null : await cache\.match\(request\);/);
   assert.ok(
      !/const cached = \(await cache\.match\(request\)\) \|\|/.test(sw),
      "the online asset lookup must not fall back to ignoreSearch",
   );
   const ignoreUses = sw.match(/ignoreSearch: true/g) || [];
   assert.equal(ignoreUses.length, 2, "ignoreSearch must survive ONLY as the two offline fallbacks");
   assert.match(sw, /if \(fresh\) return fresh;[\s\S]{0,200}?ignoreSearch: true/);
   // LOCAL DEVELOPMENT: while the repo still carries the placeholder version, a cache-first reply
   // would freeze the first copy of every module forever (the ?v= never changes locally), which
   // looks exactly like "my edit did nothing" / "the feature I saved is not there". Those requests
   // bypass the cache and only fall back to it offline. Production always has a real build id.
   assert.match(sw, /const isUnbuiltAsset = \(url\) => url\.searchParams\.get\("v"\) === ASSET_VERSION;/);
   assert.match(sw, /const devAsset = isUnbuiltAsset\(url\);/);
});

test("bar-selection chrome can never print as a green box in the PDF", () => {
   const css = readProjectFile("styles/ui.css");
   // The multi-bar selection ring/tint (#1f9d55) and its ✓ badge are editor-only
   // affordances; both the real print job and the on-screen PDF-layout preview
   // must neutralise them.
   assert.match(css, /\.bar\.is-selected,[\s\S]{0,300}?outline: 0 !important/);
   assert.match(css, /html\.is-print-layout \.bar\.is-selected,[\s\S]{0,400}?outline: 0 !important/);
   assert.match(
      css,
      /\.preview-section\.is-selecting \.bar\.is-selected::after \{[\s\S]{0,60}?content: none !important/,
   );
   // ...and the export flow clears the selection as well (belt and braces).
   const events = readProjectFile("src/events.js");
   assert.match(events, /beforeprint[\s\S]{0,200}?cancelBarSelection\(\)/);
   assert.match(
      events,
      /onExport: \(\) => \{[\s\S]{0,500}?cancelBarSelection\(\);[\s\S]{0,200}?exportToPdf\(/,
   );
});

// ---- ChordPro polish (defaults, footer, print parity with Chord Chart) ----

test("ChordPro starts with Intro + Verse sample sections", () => {
   const source = readProjectFile("src/cloudUI.js");
   assert.match(source, /const CHORDPRO_INTRO_STARTER = "\[C\] \[Am7\] \[Dm7\] \[G7\] \[Cmaj7\]"/);
   assert.match(source, /const CHORDPRO_VERSE_STARTER = "\[C\]Type your lyric here/);
   assert.match(source, /\{ name: "Intro", chordPro: CHORDPRO_INTRO_STARTER \}/);
   assert.match(source, /\{ name: "Verse", chordPro: CHORDPRO_VERSE_STARTER \}/);
   assert.ok(!source.includes('name: "Verse 1"'), "the starter sections must be Intro + Verse");
});

test("a chord-only run keeps the typed gap instead of collapsing", () => {
   // "[C] [Am7] [Dm7]" used to render as "CAm7Dm7" because the spaces between the
   // brackets were dropped by the parser.
   assert.deepEqual(parseChordProLine("[C] [Am7] [Dm7]"), [
      { chord: "C", text: " " },
      { chord: "Am7", text: " " },
      { chord: "Dm7", text: "" },
   ]);
   const html = chordProSectionHTML({ id: "s1", name: "Intro", chordPro: "[C] [Am7] [Dm7]" });
   assert.equal((html.match(/is-chord-only/g) || []).length, 3, "every chord-only word must be flagged");
   assert.match(readProjectFile("styles/score/chordpro.css"), /\.cp-word\.is-chord-only \{[^}]*padding-right: 0\.5em/);
});

test("ChordPro PDF fonts scale up from the shared print tokens", () => {
   const css = readProjectFile("styles/score/chordpro.css");
   // Bigger defaults, still driven by the PDF-options tokens so the sliders work.
   assert.match(css, /--cp-chord-size: calc\(var\(--print-chord-size, 4\.3mm\) \* 1\.25\)/);
   assert.match(css, /--cp-lyric-size: calc\(var\(--print-lyric-size, 3\.2mm\) \* 1\.35\)/);
   assert.match(css, /\.cp-chord \{[^}]*font-size: var\(--cp-chord-size/);
   assert.match(css, /\.cp-lyric \{[^}]*font-size: var\(--cp-lyric-size/);
});

test("ChordPro print geometry matches the Chord Chart export", () => {
   const css = readProjectFile("styles/score/chordpro.css");
   // Same content box as the grid card (see the measurement comment in the file).
   assert.match(css, /html\.is-print-layout \.cp-card \{[^}]*padding: 18px 16px 28px/);
   assert.match(css, /html\.is-print-layout \.cp-card-title \{[^}]*margin: 5px 0 4px/);
   assert.match(css, /html\.is-print-layout \.cp-card-rule \{[^}]*margin: 5px 0 22px/);
   // KEY + TIME SIGNATURE side by side, 10mm in from the right edge, like .song-meta.
   assert.match(css, /html\.is-print-layout \.cp-card-meta[^{]*\{[^}]*flex-direction: row/);
   assert.match(css, /html\.is-print-layout \.cp-card-meta[^{]*\{[^}]*gap: 16px/);
   assert.match(css, /html\.is-print-layout \.cp-card-meta[^{]*\{[^}]*margin-right: 10mm/);
   assert.match(css, /html\.is-print-layout \.cp-card-meta b[^{]*\{[^}]*font-size: 17px/);
   // Section name uses the grid's boxed label look.
   assert.match(css, /html\.is-print-layout \.cp-section-name \{[^}]*border: 1px solid #000/);
   assert.match(readProjectFile("index.html"), /TIME SIGNATURE/);
});

test("the ChordPro editor footer stays a compact single row", () => {
   const css = readProjectFile("styles/score/chordpro.css");
   assert.match(css, /\.cp-editor-foot \{[^}]*flex-direction: row/);
   assert.match(css, /\.cp-editor-foot \.cp-text-btn\.is-strong \{[^}]*flex: none/);
});

// ---- New Song dialog content and explicit mode selection --------------------

test("the New Song dialog keeps the required name and confirms the selected mode", () => {
   const html = readProjectFile("index.html");
   const dialog = html.slice(html.indexOf('id="newSongDialog"'), html.indexOf('id="newVersionNameDialog"'));
   assert.match(dialog, /id="newSongVersionName"[^>]*type="text"/);
   assert.match(dialog, /<fieldset class="mode-picker-fieldset">/);
   for (const mode of ["chords", "numbers", "chordpro"]) {
      assert.match(dialog, new RegExp(`data-mode="${mode}" aria-pressed="false"`));
   }
   assert.match(dialog, /id="newSongCreateBtn"[^>]*disabled>Create song/);
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /function syncNewSongModePicker\(\)/);
   assert.match(cloudUI, /newSongSelectedMode = mode;/);
   assert.match(cloudUI, /closeNewSongDialog\(\{ mode: newSongSelectedMode, label \}\)/);
});

test("the ChordPro mode preview uses readable real syntax", () => {
   const html = readProjectFile("index.html");
   const card = html.slice(html.indexOf('id="modeCardChordPro"'), html.indexOf('id="newVersionNameDialog"'));
   const css = readProjectFile("styles/ui.css");
   assert.match(card, /\[C\] Amazing \[G\] grace/);
   assert.match(card, /lyrics \+ inline chords/);
   assert.match(css, /\.mode-card-score\s*\{[\s\S]*?font:\s*700 17px/);
});

test("the in-app help dialog documents the ChordPro mode", () => {
   const html = readProjectFile("index.html");
   const dialog = html.match(/id="howToDialog"[\s\S]*?<\/ul>/);
   assert.ok(dialog, "the help dialog must exist");
   assert.match(dialog[0], /ChordPro, step by step/);
   // The two starter sections are quoted verbatim so the help matches the code.
   assert.match(dialog[0], /\[C\] \[Am7\] \[Dm7\] \[G7\] \[Cmaj7\]/);
   assert.match(dialog[0], /Type your lyric here/);
   assert.match(dialog[0], /\{sov\}/);
   assert.match(dialog[0], /\{c: play softly\}/);
});

// ---- Chord row above the numbers: print + editor-chrome contract -----------
// Real print geometry needs a browser (see tests/e2e/pdf/print-geometry.spec.mjs), so the print
// contract is pinned here at the CSS level: the live input is swapped for the
// rendered chord token in BOTH print scopes, the reserved track is decided by the
// SECTION class (never by bar data, so every bar keeps the same height and the
// barlines stay aligned), and the editor-only chrome for the row can't reach paper.
test("the chord row above the numbers prints as a chord and never prints chrome", () => {
   const preview = readProjectFile("styles/score/preview.css");
   const ui = readProjectFile("styles/ui.css");
   // Screen: the live input is shown and the print-only span is hidden.
   assert.match(preview, /\.chord-above-print \{\s*display: none;/);
   // @media print: input hidden, rendered chord token shown.
   assert.match(preview, /\.chord-above-input \{\s*display: none;/);
   assert.match(preview, /\.chord-above-print \{\s*display: block;/);
   // The on-screen PDF-layout preview (html.is-print-layout) mirrors a real print.
   assert.match(
      preview,
      /html\.is-print-layout #previewCard \.chord-above-input \{[^}]*display: none/,
   );
   assert.match(
      preview,
      /html\.is-print-layout #previewCard \.chord-above-print \{[^}]*display: block/,
   );
   // Reserved track: section-level class on screen and at paper scale.
   assert.match(
      preview,
      /\.beat-column\.with-chord-above \{\s*grid-template-rows: var\(--chord-above-h, 28px\) 54px/,
   );
   // PRINT geometry: the chord row adds NO height — it is a zero-height track whose
   // cell is drawn ABOVE the lane with a relative offset — so the printed lane,
   // rhythm beams and notes keep the exact default geometry and the line pitch is
   // unchanged. The row only moves up, into the bar's top band.
   assert.match(preview, /--print-chord-above-size: calc\(var\(--print-chord-size\) \* 0\.9\)/);
   assert.match(preview, /--print-chord-above-row: calc\(var\(--print-chord-above-size\) \+ 0\.2mm\)/);
   const floatingRows =
      preview.match(
         /\.beat-column\.with-chord-above \{[^}]*grid-template-rows: 0 var\(--print-notation-h\)/g,
      ) || [];
   assert.equal(floatingRows.length, 2, "@media print and is-print-layout must both float the row");
   const offsets = preview.match(/top: calc\(-1 \* var\(--print-chord-above-row\)\);/g) || [];
   assert.equal(offsets.length, 2, "the offset must be applied in both print scopes");
   // Each chord-row LINE reserves headroom for the row floating above it, so the row of
   // line N can never touch the chords of line N-1 — and ONLY such lines: the selector
   // carries .has-chord-above, so a section with the row switched OFF keeps its default
   // spacing (the user's requirement). The amount is a single token, so it can be tuned
   // without touching the structure.
   assert.match(preview, /--print-chord-above-line-gap: 6mm/);
   const lineHeadroom =
      preview.match(/margin-top: var\(--print-chord-above-line-gap\);/g) || [];
   assert.equal(lineHeadroom.length, 2, "both print scopes must reserve the line headroom");
   // The chord row's distance to the number below must be IDENTICAL whatever the beat
   // type: the plain cell and every ½/⅓/¼ sub-cell share one height/token, so the
   // gap can never differ between a beat with a rhythm marker and one without.
   const equalCells =
      preview.match(/\.sub-chord-above \.chord-above-editor \{\s*height: var\(--print-chord-above-row\);/g) ||
      [];
   assert.equal(equalCells.length, 2, "both print scopes must equalise the sub-cell height");
   assert.match(
      preview,
      /\.bar\.has-chord-above \.sub-chord-above \.chord-above-editor \{\s*height: var\(--chord-above-h, 32px\);/,
   );
   assert.match(preview, /\.chord-above-input \{[^}]*font:\s*800 14px\/1\.15/);
   // The `top: -row` offset must be applied ONCE. Without `align-self: start` the
   // screen rule's `align-self: end` adds its own shift inside the zero-height track,
   // leaving a PLAIN beat's chord row ~4mm higher than a ½/⅓/¼ beat's — the exact
   // difference the user reported.
   const singleOffsets =
      preview.match(/align-self: start;\s*top: calc\(-1 \* var\(--print-chord-above-row\)\);/g) || [];
   assert.equal(singleOffsets.length, 2, "both print scopes must pin the offset exactly once");
   // A subdivided beat with a chord row above spreads its number slots over the SAME
   // width as its chord cells, using the same slot centres (natural widths + space-around,
   // so a long chord still can't wrap). That is what makes the beat spacing below follow
   // the chord content above — the reported PDF issue.
   const spreadTracks =
      preview.match(
         /\.bar\.has-chord-above \.duration-(half|triplet|quarter) \.sub-beats \{\s*grid-template-columns: repeat\(\d, minmax\(var\(--print-slot\), max-content\)\);\s*justify-content: space-around;/g,
      ) || [];
   assert.equal(
      spreadTracks.length,
      6,
      "half/triplet/quarter must follow the chord row in both print scopes",
   );
   const spreadChords =
      preview.match(
         /\.sub-chord-above \{\s*width: 100%;[\s\S]{0,400}?grid-template-columns: repeat\(var\(--lyric-leaves\), minmax\(var\(--print-slot\), max-content\)\);\s*justify-content: space-around;/g,
      ) || [];
   assert.equal(spreadChords.length, 2, "the chord cells must use the same slot centres");
   const fillsColumn = preview.match(/\.bar\.has-chord-above \.sub-beats \{\s*width: 100%;/g) || [];
   assert.equal(fillsColumn.length, 2, "both print scopes must let the sub-beats fill the column");
   const firstLineHeadroom =
      preview.match(/margin-top: calc\(var\(--print-chord-above-line-gap\) \+ 0\.4mm\);/g) || [];
   assert.equal(firstLineHeadroom.length, 2, "both print scopes must pad the first line");
   assert.ok(
      !/\.bar-batch \.bar \{[^}]*margin-top: [1-9]/.test(preview),
      "a plain bar (row OFF) must never gain extra top margin",
   );
   // The per-bar ♪ toggle was REMOVED — the chord row is section-level only now.
   assert.ok(!/\.chord-above-bar-toggle/.test(ui), "the per-bar chords+ button must be gone");
   // The remaining bar tools live inside .bar-tools, which both print scopes hide.
   assert.match(preview, /html\.is-print-layout \.bar-tools,/);
   // Read-only members keep the row readable but cannot type into it.
   assert.match(ui, /body\[data-member-readonly="1"\] \.chord-above-input/);
   // The chord field is a UNIFORM width, wide enough for chords like `Em/C#` — no
   // ragged, content-sized boxes (that version was rejected).
   assert.match(preview, /--chord-above-w: 68px/);
   assert.match(preview, /\.chord-above-editor \{[^}]*width: var\(--chord-above-w, 68px\)/);
   assert.match(preview, /\.sub-chord-above \.chord-above-editor \{\s*width: var\(--chord-above-w, 68px\)/);
   // The beat pitch is the JS-distributed --leaf (+ a delta, see the dedicated test
   // below). The sheet must NEVER pin --leaf for chord rows: that is what silently
   // shrank the beats when the row was switched on.
   assert.ok(
      !/\.bar\.has-chord-above \{\s*--leaf:/.test(preview),
      "the chord row must not override the distributed --leaf",
   );
   assert.ok(!preview.includes("chord-above-sizer"), "the content-sizing sizer is gone");
   // A filled cell reads as a soft green chip; empty / hover / focus and the dark
   // theme are styled too (the row must look tidy above the beats).
   assert.match(preview, /\.chord-above-input:focus \{[^}]*box-shadow: 0 0 0 3px rgba\(100, 167, 123/);
   assert.match(preview, /\.chord-above-editor\.has-chord-above \.chord-above-input \{[^}]*background: #e4f5ea/);
   assert.match(
      preview,
      /html\[data-theme="dark"\] \.chord-above-editor\.has-chord-above \.chord-above-input \{[^}]*background: #14201a/,
   );
   // A chord-row bar is a touch taller (32px cell) and keeps its top band free — the
   // absolutely positioned hover tools (✕ delete bar / ⧉ ⎘ / ♪, first 25px) must not
   // crop the field above the first beat.
   assert.match(preview, /--chord-above-h: 32px/);
   assert.match(
      preview,
      /html:not\(\.is-print-layout\) \.bar\.has-chord-above \{\s*padding-top: \d+px;/,
   );
   // ...and that room is screen-only: the printed bar keeps its own padding tokens (plus the
   // optional bar-number band, which is 0mm unless a score draws numbers).
   assert.match(preview, /padding: calc\(var\(--print-bar-pad-y-top\) \+ var\(--print-bar-num-extra-top\)\)/);
});

test("the chord row clears the rhythm beams drawn under it", () => {
   const css = readProjectFile("styles/score/preview.css");
   // 1) Breathing room: the gap between the chord row and the notation lane must
   //    clear the beams (6px tucked them into the chord input's box).
   const gap = Number(css.match(/--chord-above-gap: (\d+)px/)?.[1]);
   assert.ok(gap >= 20, `--chord-above-gap must clear the lifted beams (got ${gap}px)`);
   // 2) Hard guarantee: with the row switched on, the whole ½ / ⅓ / ¼ marker keeps
   //    its line (and therefore its 28px hit area) INSIDE the notation lane, so it
   //    can never touch the chord field, whatever the zoom.
   assert.match(
      css,
      /html:not\(\.is-print-layout\) \.bar\.has-chord-above \.duration-line \{\s*top: -20px;\s*height: 20px;/,
   );
   assert.match(
      css,
      /html:not\(\.is-print-layout\) \.bar\.has-chord-above \.nested-duration-line \{\s*top: -11px;/,
   );
   // The maths that makes it work: the capped marker draws its line 6px into the
   // box (-20px + 6px = -14px from the group top) while the group sits 20px above
   // the lane's bottom (54px lane − 34px group) → the line stays 6px below the
   // lane's top edge, i.e. below the chord row's gap.
   assert.match(css, /\.duration-line::before \{\s*top: 6px;/);
   // Print geometry is deliberately untouched (its beams live inside the lane).
   assert.match(css, /\.duration-line \{\s*top: var\(--print-beam-top\);/);
});

test("a nested ½ beam lines up with the parent beam on the edge they share", () => {
   const css = readProjectFile("styles/score/preview.css").replace(/\/\*[\s\S]*?\*\//g, "");
   // The parent half beam sits 7px inside the padding-free .beat-group...
   assert.match(css, /\.duration-line \{\s*position: absolute;\s*top: 1px;\s*left: 7px;\s*right: 7px;/);
   // ...while .sub-beats carries a 2px horizontal affordance padding, so a nested host
   // hugging one side of that grid sits 2px further in. 7px − 2px = 5px leaves the
   // nested bar FLUSH with the parent bar — the way the 1/4's two bars stack, and
   // exactly how the printed/PDF beam already looks.
   assert.match(css, /\.sub-beats \{\s*display: grid;\s*height: 34px;\s*gap: 0;\s*padding: 0 2px;/);
   assert.match(css, /\.nested-duration-line \{\s*top: -19px;\s*right: 5px;\s*left: 5px;/);
   // Both printed markers keep the single shared print inset token (which is why the
   // PDF already lined up before this change — the print geometry stays untouched).
   assert.match(
      css,
      /\.duration-line,\s*\.nested-duration-line \{\s*display: block !important;\s*right: var\(--print-duration-inset\);\s*left: var\(--print-duration-inset\);/,
   );
});

test("the phone layout keeps the nested ½ beam 5px under the primary beam", () => {
   const ui = readProjectFile("styles/ui.css").replace(/\/\*[\s\S]*?\*\//g, "");
   const phone = ui.slice(ui.indexOf("@media (max-width: 680px)"), ui.indexOf("@media (max-width: 340px)"));
   assert.ok(phone.length > 0, "the touch beam block must exist");
   // The touch layout draws both beams higher above the notes: the primary bar lands
   // 8px into its box, the 1/4's second bar 13px in — a 5px row gap.
   assert.match(phone, /\.duration-line \{\s*top: -32px;\s*height: 38px;/);
   assert.match(phone, /\.duration-line::before \{\s*top: 8px;\s*height: 1\.5px;/);
   assert.match(phone, /\.duration-quarter \.duration-line::after \{\s*top: 13px;\s*height: 1\.5px;/);
   // The nested ½'s second bar must hang those same 5px under the primary beam line
   // (-32px + 8px = -24px, so -19px) while its own ::before draws 4px into the box,
   // hence top: -23px. The phone block used to say 8px, which dropped the bar to the
   // lane top and left a 36px gap instead of 5px.
   assert.match(phone, /\.nested-duration-line \{\s*top: -23px;\s*height: 28px;/);
   assert.match(phone, /\.nested-duration-line::before \{[\s\S]*?top: 4px;/);
});

test("the help dialog and README document the chord row above the numbers", () => {
   const html = readProjectFile("index.html");
   const dialog = html.match(/id="howToDialog"[\s\S]*?<\/ul>/);
   assert.ok(dialog, "the help dialog must exist");
   assert.match(dialog[0], /Chords above the numbers/);
   assert.match(dialog[0], /Chords On\/Off/);
   // The per-bar ♪ control was removed from the help — the row is section-level only.
   assert.ok(!/♪<\/strong> button in a bar/.test(dialog[0]), "no per-bar ♪ control in the help");
   // The ••• menu keeps copy/paste/delete only: the bulk "Chord row: all bars / no bars"
   // entries were deliberately removed, and so was the per-bar ♪ toggle.
   assert.ok(
      !/Chord row: (?:all|no) bars/.test(html),
      "the section menu must not offer the bulk chord-row actions",
   );
   // There is deliberately NO song-wide switch any more.
   assert.ok(!/CHORDS\+/.test(dialog[0]), "the help must not mention a global CHORDS+ switch");
   const readme = readProjectFile("README.md");
   assert.match(readme, /### Chord row above the numbers \(Chord Chart mode\)/);
   assert.match(readme, /chordAboveBars/);
   assert.ok(!/Chord row: (?:all|no) bars/.test(readme), "the README must not document them either");
   assert.match(readme, /\| Section \|[\s\S]{0,220}?Chords On\/Off/);
   assert.ok(
      !/\| Bar \|[\s\S]{0,220}?♪/.test(readme),
      "the README must not list a per-bar row control",
   );
   assert.ok(!/\| Song \|/.test(readme), "the README must not list a song-level switch");
   // ...and the album doc lists the new controls as locked for members.
   const album = readProjectFile("docs/ALBUM-FEATURE.md");
   assert.match(album, /chord row's own controls/);
   assert.ok(!/header `CHORDS\+`/.test(album), "no global switch to lock any more");
});

test("a chord-row line keeps the distributed beat pitch and only ADDS a little", () => {
   const events = readProjectFile("src/events.js");
   // The JS-distributed leaf stays the BASE (never replaced by a fixed value) and a
   // small delta is added on chord-row lines, so the beats can only get wider — a
   // line that no longer fits scrolls horizontally instead of squeezing.
   assert.match(events, /const CHORD_ABOVE_LEAF_EXTRA = (\d+);/);
   assert.match(events, /const base = Math\.max\(MIN_LEAF, available \/ leaves\);/);
   assert.match(
      events,
      /const extra = batch\.classList\.contains\("has-chord-above"\) \? CHORD_ABOVE_LEAF_EXTRA : 0;/,
   );
   assert.match(events, /batch\.style\.setProperty\("--leaf", `\$\{base \+ extra\}px`\);/);
   // render.js marks the batch (per section) that reserves the chord row.
   assert.match(readProjectFile("src/render/render.js"), /bar-batch[^`]*has-chord-above/);
   // ...and the stylesheet must NOT pin --leaf for those bars (the shrink bug).
   assert.ok(
      !/\.bar\.has-chord-above \{\s*--leaf:/.test(readProjectFile("styles/score/preview.css")),
      "the chord row must not override the distributed --leaf",
   );
});

// ---- Bar numbers in the PDF ------------------------------------------------
// The number already lives in every bar (render.js); the option decides whether paper shows it
// and how densely. It is ON by default in the "line" density: ONE big number above the first
// barline of every printed line. Rows are laid out with `row-gap: 0`, so a number above EVERY bar
// ends up squeezed between two rows of music — one number per line is what reads on paper.
test("bar numbers number the line starts by default and can be made dense or invisible", () => {
   // NOTE: the stylesheets are hand-formatted and get re-wrapped by editors, so every assertion
   // below runs against whitespace-normalised text instead of relying on indentation/newlines.
   const preview = readProjectFile("styles/score/preview.css").replace(/\s+/g, " ");
   // The hide rule stays the BASELINE: a number only appears where the per-song attribute
   // and the Chord Chart mode agree (both are set by default — see pdfOptions.js).
   assert.ok(
      preview.includes(
         ".history-toolbar, .bar-num, .chord-remove, .section-chip, .placing-banner { display: none !important;",
      ),
      "@media print must keep the hide baseline",
   );
   assert.match(preview, /html\.is-print-layout \.bar-num,/);
   assert.ok(
      !/html\.is-print-layout \.bar-num \{[^}]*display: block/.test(preview),
      "the default hide rule must not be rewritten into a show rule",
   );
   // The LINE density numbers only the bar that starts a printed row; src/pdf/pdf.js tags every
   // other bar `.pdf-mid-bar`, so the show rule skips them (and the hide rule is explicit too).
   assert.equal(
      (preview.match(/\.bar:not\(\.pdf-mid-bar\) \.bar-num,/g) || []).length,
      2,
      "both print scopes must skip mid-row bars",
   );
   assert.equal((preview.match(/\.bar\.pdf-mid-bar \.bar-num \{/g) || []).length, 2);
   // ...and the mode guard is still on every stamp selector (Chord Chart only).
   assert.equal(
      (preview.match(/data-pdf-bar-numbers="line"\] body\[data-editor-mode="chords"\]/g) || []).length,
      8,
      "line density: show + hide + band + the 1/4 hide, in both print scopes",
   );
   assert.equal(
      (preview.match(/data-pdf-bar-numbers="every"\] body\[data-editor-mode="chords"\]/g) || []).length,
      8,
      "every-bar density: show + size override + band + the 1/4 hide, in both print scopes",
   );
   // Sizes: the line-start number is the BIG one, the dense variant is smaller and lighter.
   assert.equal((preview.match(/--print-bar-num-size: 3mm;/g) || []).length, 1);
   assert.equal((preview.match(/--print-bar-num-size-every: 2\.6mm;/g) || []).length, 1);
   assert.equal((preview.match(/--print-bar-num-inset: 1\.3mm;/g) || []).length, 1);
   assert.equal((preview.match(/--print-bar-num-top: 3\.5mm;/g) || []).length, 1);
   // The band tracks the nudge and always keeps the same clearance to the notation (0.5mm).
   assert.equal((preview.match(/\+ var\(--print-bar-num-top\) \+ 0\.5mm\);/g) || []).length, 2);
   assert.equal((preview.match(/--print-bar-num-weight: 800;/g) || []).length, 1);
   assert.equal((preview.match(/--print-bar-num-opacity: 1;/g) || []).length, 1);
   assert.equal(
      (preview.match(/--print-bar-num-extra-top: 0mm;/g) || []).length,
      1,
      "the reserved band must be a no-op until numbers are drawn",
   );
   assert.equal((preview.match(/--print-bar-num-extra-bottom: 0mm;/g) || []).length, 1);
   // The dense variant swaps the size + band through the card, so one pair of rules serves both.
   assert.equal((preview.match(/--print-bar-num-size: var\(--print-bar-num-size-every\);/g) || []).length, 2);
   assert.equal((preview.match(/font-size: var\(--print-bar-num-size\);/g) || []).length, 2);
   assert.equal((preview.match(/font-weight: var\(--print-bar-num-weight\);/g) || []).length, 2);
   assert.equal((preview.match(/opacity: var\(--print-bar-num-opacity\);/g) || []).length, 2);
   assert.equal((preview.match(/left: var\(--print-bar-num-inset\);/g) || []).length, 2);
   // The stamp sits ABOVE the barline: anchored to the top, bottom cleared, in both scopes.
   assert.equal(
      (preview.match(/bottom: var\(--print-bar-num-bottom\);/g) || []).length,
      0,
      "the stamp must not sit in the bar's bottom corner",
   );
   assert.equal((preview.match(/top: var\(--print-bar-num-top\);/g) || []).length, 2);
   assert.equal(
      (
         preview.match(
            /top: var\(--print-bar-num-top\); bottom: auto; left: var\(--print-bar-num-inset\);/g,
         ) || []
      ).length,
      2,
      "one stamp block per print scope",
   );
   // The reserved band is added to the top padding of BOTH bar layouts (plain + lyrics) in
   // BOTH scopes, and the barlines compensate so they stay locked to the notation.
   assert.equal(
      (
         preview.match(
            /calc\(var\(--print-bar-pad-y-top\) \+ var\(--print-bar-num-extra-top\)\)/g,
         ) || []
      ).length,
      4,
   );
   assert.equal(
      (
         preview.match(
            /calc\(var\(--print-bar-pad-y-bottom\) \+ var\(--print-bar-num-extra-bottom\)\)/g,
         ) || []
      ).length,
      4,
   );
   assert.equal(
      (
         preview.match(
            /top: calc\(50% \+ \(var\(--print-bar-num-extra-top\) - var\(--print-bar-num-extra-bottom\)\) \/ 2\);/g,
         ) || []
      ).length,
      2,
   );
   assert.equal(
      (
         preview.match(
            /--print-bar-num-extra-top: calc\(var\(--print-bar-num-row\) - var\(--print-bar-pad-y-top\)\);/g,
         ) || []
      ).length,
      2,
      "both print scopes must switch the band on when a density is chosen",
   );
});

test("every surface that draws bar numbers tags the line starts first", () => {
   // The line-starts density needs `.pdf-mid-bar`, which only markMidRowBars() (src/pdf/pdf.js) sets.
   // All three surfaces call it: the real print job (beforeprint), the PDF-options pane, and the
   // manual "PDF layout" preview — otherwise a preview would number every bar while the PDF
   // numbers only the line starts.
   const pdf = readProjectFile("src/pdf/pdf.js");
   assert.match(pdf, /const MID_BAR_CLASS = "pdf-mid-bar";/);
   assert.match(pdf, /markMidRowBars\(\{ forExport: true \}\);/);
   const options = readProjectFile("src/pdf/pdfOptions.js");
   assert.match(options, /markMidRowBars\(\);/);
   assert.match(
      options,
      /if \(previewWasOn && typeof isPreviewOn === "function" && isPreviewOn\(\)\) markMidRowBars\(\);/,
      "closing the dialog must re-tag when the user's own layout preview stays on",
   );
   const events = readProjectFile("src/events.js");
   assert.match(events, /import \{[^}]*markMidRowBars[^}]*\} from "\.\/pdf\/pdf\.js/);
   assert.match(events, /if \(printLayoutPreview\) requestAnimationFrame\(\(\) => markMidRowBars\(\)\);/);
   assert.match(events, /else clearMidRowBars\(\);/);
});

test("the live PDF preview shows exactly the bar numbers the PDF will print", () => {
   // The dialog moves the LIVE #previewCard into .pdf-preview-page, so its own rule only HIDES the
   // editor's faint 10px/0.34 numbers. The stamp itself comes from the shared
   // html.is-print-layout rules in score/preview-print.css (active in the pane too, opening the dialog turns
   // that class on), i.e. there is exactly ONE definition for paper and pane.
   const ui = readProjectFile("styles/ui.css").replace(/\s+/g, " ");
   assert.match(
      ui,
      /\.pdf-preview-page > #previewCard \.bar-num \{ display: none !important;/,
      "Off must hide the editor's own numbers in the pane too",
   );
   assert.equal(
      (ui.match(/body\[data-editor-mode="chords"\]/g) || []).length,
      0,
      "the pane must NOT duplicate the stamp rules",
   );
   // Same stamp geometry + SAME INK as the print scopes, so preview and paper cannot drift apart.
   // The ink is pinned by a token because var(--ink) turns near-white in dark mode while every
   // preview/print surface is a white sheet.
   const preview = readProjectFile("styles/score/preview.css");
   assert.equal((preview.match(/--print-bar-num-ink: #173a28;/g) || []).length, 1);
   assert.equal((preview.match(/color: var\(--print-bar-num-ink\);/g) || []).length, 2, "both print scopes");
   assert.ok(!/\[data-pdf-bar-numbers[\s\S]{0,400}color: var\(--ink\);/.test(preview));
});

test("the PDF options dialog never drags the site footer into view", () => {
   // Opening the dialog switches the editor behind it into the PDF layout, which compacts
   // the page — and the site footer is a full-width band that paper never contains, so it
   // used to slide up right behind the modal. It must be hidden in that scope too, but
   // ONLY on screen: a real print job sets the very same class, and there @media print
   // keeps its own rules.
   const ui = readProjectFile("styles/ui.css").replace(/\s+/g, " ");
   assert.match(
      ui,
      /@media screen \{ html\.is-print-layout \.site-footer \{ display: none;/,
      "the layout preview must drop the site footer on screen",
   );
   assert.match(
      ui,
      /\.scroll-affordance, \.site-footer, \.pdf-options-modal,/,
      "paper still hides the site footer with the rest of the app chrome",
   );
});

test("the PDF options dialog exposes the bar-number choice", () => {
   const html = readProjectFile("index.html");
   const group = html.match(/id="pdfBarNumGroup"[\s\S]{0,700}?<\/div>/);
   assert.ok(group, "the bar-numbers choice group must exist in the dialog");
   for (const value of PDF_BAR_NUMBERS)
      assert.match(group[0], new RegExp(`data-barnum="${value}"`), `${value} button`);
   // The labels describe the DENSITY (the horizontal side is gone).
   assert.match(group[0], />\s*Line starts\s*</);
   assert.match(group[0], />\s*Every bar\s*</);
   assert.ok(
      !/Above left|Above right|Bottom left|Bottom right|Top left|Top right/.test(group[0]),
      "stale corner labels must be gone",
   );
   const options = readProjectFile("src/pdf/pdfOptions.js");
   // ON by default (line starts), and clicking a button records the choice so an explicit
   // Off survives the legacy migration in sanitize().
   assert.match(options, /barNumbers: "line",/);
   assert.match(options, /export const PDF_BAR_NUMBERS = \["off", "line", "every"\];/);
   assert.match(options, /const LEGACY_BAR_NUMBERS = \{ left: "line", right: "line" \};/);
   assert.match(options, /const BAR_NUMBERS_CHOICE = "barNumbersChoice";/);
   assert.match(options, /settings\[BAR_NUMBERS_CHOICE\] = 1;/);
   assert.match(options, /const barNumWrap = \$\("#pdfBarNumGroup"\);/);
   assert.match(options, /settings\.barNumbers = btn\.dataset\.barnum;/);
});

// ---- Bar numbers are Chord-Chart-only ---------------------------------------
// Nashville Numbers mode already IS numbers (a corner stamp duplicates the notation)
// and ChordPro has no bars, so the option is taken out of those modes — in the dialog
// AND in the print CSS, so an older per-song value can't leak onto their pages.
// A 1/4 score is left out as well: it is ONE growing bar without a bar line, so
// there is no bar to number (the print CSS hides the stamp there too).
test("bar numbers are a Chord Chart-only option (Numbers/ChordPro/1-4 never get them)", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /<div class="pdf-field-divider" id="pdfBarsDivider">/);
   assert.match(html, /<section class="pdf-field" id="pdfBarNumField">/);
   const options = readProjectFile("src/pdf/pdfOptions.js");
   assert.match(options, /onExport, getCard, barNumbersAvailable \} = \{\}\) \{/);
   assert.match(options, /const barNumField = \$\("#pdfBarNumField"\);/);
   assert.match(options, /const barsDivider = \$\("#pdfBarsDivider"\);/);
   assert.match(options, /function syncBarNumAvailability\(\) \{/);
   assert.match(options, /barNumField\.hidden = !offered;/);
   assert.match(options, /barsDivider\.hidden = !offered;/);
   // It has to run when the dialog OPENS (the mode may have changed while it was shut).
   assert.match(options, /applyPdfOptions\(settings\);\n      syncBarNumAvailability\(\);/);
   // events.js answers from the live editor mode ("chords" is the Chord Chart id).
   assert.match(
      readProjectFile("src/events.js").replace(/\s+/g, " "),
      /barNumbersAvailable: \(\) => normalizeEditorMode\(getState\(\)\.editorMode\) === "chords" && !isSingleBeatMeter\(getState\(\)\.meter\),/,
   );
   // `hidden` must beat the flex layouts of .pdf-field / .pdf-field-divider, and the dialog pane
   // must NOT redeclare the stamp: one definition (score/preview-print.css) covers paper AND pane.
   const ui = readProjectFile("styles/ui.css").replace(/\s+/g, " ");
   assert.match(ui, /\.pdf-options-panel \[hidden\] \{ display: none !important;/);
   assert.equal((ui.match(/body\[data-editor-mode="chords"\]/g) || []).length, 0);
});

test("bar numbers default to the line-starts density, and only a deliberate Off keeps them away", () => {
   assert.equal(defaultPdfOptions().barNumbers, "line");
   assert.equal(sanitize({}).barNumbers, "line");
   assert.equal(sanitize({ barNumbers: "line" }).barNumbers, "line");
   assert.equal(sanitize({ barNumbers: "every" }).barNumbers, "every");
   // Anything unknown falls back to the DEFAULT (not to "off"), so a garbled value can
   // never silently strip the numbers from a chart.
   assert.equal(sanitize({ barNumbers: "bogus" }).barNumbers, "line");
   assert.equal(sanitize(null).barNumbers, "line");
   // The option briefly stored a horizontal side; that axis is gone, so the legacy values map
   // onto the look they described instead of being dropped.
   assert.equal(sanitize({ barNumbers: "left" }).barNumbers, "line");
   assert.equal(sanitize({ barNumbers: "right" }).barNumbers, "line");
   // LEGACY migration: OFF used to be the default and the dialog persisted the whole
   // settings object on any tweak, so a stored "off" WITHOUT the deliberate marker is the
   // old default — those songs get their numbers back instead of staying number-less.
   assert.equal(sanitize({ barNumbers: "off" }).barNumbers, "line");
   // ...while a real Off (marker written when the button was clicked) is respected and
   // survives the sanitize → store → sanitize round-trip.
   const deliberate = sanitize({ barNumbers: "off", barNumbersChoice: 1 });
   assert.equal(deliberate.barNumbers, "off");
   assert.equal(deliberate.barNumbersChoice, 1);
   assert.equal(sanitize(deliberate).barNumbers, "off");
   // The attribute is the single print switch: written whenever a density is chosen — the
   // DEFAULT included, which is what numbers a zero-configuration export — and removed only
   // for a real Off.
   const hadDocument = "document" in globalThis;
   const previous = globalThis.document;
   try {
      const root = { style: { setProperty() {}, removeProperty() {} }, dataset: {} };
      globalThis.document = { documentElement: root, getElementById: () => null };
      applyPdfOptions(defaultPdfOptions());
      assert.equal(root.dataset.pdfBarNumbers, "line", "a fresh export numbers every line start");
      applyPdfOptions(sanitize({ barNumbers: "every" }));
      assert.equal(root.dataset.pdfBarNumbers, "every");
      applyPdfOptions(sanitize({ barNumbers: "line" }));
      assert.equal(root.dataset.pdfBarNumbers, "line");
      applyPdfOptions(sanitize({ barNumbers: "off", barNumbersChoice: 1 }));
      assert.equal(root.dataset.pdfBarNumbers, undefined);
   } finally {
      if (hadDocument) globalThis.document = previous;
      else delete globalThis.document;
   }
});

// ---- Paper size is locked to A4 ---------------------------------------------
// The PDF options dialog no longer offers a paper choice: the exported PDF is
// always A4 (the geometry score/preview-print.css already declares). A stored value — e.g. a
// legacy page — is ignored so an old song keeps printing on A4.
test("paper size is locked to A4 (no A4/Letter choice anymore)", () => {
   assert.deepEqual(Object.keys(PDF_PAPER), ["a4"], "only A4 remains in the paper table");
   assert.equal(PDF_PAPER.a4.width, "210mm");
   assert.equal(defaultPdfOptions().paper, "a4");
   // A stored value can never change the page (a legacy "letter" included).
   assert.equal(sanitize({ paper: "letter" }).paper, "a4");
   assert.equal(sanitize({ paper: "bogus" }).paper, "a4");
   // The dialog markup carries no paper control at all.
   const html = readProjectFile("index.html");
   assert.ok(!html.includes('id="pdfPaperGroup"'), "the Paper size group is gone");
   assert.ok(!html.includes("data-paper="), "no paper-choice buttons remain");
   // ...and the module keeps no paper geometry / lookup / click handler.
   const options = readProjectFile("src/pdf/pdfOptions.js");
   assert.ok(!/letter\s*:/.test(options), "no Letter geometry left in PDF_PAPER");
   assert.ok(!options.includes('$("#pdfPaperGroup")'), "no paperWrap lookup");
   assert.ok(!options.includes("data-paper"), "no paper click handler");
   // applyPdfOptions never injects a page override anymore (A4 is the CSS default).
   assert.match(options, /document\.getElementById\("pdfPageStyle"\)\?\.remove\(\);/);
});

// ---- chordEditor: typing a chord in your OWN spelling ----------------------
// `Bm7♭5` (the reported case) is canonicalised by the bank to `Bø7`; the editor now
// echoes the typed spelling as the first suggestion so a player can keep their
// notation, while the canonical spelling stays available right below it.
test("a chord typed in the user's own spelling is offered back as a suggestion", () => {
   assert.deepEqual(
      withTypedSpelling(["Bø7", "D♭ø7"], "Bm7♭5", "chords"),
      ["Bm7♭5", "Bø7", "D♭ø7"],
   );
   // Already-canonical input is not duplicated (folding ignores accidental glyphs).
   assert.deepEqual(withTypedSpelling(["B♭"], "Bb", "chords"), ["B♭"]);
   // Slash chords are generated by the bank; Numbers mode keeps its degrees; plain
   // text that isn't a chord spelling is left to the custom-chord path.
   assert.deepEqual(withTypedSpelling([], "Bm7♭5/G", "chords"), []);
   assert.deepEqual(withTypedSpelling([], "1", "numbers"), []);
   assert.deepEqual(withTypedSpelling([], "Amazing", "chords"), []);
   assert.equal(isValidChordSpelling("Cmaj9"), true);
   assert.equal(isValidChordSpelling("C6/9"), true);
   assert.equal(isValidChordSpelling("Cxyz"), false);
   assert.equal(isValidChordSpelling("H7"), false);
});

test("the README documents the ChordPro mode and its starters", () => {
   const readme = readProjectFile("README.md");
   assert.match(readme, /### ChordPro mode/);
   assert.match(readme, /Starting a ChordPro song/);
   assert.match(readme, /\[C\] \[Am7\] \[Dm7\] \[G7\] \[Cmaj7\]/);
   assert.match(readme, /Adjacent chords stay readable/);
   assert.match(readme, /Print parity/);
});

test("the LIVE PREVIEW bar is bold, larger and aligned with the preview card", () => {
   const css = readProjectFile("styles/score/chordpro.css");
   assert.match(css, /\.cp-stage-title \{[^}]*font-size: 13px[^}]*font-weight: 800/);
   assert.match(css, /\.cp-stage-hint \{[^}]*font-size: 12\.5px[^}]*font-weight: 700/);
   // The bar lives in the card's column and lines up with the card's content edge.
   assert.match(css, /\.cp-stage-bar \{[^}]*max-width: 210mm[^}]*margin: 0 auto[^}]*padding: 0 2px 0 var\(--cp-card-pad-x/);
   assert.match(css, /\.cp-stage \{[^}]*--cp-card-pad-x: 10mm/);
   assert.match(css, /\.cp-card \{[\s\S]*?padding: var\(--cp-card-pad-y, 12mm\) var\(--cp-card-pad-x, 10mm\)/);
});

// ---- Album roles are shown as MD (Music Director) on every screen ----
// The app has exactly two Firestore roles — `owner` (full access) and `member`
// (read-only) — but the UI never says "owner"/"co-owner": the person who leads
// the band is the MUSIC DIRECTOR ("MD"), flagged next to their name.

test("an album owner is labelled MD (Music Director), never co-owner", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   // One source of truth for the wording…
   assert.match(cloudUI, /const MD_LABEL = "MD";/);
   assert.match(cloudUI, /const MD_TITLE = "Music Director";/);
   assert.match(cloudUI, /function roleShortLabel\(role\) \{\n\s+return role === "owner" \? MD_LABEL : "Member";/);
   // …used by the Members dialog, the album header, the album card and the picker.
   assert.match(cloudUI, /const roleLabel = roleShortLabel\(currentAlbum\.role\);/);
   assert.match(cloudUI, /const isOwner = album\.role === "owner";/);
   assert.match(cloudUI, /\$\{isOwner \? mdLabel : "Member"\}/);
   assert.match(cloudUI, /song\$\{a\.songCount === 1 \? "" : "s"\} · \$\{MD_LABEL\}<\/small>/);
   // No screen may print the old naming (the only mentions left are the comment
   // that explains the rename and the DB-side word "owner").
   [readProjectFile("index.html"), readProjectFile("src/cloud.js")].forEach((source, i) => {
      assert.doesNotMatch(source, /co-owner|Co-owner|⭐ Owner/, `co-owner wording gone (${i})`);
   });
   assert.ok(!/>"Owner"<|⭐ Co-owner|↓ Member/.test(cloudUI), "the old role labels are gone");
   // The stale-role guard toast speaks MD too.
   assert.match(
      readProjectFile("src/cloud.js"),
      /You are the only MD\. Promote another member to MD first, or delete the album\./,
   );
});

test("a member row flags an MD with a bold-italic (MD) marker beside the name", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   // roleMarker() emits the parenthesised flag; a plain member gets nothing.
   assert.match(cloudUI, /function roleMarker\(role\) \{[\s\S]{0,140}?class="member-md-mark" title="\$\{MD_TITLE\}">\(\$\{MD_LABEL\}\)<\/span>/);
   // A plain member renders no marker at all (absence = member).
   assert.match(cloudUI, /return role === "owner"\n\s+\? ` <span class="member-md-mark"[\s\S]{0,90}?\n\s+: "";/);
   // …and it is printed straight after the name: "Dhandy (MD) (you)".
   assert.match(cloudUI, /const mdMark = roleMarker\(m\.role\);/);
   assert.match(cloudUI, /<strong>\$\{escapeHtml\(memberName\)\}\$\{mdMark\}\$\{you\}<\/strong>/);
   // BOLD (800) + ITALIC, in the album accent, light and dark.
   assert.match(css, /\.member-md-mark \{[^}]*font-style: italic;[^}]*font-weight: 800;[^}]*white-space: nowrap;/);
   assert.match(css, /html\[data-theme="dark"\] \.member-md-mark \{\n\s+color: #7fd3a4;/);
});

test("the member-actions buttons use VERB labels and a red SVG Remove", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   // Verb-first labels, both directions: "Make MD" / "Make member". A bare noun in
   // a pill reads as a STATUS badge ("Andi 🎼 MD" = Andi IS an MD), which is the
   // confusion this replaced — the sheet's subtitle states the CURRENT role.
   assert.match(cloudUI, /is-promote"[\s\S]{0,520}?<span class="btn-icon" aria-hidden="true"><svg[\s\S]{0,400}?<\/svg><\/span> Make \$\{MD_LABEL\}<\/button>/);
   assert.match(cloudUI, /is-demote"[\s\S]{0,520}?<span class="btn-icon" aria-hidden="true"><svg[\s\S]{0,400}?<\/svg><\/span> Make member<\/button>/);
   // The destructive one is a red SVG trash with its full label next to it.
   assert.match(
      cloudUI,
      /const REMOVE_ICON =\n\s+'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">[\s\S]{0,400}?<\/svg>';/,
   );
   assert.match(
      cloudUI,
      /is-danger member-remove-btn"[\s\S]{0,300}?\$\{REMOVE_ICON\}<span class="member-remove-label">Remove from album<\/span><\/button>/,
   );
   assert.ok(!/member-remove-btn"[\s\S]{0,600}?🗑/.test(cloudUI), "the trash must be an SVG, not the 🗑 emoji");
   assert.ok(!/🗑 Remove/.test(cloudUI), "the trash is an SVG; the label is words");
   assert.ok(!/member-role-chip/.test(cloudUI), "the old role chip is replaced by the (MD) marker");
   // No crown / star for the MD role: the glyph must read as MUSIC direction.
   assert.ok(!/👑|⭐/.test(cloudUI), "no crown or star in the role controls");
   // MD wears a SOFT GOLD tint (12% over the surface) — the same restrained
   // recipe as the red actions, NOT a saturated gradient that out-shouts the
   // primary buttons. `:is()` covers the row AND the phone sheet.
   assert.match(
      css,
      /:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-role-btn\.is-promote \{\n\s+color: #854d0e;\n\s+border: 1px solid color-mix\(in srgb, #f59e0b 32%, transparent\);\n\s+background: color-mix\(in srgb, #f59e0b 12%, #fff\);/,
   );
   assert.match(
      css,
      /:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-role-btn\.is-promote:hover \{[\s\S]{0,220}?background: color-mix\(in srgb, #f59e0b 20%, #fff\);/,
   );
   assert.match(
      css,
      /html\[data-theme="dark"\] :is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-role-btn\.is-promote \{\n\s+color: #fcd34d;\n\s+border-color: color-mix\(in srgb, #fbbf24 34%, transparent\);\n\s+background: color-mix\(in srgb, #fbbf24 16%, #111\);/,
   );
   assert.ok(!/member-role-btn\.is-promote[\s\S]{0,200}?linear-gradient/.test(css), "no gradient on MD");
   assert.match(css, /:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-role-btn\.is-demote \{\n\s+color: var\(--dark-green\);\n\s+border: 1px solid color-mix\(in srgb, var\(--line\) 95%, transparent\);\n\s+background: #fff;/);
   assert.match(css, /html\[data-theme="dark"\] :is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-role-btn\.is-demote \{\n\s+color: #d7e6d9;/);
   // Icon-only square, wearing the app's single red — byte-identical to the
   // album header's Leave button so "red" keeps exactly one meaning.
   const decl = [
      "color: #be123c;",
      "background: color-mix(in srgb, #e11d48 8%, #fff);",
      "border: 1px solid color-mix(in srgb, #e11d48 22%, transparent);",
   ];
   const leave = css.match(/\.cloud-album-actions \.button\.is-danger \{[\s\S]*?\n\}/)[0];
   const remove = css.match(/:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-remove-btn \{[\s\S]*?\n\}/)[0];
   // Square + grid-centred, so the SVG cannot be off-centre by a pixel.
   assert.match(
      remove,
      /display: grid;\n\s+place-items: center;\n\s+width: 38px;\n\s+min-width: 38px;\n\s+height: 38px;\n\s+min-height: 38px;\n\s+padding: 0;\n\s+line-height: 0;/,
   );
   assert.match(
      css,
      /:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-remove-btn svg \{\n\s+display: block;\n\s+width: 17px;\n\s+height: 17px;/,
   );
   decl.forEach((line) => {
      assert.ok(leave.includes(line), `Leave keeps ${line}`);
      assert.ok(remove.includes(line), `Remove matches Leave: ${line}`);
   });
   assert.match(
      css,
      /html\[data-theme="dark"\] :is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button\.member-remove-btn \{[\s\S]*?color: #fda4af;[\s\S]*?background: color-mix\(in srgb, #fb7185 14%, #111\);/,
   );
   // …and the old chip styling is gone with it.
   assert.ok(!/\.member-role-chip/.test(css), "dead chip CSS removed");
});

test("the sheet opens from the row's ⋮ (desktop) or a row tap (phone)", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   const html = readProjectFile("index.html");
   // ONE builder feeds the sheet; the ROW carries a single ⋮ instead of the two
   // verb buttons — inline they read as a status badge ("Andi 🎼 MD").
   assert.match(cloudUI, /function memberControlsMarkup\(member\) \{/);
   assert.match(cloudUI, /const controls = manageable\n\s+\? `\$\{memberManageButtonMarkup\(\{ uid: m\.uid, name: memberName \}\)\}<span class="member-row-chevron" aria-hidden="true">›<\/span>`/);
   assert.match(cloudUI, /body\.innerHTML = memberControlsMarkup\(member\);/);
   assert.match(cloudUI, /function memberManageButtonMarkup\(member\) \{/);
   assert.match(cloudUI, /class="member-row-menu-btn" data-member-menu data-uid="\$\{uid\}"/);
   assert.match(cloudUI, /aria-haspopup="dialog" aria-controls="memberActionsDialog" aria-expanded="false"/);
   // ONE affordance per width: the ⋮ lives in the row but CSS hides it on a phone,
   // where the whole row is the tap target and a chevron signals that.
   assert.match(css, /#albumMembersDialog \.member-row-menu-btn \{\n\s+display: none;\n\s+\}/);
   assert.match(css, /\.member-row-chevron \{\n\s+display: none;/);
   assert.match(css, /#albumMembersDialog \.member-row\.is-manageable \.member-row-chevron \{\n\s+display: block;\n\s+\}/);
   // A row is manageable only for ANOTHER MD (rules forbid self-writes, which is
   // what keeps the last MD from orphaning the album).
   assert.match(cloudUI, /const manageable = isOwner && !self;/);
   assert.match(cloudUI, /class="member-row\$\{manageable \? " is-manageable" : ""\}"/);
   // The sheet's dialog markup + its own dismiss hook.
   assert.match(html, /<div class="confirm-dialog(?: library-dialog)?" id="memberActionsDialog" hidden role="dialog" aria-modal="true"/);
   assert.match(html, /data-memberactions-dismiss/);
   assert.match(html, /<div class="member-actions-body" id="memberActionsBody"><\/div>/);
   // A row's ⋮ opens the sheet on EVERY width; isPhone() only WIDENS the hit area
   // (a phone may also tap the row), never changes what opens.
   assert.match(
      cloudUI,
      /\$\("#memberList"\)\?\.addEventListener\("click", \(event\) => \{\n\s+if \(event\.target\.closest\("\[data-members-retry\]"\)\) \{\n\s+openMembersDialog\(\);\n\s+return;\n\s+\}\n\s+const row = event\.target\.closest\("\.member-row\.is-manageable"\);\n\s+if \(!row\) return;\n\s+const menuBtn = event\.target\.closest\("\[data-member-menu\]"\);\n\s+if \(!menuBtn && !isPhone\(\)\) return;/,
   );
   assert.match(cloudUI, /openMemberActionsDialog\(\{\n\s+uid: member\.uid,\n\s+name: friendlyName\(member\) \|\| "Musician",/);
   assert.match(cloudUI, /\}, row\.querySelector\("\[data-member-menu\]"\)\);/);
   // The sheet names WHOM it manages, moves the focus in — and puts it back on the
   // ⋮ that opened it (aria-expanded tracks that too, like #versionSwitcherBtn).
   assert.match(cloudUI, /title\.textContent = `Manage \$\{who\}/);
   assert.match(cloudUI, /memberActionsTrigger\?\.setAttribute\("aria-expanded", "true"\);/);
   assert.match(cloudUI, /trigger\.setAttribute\("aria-expanded", "false"\);/);
   assert.match(cloudUI, /const visible = trigger\.isConnected && !!trigger\.offsetParent;/);
   assert.match(cloudUI, /\(\$\("#memberActionsBody \[data-member-action\]"\) \|\| \$\("#memberActionsClose"\)\)\?\.focus\(\);/);
   // The base ⋮ is the same neutral 38px grid-centred square the trash used to be,
   // and it wears neither the destructive red nor the MD gold.
   assert.match(css, /\.member-row-menu-btn \{\n\s+flex: 0 0 auto;\n\s+display: grid;\n\s+place-items: center;\n\s+width: 38px;\n\s+min-width: 38px;\n\s+height: 38px;\n\s+min-height: 38px;/);
   assert.ok(!/\.member-row-menu-btn[^}]*#be123c/.test(css), "the ⋮ must not wear the destructive red");
   assert.match(cloudUI, /\$\("#memberActionsDialog"\)\?\.addEventListener\("click", \(event\) => \{/);
   assert.match(cloudUI, /const btn = event\.target\.closest\("#memberActionsBody \[data-member-action\]"\);/);
   assert.match(cloudUI, /closeMemberActionsDialog\(\);\n\s+handleMemberAction\(action, uid, memberActionMembers\);/);
   // Escape closes the sheet first (it sits on top of the member list).
   assert.match(cloudUI, /if \(memberActionsOpen\(\)\) closeMemberActionsDialog\(\);\n\s+else if \(albumJoinResolve\)/);
   // …and a MISSING sheet must read as closed, or Escape would be swallowed.
   assert.match(cloudUI, /const d = \$\("#memberActionsDialog"\);\n\s+return !!d && !d\.hidden;/);
   // Closing the list also closes the sheet — and does NOT hand the focus back to
   // a ⋮ that sits inside a dialog which is going away.
   assert.match(cloudUI, /function closeMembersDialog\(\) \{[\s\S]{0,300}?closeMemberActionsDialog\(\{ restoreFocus: false \}\);/);
   // The summary teaches the affordance of THIS width: tap the row on a phone,
   // the row menu on a desktop. Plain members only see who manages the album.
   assert.match(cloudUI, /const note = \$\("#memberDialogSummaryNote"\);/);
   assert.match(
      cloudUI,
      /isPhone\(\)\n\s+\? "Tap a person to manage them\."\n\s+: "Use the menu on a person to manage them\.";/,
   );
   // The phone block: the ⋮ steps aside for the chevron, and the row becomes tap.
   assert.match(css, /@media \(max-width: 680px\) \{\n\s+#albumMembersDialog \.member-row \{\n\s+flex-wrap: nowrap;\n\s+\}\n\s+#albumMembersDialog \.member-row-menu-btn \{\n\s+display: none;\n\s+\}\n\s+#albumMembersDialog \.member-row\.is-manageable \{\n\s+cursor: pointer;\n\s+\}/);
   // The Remove label is never hidden any more: the sheet is the only surface and
   // it says "Remove from album" out loud.
   assert.match(css, /\.member-remove-label \{\n\s+display: inline;\n\s+font-weight: 700;\n\}/);
   assert.match(css, /\.member-actions-body \.member-controls \{\n\s+flex-direction: column;\n\s+align-items: stretch;\n\s+gap: 10px;\n\s+width: 100%;/);
   assert.match(
      css,
      /#memberActionsDialog \.member-actions-body \.member-controls \.button\.member-remove-btn \{\n\s+display: inline-flex;\n\s+width: 100%;\n\s+min-width: 0;\n\s+height: auto;\n\s+min-height: 46px;/,
   );
});

test("the member-actions buttons survive the phone breakpoint", () => {
   const css = readProjectFile("styles/ui.css");
   // base/tokens.css really does hide EVERY ghost button at ≤560px (the trap)…
   assert.match(
      readProjectFile("styles/base/tokens.css"),
      /@media\(max-width:560px\)\{[\s\S]{0,200}?\.button-ghost\{display:none\}/,
   );
   // …and the sheet's buttons are ghost buttons, so they must be re-shown
   // (an ID selector beats the class rule; media queries add no specificity).
   assert.match(
      css,
      /@media \(max-width: 560px\) \{\n\s+:is\(#albumMembersDialog, #memberActionsDialog\) \.member-controls \.button,\n\s+#addSongCancel\.button-ghost \{\n\s+display: inline-flex;/,
   );
});

test("a hidden home-toolbar button stays hidden on a phone", () => {
   const css = readProjectFile("styles/ui.css");
   const ui = readProjectFile("src/cloudUI.js");
   // The tabs really do swap the actions through the hidden attribute: "New Song"
   // and "Attach Link" are MY SONGS actions, "+ New Album" is the ALBUMS one.
   assert.match(ui, /if \(newSongBtn\) newSongBtn\.hidden = isAlbums;/);
   assert.match(ui, /if \(attachLinkBtn\) attachLinkBtn\.hidden = isAlbums;/);
   assert.match(ui, /if \(newAlbumBtn\) newAlbumBtn\.hidden = !isAlbums;/);
   // The phone re-shows (base/tokens.css drops every .button-ghost at ≤560px) carry an
   // ID selector AND !important — so the generic `.cloud-gallery-actions > [hidden]`
   // LOSES to them and the 🔗 Attach Link stayed visible on the Albums tab on a
   // phone. An ID-level [hidden] guard is what makes `hidden` win again, and it
   // must come AFTER the re-shows (order breaks the tie at equal specificity).
   const reshows = css.indexOf("#attachLinkBtn.button-ghost {");
   const guard = css.indexOf("#attachLinkBtn[hidden],");
   assert.ok(reshows > -1, "the phone re-show for Attach Link exists");
   assert.ok(guard > -1, "an ID-level [hidden] guard exists");
   assert.ok(guard > reshows, "the guard comes after the re-show, so it wins");
   assert.match(css, /#attachLinkBtn\[hidden\],[\s\S]{0,400}?display: none !important;/);
   // It covers every button in the app that is toggled through `hidden`.
   ["#newSongBtn[hidden]", "#newAlbumBtn[hidden]", "#joinAlbumBtn[hidden]", "#albumMembersBtn[hidden]", "#albumLeaveBtn[hidden]"].forEach((sel) => {
      assert.ok(css.includes(sel), `the guard covers ${sel}`);
   });
   // Belt and braces: the generic toolbar rule is still there for children.
   assert.match(css, /\.cloud-gallery-actions > \[hidden\] \{\n\s+display: none !important;\n\}/);
});

test("the role dialogs ask about MD, not co-owner", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /title: `Make \$\{MD_TITLE\} \(\$\{MD_LABEL\}\)\?`/);
   assert.match(cloudUI, /confirmLabel: `Make \$\{MD_LABEL\}`/);
   assert.match(cloudUI, /title: "Change back to a member\?"/);
   // Each confirm dialog leads with the SAME icon as its row button: 🎼 / 👤.
   assert.match(cloudUI, /confirmLabel: `Make \$\{MD_LABEL\}`, cancelLabel: "Cancel", icon: "music"/);
   assert.match(cloudUI, /confirmLabel: "Make member", cancelLabel: "Cancel", icon: "person"/);
   // The dialog's own subtitle explains the counts and goes STRAIGHT to the
   // permission sentence — no "MD = Music Director." preamble any more.
   assert.match(cloudUI, /`\$\{mdCount\} \$\{MD_LABEL\}\$\{mdCount === 1 \? "" : "s"\}/);
   assert.match(
      cloudUI,
      /desc\.textContent = `\$\{mdCount\} \$\{MD_LABEL\}\$\{mdCount === 1 \? "" : "s"\} and \$\{memberCount\} member\$\{memberCount === 1 \? "" : "s"\} in this album\.`;/,
   );
   assert.ok(
      !cloudUI.includes("MD = Music Director."),
      "the abbreviation preamble must not come back",
   );
   const html = readProjectFile("index.html");
   assert.match(html, /MDs can promote members to MD and remove them\./);
   assert.ok(!html.includes("MD = Music Director."), "no preamble in the dialog markup either");
});

// ============================================================================
// Version recency — ordering by updatedAt + per-version writing mode
// ----------------------------------------------------------------------------
// The version list is ordered MOST RECENTLY UPDATED first (a new or just-edited
// version lands on top); `number` is only a tiebreak. The same order drives the
// denormalized summary, so the library card shows the TOPMOST version's mode.
// ============================================================================
test("sortVersionsByRecency orders by updatedAt desc, then number desc as a tiebreak", () => {
   const versions = [
      { versionId: "a", number: 1, updatedAt: 300 },
      { versionId: "b", number: 3, updatedAt: 100 },
      { versionId: "c", number: 2, updatedAt: 300 }, // same recency as `a` → higher number first
      { versionId: "d", number: 9, updatedAt: undefined }, // no timestamp → 0 → last
   ];
   const sorted = sortVersionsByRecency(versions);
   assert.deepEqual(
      sorted.map((v) => v.versionId),
      ["c", "a", "b", "d"],
   );
   // Pure helper: the input array is never mutated.
   assert.deepEqual(
      versions.map((v) => v.versionId),
      ["a", "b", "c", "d"],
   );
});

test("sortVersionsByRecency is safe with an empty list", () => {
   assert.deepEqual(sortVersionsByRecency([]), []);
});

test("sortAlbumSongsByRecency keeps songs without a timestamp and sorts newest first", () => {
   const songs = [
      { songId: "old", updatedAt: 100 },
      { songId: "undated" },
      { songId: "new", updatedAt: 300 },
   ];
   const sorted = sortAlbumSongsByRecency(songs);
   assert.deepEqual(
      sorted.map((song) => song.songId),
      ["new", "old", "undated"],
   );
   assert.deepEqual(
      songs.map((song) => song.songId),
      ["old", "undated", "new"],
   );
});

test("listAlbumSongs reads the whole collection and sorts in the client", () => {
   const albums = readProjectFile("src/cloud/data/albums.js");
   assert.match(albums, /export function sortAlbumSongsByRecency\(songs\)/);
   assert.match(albums, /const snapshot = await dbFns\.getDocs\(albumSongsCollection\(albumId\)\);/);
   assert.match(albums, /const songs = sortAlbumSongsByRecency\(/);
   assert.doesNotMatch(
      albums,
      /dbFns\.query\(albumSongsCollection\(albumId\), dbFns\.orderBy\("updatedAt"/,
      "orderBy would silently omit album songs that lack updatedAt",
   );
});

test("album song listing shares the latest-summary backfill helper", () => {
   const albums = readProjectFile("src/cloud/data/albums.js");
   const songs = readProjectFile("src/cloud/data/songs.js");
   assert.match(songs, /export async function backfillLatestSummary\(/);
   assert.match(albums, /\n\s+backfillLatestSummary,/);
   assert.match(albums, /await backfillLatestSummary\(/);
});

test("a slow album-song response cannot replace the album now on screen", () => {
   const controller = readProjectFile("src/cloud/ui/controller.js");
   assert.match(controller, /let albumSongsRequest = 0;/);
   assert.match(controller, /const request = \+\+albumSongsRequest;/);
   assert.match(controller, /albumSongsRequest \+= 1;/);
   assert.equal(
      (controller.match(/request !== albumSongsRequest \|\| currentAlbum\?\.albumId !== albumId/g) || []).length,
      2,
      "both the success and error paths must ignore stale requests",
   );
});

test("listVersions and listAlbumVersions share the recency ordering", () => {
   const cloud = readProjectFile("src/cloud.js");
   // Both list functions must return sortVersionsByRecency(...) rather than an
   // ad-hoc `number` sort (which would put the newest NUMBER on top, not the most
   // recently updated version).
   assert.equal((cloud.match(/return sortVersionsByRecency\(versions\);/g) || []).length, 2);
});

test("saveVersion/saveAlbumVersion keep source timestamps when copying", () => {
   const cloud = readProjectFile("src/cloud.js");
   // The create path honours an explicit createdAt/updatedAt (used by EVERY copy
   // flow) so a duplicated song preserves its original recency order.
   assert.match(cloud, /export async function saveVersion\(songId, versionId, data = \{\}, \{ label, number, createdAt, updatedAt \}/);
   assert.match(cloud, /export async function saveAlbumVersion\(albumId, songId, versionId, data = \{\}, \{ label, number, createdAt, updatedAt \}/);
   assert.equal((cloud.match(/createdAt: createdAt \?\? data\.createdAt \?\? now,/g) || []).length, 2);
   assert.equal((cloud.match(/updatedAt: updatedAt \?\? data\.updatedAt \?\? now,/g) || []).length, 2);
});

test("the New Version dialog lets the user pick the version's writing mode", () => {
   const html = readProjectFile("index.html");
   const start = html.indexOf('id="newVersionModePicker"');
   assert.ok(start !== -1, "the mode picker must exist in the New Version dialog");
   // The picker offers ALL three modes (data-mode uses the stored ids).
   const picker = html.slice(start, html.indexOf('class="vd-youtube"', start));
   for (const mode of ["chords", "numbers", "chordpro"]) {
      assert.match(picker, new RegExp(`data-mode="${mode}"`), `picker offers ${mode}`);
   }
});

test("cloudUI builds a new version in the PICKED mode (not the current one)", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   // The selected mode is remembered and reported back on confirm.
   assert.match(cloudUI, /let versionNameDialogMode = "chords";/);
   assert.match(cloudUI, /mode: versionNameDialogMode,/);
   // onNewVersion must build the blank arrangement from the picked mode so versions
   // of one song can differ in mode.
   assert.match(cloudUI, /const currentMode = normalizeEditorMode\(current\?\.editorMode\);/);
   assert.match(cloudUI, /const blank = blankFor\(input\.mode \|\| currentMode\);/);
   assert.match(cloudUI, /defaultMode: currentMode,/);
});

test("saving a version refreshes the latest* summary (card mode follows the topmost version)", () => {
   const cloud = readProjectFile("src/cloud.js");
   const cloudUI = readProjectFile("src/cloudUI.js");
   // My Songs save path...
   assert.match(cloudUI, /latestVersionId: nextContext\.versionId,/);
   assert.match(cloudUI, /latestVersionLabel: nextContext\.versionLabel,/);
   // ...and the album save path.
   assert.match(cloud, /latestVersionId: nextVersionId,/);
   assert.match(cloud, /latestVersionLabel: nextLabel,/);
});


// ============================================================================
// Home quick menu (FAB speed-dial) — tablet & phone navigation + actions
// ----------------------------------------------------------------------------
// On ≤1050px the tab row and the header's create/import buttons give way to a
// floating speed-dial that holds view navigation (My Songs / Albums) + actions,
// and the header title becomes the "where am I" cue (dynamic per view).
// ============================================================================
test("the library keeps its primary tabs and actions visible without a floating menu", () => {
   const html = readProjectFile("index.html");
   const head = html.slice(html.indexOf('class="cloud-gallery-head library-topbar"'), html.indexOf('class="library-content"'));
   assert.match(head, /id="tabMySongs"/);
   assert.match(head, /id="tabAlbums"/);
   assert.ok(!html.includes('id="homeFab"'), "the FAB is removed");
   for (const id of ["newSongBtn", "newAlbumBtn", "attachLinkBtn", "joinAlbumBtn", "accountBtn"]) {
      assert.match(html, new RegExp(`id="${id}"`), `${id} remains in the library UI`);
   }
});

test("the library tab row remains visible at tablet and phone widths", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.home-tabs\s*\{[^}]*display:\s*flex !important/);
   assert.match(css, /@media screen and \(max-width: 680px\)\s*\{[\s\S]*?grid-template-areas:\s*"brand actions" "tabs tabs"/);
});

test("cloudUI updates the library heading and tab-specific actions", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /function updateHomeHeading\(\)/);
   assert.match(cloudUI, /title\.textContent = "Albums"/);
   assert.match(cloudUI, /title\.textContent = "My Songs"/);
   assert.match(cloudUI, /if \(joinAlbumBtn\) joinAlbumBtn\.hidden = !isAlbums;/);
   assert.match(cloudUI, /btnAlbums\.tabIndex = homeTab === "albums" \? 0 : -1/);
});


test("the profile popover is the only elevated library menu", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover\s*\{[\s\S]*?box-shadow:/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover-item:focus-visible/);
   assert.doesNotMatch(css, /\.cloud-modal\.library-redesign\s*\{[^}]*backdrop-filter:\s*blur/);
});

test("the tab switch hides My Songs actions in Albums", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /if \(newSongBtn\) newSongBtn\.hidden = isAlbums;/);
   assert.match(cloudUI, /if \(attachLinkBtn\) attachLinkBtn\.hidden = isAlbums;/);
   assert.match(cloudUI, /if \(newAlbumBtn\) newAlbumBtn\.hidden = !isAlbums;/);
   assert.match(cloudUI, /if \(joinAlbumBtn\) joinAlbumBtn\.hidden = !isAlbums;/);
});

test("library rows reflow into touch-sized rows on phones", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card,\s*\.cloud-album\.library-redesign \.song-card\s*\{[^}]*grid-template-areas:\s*"cover identity actions"/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-row-menu-trigger,[\s\S]*?min-height:\s*44px/);
});

test("library motion is tied to the tab selection and notation marks", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.home-tab::after\s*\{[\s\S]*?transition:\s*transform 180ms/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card:hover \.song-card-mode-mark[\s\S]*?scale\(1\.08\)/);
   const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
   assert.match(reduce, /\.cloud-gallery\.library-redesign \.home-tab::after[\s\S]*?transition:\s*none !important/);
});

test("library rows share the same grid at desktop and tablet sizes", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card,[\s\S]*?grid-template-columns:\s*52px minmax\(180px, 1\.45fr\)/);
   assert.match(css, /@media screen and \(max-width: 900px\)[\s\S]*?grid-template-columns:\s*48px minmax\(140px, 1\.2fr\)/);
   assert.match(css, /@media screen and \(max-width: 680px\)[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\) auto/);
   assert.match(css, /--library-ground:\s*#f2f5f2/);
   assert.match(css, /html\[data-theme="dark"\] \.cloud-gallery\.library-redesign/);
});


test("the library separates its topbar, view heading, actions, and search", () => {
   const html = readProjectFile("index.html");
   const topbar = html.slice(html.indexOf('class="cloud-gallery-head library-topbar"'), html.indexOf('class="library-content"'));
   const content = html.slice(html.indexOf('class="library-content"'), html.indexOf('id="homeFab"') > -1 ? html.indexOf('id="homeFab"') : html.indexOf('<!-- ==================== ALBUM DETAIL'));
   assert.match(topbar, /class="cloud-gallery-heading"/);
   assert.match(topbar, /class="home-tabs"/);
   assert.match(topbar, /class="cloud-gallery-actions"/);
   assert.match(content, /id="mySongsTitle"/);
   assert.match(content, /id="libraryCount"/);
   assert.match(content, /class="library-view-actions"/);
   assert.ok(content.indexOf('id="songSearch"') > content.indexOf('id="songsPanel"'));
   assert.ok(content.indexOf('id="albumSearch"') > content.indexOf('id="albumsPanel"'));
   assert.match(content, /id="joinAlbumBtn"/);
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.home-tab\.is-active::after/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.library-view-head/);
});

// ---- Home redesign: cover cards, motif fallback, error state, motion --------
// Every card leads with a 16:9 cover: the song's real YouTube thumbnail when a
// video exists, or a typographic motif (glyph + first content tokens) when it
// doesn't. A failed thumbnail repaints as the motif, so offline never shows a
// broken-image glyph.

test("song rows lead with a notation motif and keep video references in the Media column", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   // Cover helper validates the raw id through parseYoutubeUrl (field can be
   // absent / legacy / stale), and reuses thumbnailUrl — no duplicated URL math.
   assert.match(cloudUI, /function songCoverId\(song\)/);
   assert.match(cloudUI, /parseYoutubeUrl\(raw\.trim\(\)\)\?\.videoId \|\| ""/);
   assert.match(cloudUI, /coverMarkup\(song, mode/);
   assert.match(cloudUI, /coverMarkup\(song, mode, true\)/, "the My Songs index forces the notation motif");
   assert.match(cloudUI, /thumbnailUrl\(videoId\)/, "the photo cover reuses youtube.js");
   // Rows use a consistent cover, identity, arrangement summary, and data columns.
   assert.match(cloudUI, /class="song-card-cover is-photo" data-mode/);
   assert.match(cloudUI, /class="song-card-cover is-motif[^"]*" data-mode/);
   assert.match(cloudUI, /class="song-card-cover-img" src/);
   assert.match(cloudUI, /class="song-card-identity"/);
   const rowRenderer = cloudUI.slice(cloudUI.indexOf("function cardMarkup"), cloudUI.indexOf("// Keep the middle columns", cloudUI.indexOf("function cardMarkup")));
   assert.match(rowRenderer, /arrangementLabel\(song\)/);
   assert.match(cloudUI, /latestVersionLabel/, "the arrangement label comes from the latest version");
   assert.match(rowRenderer, /songMediaMarkup\(song\)/);
   assert.match(cloudUI, /class="song-card-media/);
   assert.match(rowRenderer, /song-card-open/);
   assert.match(rowRenderer, /song-card-chip is-key/);
   assert.match(rowRenderer, /song-card-chip is-meter/);
   assert.match(rowRenderer, /song-card-bpm/);
   assert.match(cloudUI, /latestBPM/);
   assert.match(cloudUI, /function libraryModeIcon\(mode/);
   assert.match(cloudUI, /libraryModeIcon\(mode,/);
   assert.match(cloudUI, /song-card-mode-icon/);
   assert.ok(!rowRenderer.includes("song-card-mode-chip"), "rows never repeat the mode as a text chip");
   assert.ok(!rowRenderer.includes("song-card-mode\""), "rows never repeat the mode as a text badge");
   // Motif tokens are derived from the song's own content.
   assert.match(cloudUI, /function motifTokens\(song, mode\)/);
   assert.match(cloudUI, /class="song-card-cover-tokens"/);
   // Song and album lists render actual data, not a fixed demo order.
   assert.match(cloudUI, /songs\.map\(\(song\) => cardMarkup\(song\)\)/);
   assert.match(cloudUI, /\(list \|\| \[\]\)\.map\(\(album\) => albumCardMarkup\(album\)\)/);
   assert.match(cloudUI, /list\.map\(\(song\) => albumSongRowMarkup\(song, role\)\)/);
   assert.match(cloudUI, /typeof album\.songCount === "number" && Number\.isFinite\(album\.songCount\)/);
   assert.match(cloudUI, /const songsLabel = songCount === null \? "" :/);
   // Album cards are a typographic index (no cover art): role tag, invite code
   // (MDs only), name, description, arrangement preview, counts.
   assert.doesNotMatch(cloudUI, /data-mode="album"/, "album cards no longer fake a cover mode");
   assert.match(cloudUI, /class="album-index-card"/);
   assert.match(cloudUI, /class="album-index-code"/);
   assert.match(cloudUI, /const code = isOwner \? String\(album\.activeInviteCode/);
   assert.ok(!/>💿</.test(cloudUI), "the album card glyph is typographic now");
});

test("the Albums index is a card grid with a role filter, sort and lazy extras", () => {
   const html = readProjectFile("index.html");
   const ui = readProjectFile("src/cloudUI.js");
   const cloud = readProjectFile("src/cloud.js");
   const css = readProjectFile("styles/ui.css");

   // Markup: one grid, a search, a role filter and a sort. The horizontal
   // nudge carousel is gone from this screen.
   assert.match(html, /class="album-index-grid" id="albumsGalleryCards" role="list"/);
   assert.match(html, /data-album-role="owner"/);
   assert.match(html, /data-album-role="member"/);
   assert.match(html, /id="albumSort"/);
   assert.match(html, /class="album-index-toolbar"/);
   assert.doesNotMatch(html, /albumsGalleryPrev|albumsGalleryNext/);

   // The view is computed client-side; the segment counts describe the WHOLE
   // album list, so they stay stable while the search narrows the grid.
   assert.match(ui, /function visibleAlbums\(\)/);
   assert.match(ui, /function syncAlbumFilterCounts\(\)/);
   assert.match(ui, /const counts = \{ all: cachedAlbums\.length, owner: 0, member: 0 \}/);
   assert.match(ui, /setAlbumRoleFilter\(role\)/);

   // Extras (arrangement preview + member count) are read lazily, one card at a
   // time, and cached; a filter re-render must not re-query Firestore.
   assert.match(ui, /function hydrateAlbumCard\(card\)/);
   assert.match(ui, /new IntersectionObserver/);
   assert.match(ui, /listAlbumSongPreview\(album\.albumId, ALBUM_TRACK_PREVIEW\)/);
   assert.match(ui, /countAlbumMembers\(album\.albumId\)/);
   assert.match(ui, /const ALBUM_EXTRA_TTL = 60_000;/);

   // The invite code is the MD's lever: members never see it on the card.
   assert.match(ui, /const code = isOwner \? String\(album\.activeInviteCode/);
   assert.match(ui, /class="album-index-code" type="button" data-act="copy-code"/);

   // Cloud contract: the summary carries the code, and the two card reads are
   // deliberately small (limit(3) + count), not full album reads.
   assert.match(cloud, /export async function listAlbumSongPreview\(albumId, max = 3\)/);
   assert.match(cloud, /dbFns\.limit\(limitTo\)/);
   assert.match(cloud, /export async function countAlbumMembers\(albumId\)/);
   assert.match(cloud, /dbFns\.getCountFromServer/);
   assert.match(cloud, /activeInviteCode: typeof data\.activeInviteCode === "string"/);

   // Layout: one column by default, two columns on desktop, and the MD tag has
   // a light-theme colour that holds on its own tint.
   assert.match(css, /#albumsPanel \.album-index-grid \{\n\s+display: grid;\n\s+grid-template-columns: minmax\(0, 1fr\);/);
   assert.match(css, /#albumsPanel \.album-index-grid \{\n\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
   assert.match(css, /html:not\(\[data-theme="dark"\]\) #albumsPanel \.album-index-role\.is-md/);
});

test("album card recent-arrangement keys are bold and green", () => {
   const css = readProjectFile("styles/ui.css");
   const ui = readProjectFile("src/cloudUI.js");
   assert.match(
      css,
      /#albumsPanel \.album-index-track-key \{[^}]*color: var\(--library-accent\);[^}]*font-weight: 700;/,
      "the key value is the green accent and bolder than the title",
   );
   assert.match(ui, /class="album-index-track-key"/);
});

test("album detail uses the My Songs index under a Stitch-style summary", () => {
   const html = readProjectFile("index.html");
   const ui = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");

   // Header: role / members / invite chips and the real album actions.
   assert.match(html, /class="album-detail-summary"/);
   assert.match(html, /id="albumRoleLabel"/);
   assert.match(html, /id="albumMemberCount"/);
   assert.match(html, /id="albumInviteCode"/);
   assert.match(html, /id="albumInviteCopyBtn"/);
   assert.match(html, /id="albumTabMySongs"/);
   assert.match(html, /id="albumTabAlbums"/);
   assert.match(html, /id="albumAccountBtn"/);
   assert.match(html, /id="albumSignOutBtn"/);
   assert.match(html, /id="albumInviteChip"[\s\S]{0,500}?id="albumInviteBtn"/);
   assert.doesNotMatch(html, /class="button button-ghost" id="albumInviteBtn"/);
   assert.match(html, /←<\/span> Back to Albums/);

   const albumDetail = html.slice(
      html.indexOf('id="albumModal"'),
      html.indexOf('id="addSongDialog"'),
   );
   const albumHeader = albumDetail.slice(
      albumDetail.indexOf('<header class="cloud-album-head'),
      albumDetail.indexOf("</header>") + 9,
   );
   const backAt = albumHeader.indexOf('id="albumBackBtn"');
   const tabsAt = albumHeader.indexOf('id="albumTabMySongs"');
   const profileAt = albumHeader.indexOf('id="albumAccountBtn"');
   assert.ok(backAt !== -1 && tabsAt !== -1 && profileAt !== -1, "the header owns all three controls");
   assert.ok(backAt < tabsAt && tabsAt < profileAt, "Back, tabs, then profile");
   assert.doesNotMatch(albumHeader, /theme/i);
   assert.doesNotMatch(html, /id="albumThemeToggle"/);

   // The list is the My Songs sheet, not a new row language.
   assert.match(html, /class="library-sheet album-detail-sheet"/);
   assert.match(html, /class="library-table-head album-detail-tablehead"/);
   assert.match(html, /library-table-head album-detail-tablehead[\s\S]{0,700}?class="library-sheet album-detail-sheet"/);
   assert.match(html, /id="albumSongCards" role="list"/);
   assert.match(html, /data-album-song-mode="chords"/);
   assert.match(html, /data-album-song-mode="numbers"/);
   assert.match(html, /data-album-song-mode="chordpro"/);
   assert.match(html, /id="albumSongSearchClear"/);
   assert.match(html, /id="albumSongSearch"[\s\S]{0,900}?class="library-search-kbd"/);
   assert.match(html, /id="albumReadonlyNote"/);
   assert.match(html, /data-album-song-icon="chords"/);
   assert.match(html, /data-album-song-icon="numbers"/);
   assert.match(html, /data-album-song-icon="chordpro"/);
   assert.doesNotMatch(html, /albumAddSongFooter|Add another song to this album/);

   // Rows reuse the index anatomy and only swap the menu actions.
   assert.match(ui, /function albumSongRowMarkup\(song, role\)/);
   assert.match(ui, /class="song-card library-song-row is-index-row is-\$\{mode\}"/);
   assert.match(ui, /coverMarkup\(song, mode, true\)/);
   assert.match(ui, /songMediaMarkup\(song\)/);
   assert.match(ui, /song-card-chip is-key/);
   assert.match(ui, /song-card-chip is-meter/);
   assert.match(ui, /song-card-open is-open/);
   assert.match(ui, /data-act="delete">Remove from album/);
   assert.match(ui, /data-act="copy">Save a copy/);

   // Search covers the facts the row shows; filter counts describe the album.
   assert.match(ui, /function foldAlbumSearch\(value\)/);
   assert.match(ui, /song\.latestBPM \|\| song\.bpm/);
   assert.match(ui, /song\.latestMeter \|\| song\.meter/);
   assert.match(ui, /function syncAlbumSongFilterCounts\(\)/);
   assert.match(ui, /counts\[albumSongMode\(song\)\] \+= 1/);
   assert.match(ui, /function setAlbumSongFilterMode\(mode\)/);

   // No drag reorder / numbering, and the dead carousel is gone.
   assert.doesNotMatch(ui, /draggable="true"|drag_indicator|nudgeAlbumSongsCarousel|albumSongsGalleryPrev/);
   assert.doesNotMatch(html, /albumSongsGalleryPrev|albumSongsGalleryNext/);
   assert.doesNotMatch(ui, /function albumSongCardMarkup/);

   // Member count is a lazy, fail-soft read; the invite chip copies the code.
   assert.match(ui, /countAlbumMembers\(albumId\)/);
   assert.match(ui, /hydrateAlbumMemberCount\(albumId\)/);
   assert.match(ui, /copyTextToClipboard\(code\)/);
   assert.match(ui, /function renderAlbumInviteChip\(\)/);
   assert.match(ui, /readonlyNote\.hidden = isOwner/);
   assert.match(ui, /actions\.classList\.toggle\("is-member", !isOwner\)/);
   assert.match(ui, /function albumSongFilterIcon\(mode\)/);
   assert.match(ui, /libraryModeIcon\(mode, "album-song-filter-mark"\)/);

   // The sheet and the summary keep one frame at every width.
   assert.match(css, /\.album-detail-summary \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 360px/);
   assert.match(css, /\.album-detail-sheet \.song-card\.is-index-row/);
   assert.match(css, /\.album-detail-actions \.button/);
   assert.match(css, /\.album-detail-actions\.is-member/);
   assert.match(css, /\.album-song-filter\.is-active/);
   assert.match(css, /\.album-detail-tablehead \{[\s\S]*?position: sticky/);
   assert.match(css, /\.album-detail-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
   assert.match(
      css,
      /\.cloud-album\.library-redesign \.album-detail-actions \.button \{[\s\S]*?display: inline-flex;[\s\S]*?justify-content: center;/,
   );
   assert.match(
      css,
      /\.album-song-toolbar \.album-song-search input \{[\s\S]*?padding: 8px 78px 8px 38px;/,
   );
   assert.match(css, /#albumAddFromBtn \{[\s\S]*?color: var\(--library-accent\)/);
   assert.match(css, /#albumLeaveBtn \{\n\s+grid-column: 1 \/ -1;/);
   assert.match(css, /\.album-song-search \.cloud-search-icon svg \{[\s\S]*?width: 16px/);
   assert.match(html, /id="addSongDialog"[\s\S]{0,600}?library-dialog-head has-media/);
   assert.match(html, /id="albumMembersDialog"[\s\S]{0,600}?library-dialog-head has-media/);
   assert.doesNotMatch(html, /confirm-dialog-icon" aria-hidden="true">👥/);
});

test("the My Songs index follows the Stitch component contract", () => {
   const ui = readProjectFile("src/cloudUI.js");
   const cloud = readProjectFile("src/cloud.js");
   const css = readProjectFile("styles/ui.css");
   const html = readProjectFile("index.html");
   // One brand green for every primary action, light and dark alike.
   assert.match(css, /--primary-fill: #237a50/);
   assert.match(css, /\.button-primary,\s*\n\.button-save \{[^}]*background: var\(--primary-fill\)/);
   // Search field is a fill, not a bordered box.
   assert.match(
      css,
      /\.cloud-gallery\.library-redesign \.library-toolbar \.cloud-search input \{[^}]*border: 1px solid transparent/,
   );
   // Secondary header action is borderless.
   assert.match(css, /\.library-view-actions \.button-ghost[\s\S]{0,160}?border-color: transparent/);
   // Row mode mark and filter option share one helper and one icon set.
   const notation = readProjectFile("src/notation/notation.js");
   assert.match(ui, /function libraryModeIcon\(mode/);
   assert.match(ui, /modeIconMarkup\(mode, className\)/);
   assert.match(notation, /mode-mark is-\$\{mode\}/);
   assert.match(html, /class="mode-mark is-chords mode-tile library-filter-option-mark"/);
   assert.match(css, /\.mode-tile \{/);
   assert.match(ui, /class="song-card-cover is-motif mode-tile is-\$\{mode\}"/);
   assert.match(css, /\.mode-mark svg \{/);
   // Nashville and ChordPro follow the Stitch light-mode Material Symbols,
   // drawn as filled inline paths; Chord Chart keeps the stroke note.
   assert.match(notation, /m240-160 40-160H120/);
   assert.match(notation, /M160-320v-480/);
   assert.match(notation, /svg class="is-filled"/);
   assert.match(css, /\.mode-mark svg\.is-filled \{[^}]*fill: currentColor/);
   assert.match(html, /mode-mark is-numbers mode-tile[\s\S]{0,120}?svg class="is-filled"/);
   assert.match(html, /mode-mark is-chordpro mode-tile[\s\S]{0,120}?svg class="is-filled"/);
   // Row action uses the secondary colour, key value is large and bold.
   assert.match(css, /\.song-card\.is-index-row \.song-card-open \{[^}]*background: var\(--library-secondary\)/);
   assert.match(css, /--library-secondary: #426653/);
   assert.match(css, /\.library-sheet \.song-card\.is-index-row \.song-card-chip\.is-key strong \{[^}]*font-size: 16px/);
   assert.match(css, /\.song-card-chip\.is-key strong \{[^}]*font-weight: 800/);
   // The video cell sits under the centred Video header.
   assert.match(css, /\.library-sheet \.song-card\.is-index-row \.song-card-media \{[^}]*justify-self: center/);
   // The row no longer repeats the mode as a chip or a text badge.
   assert.doesNotMatch(css, /\.song-card-mode-chip/);
   assert.doesNotMatch(ui, /song-card-mode-chip/);
   assert.doesNotMatch(ui, /class="song-card-mode"/);
   // Meter stacks the time signature above the tempo.
   assert.match(css, /\.song-card\.is-index-row \.song-card-meter \{[^}]*flex-direction: column/);
   assert.match(ui, /class="song-card-meter"/);
   // The tempo lives in the project as `bpm` (lower case) — the library summary
   // reads THAT field, never an invented `BPM` key.
   assert.match(ui, /Number\(song\.latestBPM \|\| song\.bpm\)/);
   assert.match(ui, /project\.editorMode, project\.youtubeId \|\| undefined, project\.key, project\.meter, project\.bpm/);
   assert.match(cloud, /latestBPM: Number\(data\.bpm\) \|\| ""/);
   assert.match(cloud, /data\.bpm \?\? data\.BPM/, "only legacy documents may use the old BPM key");
   // A song saved before the summary carried the tempo is repaired from its
   // latest version, so the library can show BPM right away.
   assert.match(cloud, /export async function backfillLatestSummary\(/);
   assert.match(cloud, /await backfillLatestSummary\(/);
   // Each writing mode owns a tinted tile (green / purple / amber), and the
   // row tile, the filter tile and the editor badge read the SAME tokens.
   assert.match(css, /--mode-numbers-fill: #f3effc/);
   assert.match(css, /--mode-chords-fill: #eef8f3/);
   assert.match(css, /--mode-chordpro-fill: #fef7ec/);
   assert.match(css, /--mode-numbers-fill: rgba\(99, 102, 241, 0\.22\)/);
   assert.match(css, /--mode-chordpro-fill: rgba\(245, 158, 11, 0\.22\)/);
   assert.match(css, /\.mode-tile\.is-numbers[\s\S]{0,200}?var\(--mode-numbers-fill\)/);
   assert.match(css, /\.mode-tile\.is-chords[\s\S]{0,200}?var\(--mode-chords-fill\)/);
   assert.match(css, /\.mode-tile\.is-chordpro[\s\S]{0,200}?var\(--mode-chordpro-fill\)/);
});

test("mode-mark ink follows its tile in both My Songs and Album detail", () => {
   const css = readProjectFile("styles/ui.css");
   // The shared SVG mark must keep its own mode token. Only the legacy text
   // fallback gets the generic library accent.
   assert.match(
      css,
      /\.cloud-gallery\.library-redesign \.song-card-mode-mark:not\(\.mode-mark\),[\s\S]{0,140}?\.cloud-album\.library-redesign \.song-card-mode-mark:not\(\.mode-mark\) \{[\s\S]{0,120}?color: var\(--library-accent\)/,
   );
   assert.match(css, /\.mode-mark\.is-chords \{[\s\S]{0,80}?color: var\(--mode-chords-ink\)/);
   assert.match(css, /\.mode-mark\.is-numbers \{[\s\S]{0,80}?color: var\(--mode-numbers-ink\)/);
   assert.match(css, /\.mode-mark\.is-chordpro \{[\s\S]{0,80}?color: var\(--mode-chordpro-ink\)/);
   // Both lists render the same coverMarkup → mode-tile + libraryModeIcon.
   const ui = readProjectFile("src/cloudUI.js");
   assert.match(ui, /class="song-card-cover is-motif mode-tile is-\$\{mode\}"/);
   assert.match(ui, /coverMarkup\(song, mode, true\)/);
   assert.match(ui, /albumSongRowMarkup\(song, role\)/);
});

test("a failed thumbnail repaints its cover as the motif (delegated, no inline handlers)", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /document\.addEventListener\(\s*"load"/, "fade-in is a capture-phase document listener");
   assert.match(cloudUI, /document\.addEventListener\(\s*"error"/, "fallback is a capture-phase document listener");
   assert.match(cloudUI, /classList\.add\("is-fallback"\)/);
   assert.match(cloudUI, /img\.hidden = true/, "no broken-image glyph ever shows");
   assert.match(cloudUI, /classList\.add\("is-loaded"\)/, "a decoded photo fades in");
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.song-card-cover\.is-photo\.is-fallback/);
   assert.match(css, /img\.song-card-cover-img\.is-loaded/);
   assert.match(css, /opacity:\s*0/, "the photo starts invisible until decoded");
});

test("the gallery has a real error state with a retry, and load failures reach it", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /id="galleryError"/);
   assert.match(html, /id="galleryRetry"/);
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /\$\("#galleryError"\)\.hidden = state !== "error"/);
   assert.match(cloudUI, /\$\("#galleryRetry"\)\?\.addEventListener\("click", \(\) => refreshSongs\(\)\)/);
   assert.match(cloudUI, /setGalleryState\("error"\)/, "refreshSongs catch lands on error, not empty");
});

test("state icons are inline stroke SVGs, not emoji", () => {
   const html = readProjectFile("index.html");
   const icons = html.match(/<div class="cloud-gallery-state-icon"[^>]*>([\s\S]*?)<\/div>/g) || [];
   assert.ok(icons.length >= 6, `all state icons are SVG (found ${icons.length})`);
   for (const icon of icons) assert.match(icon, /<svg[^>]*stroke="currentColor"/, "SVG with currentColor");
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.ok(!/>♪<|>⌕<|>⚠</.test(cloudUI.replace(/\/\/[^\n]*/g, "")), "no emoji state icons in markup helpers");
});

test("loading skeletons mirror their final layouts without shimmer", () => {
   const html = readProjectFile("index.html");
   const cloudUI = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");

   // Rows reuse the real index-row classes, so their columns/responsive rules
   // cannot drift; albums keep the card frame; the editor keeps the paper.
   assert.match(cloudUI, /song-card library-song-row is-index-row library-skeleton-row/);
   assert.match(cloudUI, /song-card-cover sk-cover/);
   assert.match(cloudUI, /skeleton-card is-album/);
   assert.match(cloudUI, /renderSkeletonRows/);
   assert.match(cloudUI, /renderSkeletonAlbums/);
   assert.match(cloudUI, /aria-busy/);
   assert.match(html, /id="editorSkeleton"/);
   assert.match(html, /id="editorLoadingStatus"/);
   assert.match(html, /id="galleryLoadingStatus"/);
   assert.match(html, /id="albumsLoadingStatus"/);
   assert.match(html, /id="albumLoadingStatus"/);
   assert.match(cloudUI, /function setEditorLoading/);
   assert.match(cloudUI, /function revealEditorLoadingSurface/);
   assert.match(cloudUI, /beginEditorLoading\("Loading song…"\)/);
   assert.match(cloudUI, /setLoadStatus\("galleryLoadingStatus", "Loading your songs…"\)/);
   assert.match(css, /html\[data-editor-loading="1"\] #previewCard,/);

   // Flat tone bars, no shimmer / gradient / entrance animation anywhere.
   assert.ok(!/skeleton-shimmer/.test(css), "the shimmer keyframes are gone");
   const bar = css.slice(css.indexOf(".skeleton-bar {"), css.indexOf(".skeleton-bar {") + 180);
   assert.match(bar, /background:\s*var\(--library-skeleton\)/);
   assert.match(bar, /animation:\s*none/);
   assert.match(css, /--library-skeleton:\s*#dfe7e1/);
   assert.match(css, /--editor-skeleton:\s*#dfe7e1/);
   const row = css.slice(css.indexOf(".library-skeleton-row {"), css.indexOf(".library-skeleton-row {") + 180);
   assert.match(row, /pointer-events:\s*none/);
   const album = css.slice(css.indexOf("#albumsPanel .album-index-grid .skeleton-card.is-album {"));
   assert.match(album.slice(0, 600), /min-height:\s*236px/);

   // Skeleton is a first-class list state, not a hidden spinner.
   assert.match(cloudUI, /list\.hidden = state !== "ready" && state !== "skeleton"/);
});

test("skeleton stays through cold-load filtering and covers every editor mode", () => {
   const html = readProjectFile("index.html");
   const cloudUI = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   const events = readProjectFile("src/events.js");

   // A user filtering while a cold fetch is in flight must not replace the
   // skeleton with "No songs yet". Success clears the skeleton before rendering.
   assert.match(cloudUI, /function applyFilter\(\) \{[\s\S]{0,360}?dataset\.skeleton === "1"[\s\S]{0,240}?return;/);
   assert.match(cloudUI, /function applyAlbumFilter\(\) \{[\s\S]{0,220}?dataset\.skeleton === "1"\) return;/);
   assert.match(cloudUI, /function applyAlbumSongFilter\(\) \{[\s\S]{0,260}?dataset\.skeleton === "1"\) return;/);
   assert.match(cloudUI, /cachedSongs = await listSongs\(\);[\s\S]{0,180}?clearSkeletonTrack\(track\);[\s\S]{0,120}?applyFilter\(\);/);
   assert.match(cloudUI, /cachedAlbums = await listAlbums\(\);[\s\S]{0,180}?clearSkeletonTrack\(grid\);[\s\S]{0,120}?applyAlbumFilter\(\);/);
   assert.match(
      cloudUI,
      /const songs = await listAlbumSongs\(albumId\);[\s\S]{0,180}?cachedAlbumSongs = songs;[\s\S]{0,180}?clearSkeletonTrack\(track\);[\s\S]{0,120}?applyAlbumSongFilter\(\);/,
   );

   // Albums must show their own skeleton immediately, not after songs finish.
   assert.match(cloudUI, /const jobs = \[refreshSongs\(\)\];[\s\S]{0,140}?refreshAlbums\(\)[\s\S]{0,100}?Promise\.all\(jobs\)/);

   // ChordPro hides .preview-stage; the loading sheet has to override that and
   // hide the old ChordPro document while the fetch is running.
   assert.match(css, /\.editor-skeleton-sheet \{[\s\S]{0,420}?min-height:\s*620px[\s\S]{0,300}?border-radius:\s*18px/);
   assert.match(css, /@media screen and \(max-width: 850px\) \{\s*\.editor-skeleton-sheet \{/);
   assert.match(css, /html\[data-editor-loading="1"\] body\[data-editor-mode="chordpro"\] main > \.preview-stage/);
   assert.match(css, /html\[data-editor-loading="1"\] body\[data-editor-mode="chordpro"\] \.cp-workspace/);

   // The paper frame and the desktop live zoom are shared, not duplicated.
   assert.match(css, /--live-preview-zoom/);
   assert.match(events, /setProperty\("--live-preview-zoom"/);

   // Placeholder tones stay skeleton tones even where the real row paints its
   // own cover/chip surfaces.
   assert.match(css, /\.cloud-gallery\.library-redesign \.library-skeleton-row \.song-card-cover/);
   assert.match(css, /\.library-sheet \.song-card\.library-skeleton-row \.song-card-arrangement\.skeleton-bar/);

   // The status sits outside the aria-busy viewport and is controlled by JS.
   assert.match(html, /id="editorLoadingStatus" role="status" hidden/);
   assert.match(cloudUI, /status\.hidden = false/);
   assert.match(cloudUI, /status\.hidden = true/);
   assert.match(cloudUI, /actions\.setAttribute\("inert", ""\)/);
   assert.match(cloudUI, /if \(\$\("#editorSkeleton"\)\) revealEditorLoadingSurface\(\)/);

   // Album skeletons keep the real card's height at both index bands.
   assert.match(css, /min-height:\s*252px/);
   assert.match(css, /min-height:\s*194px/);
});

test("a failed editor load restores the library surface", () => {
   const cloudUI = readProjectFile("src/cloudUI.js");

   assert.match(cloudUI, /Could not open that song[\s\S]{0,240}?navigate\(HOME_ROUTE, \{ replace: true \}\)/);
   assert.match(
      cloudUI,
      /Could not open that song[\s\S]{0,280}?navigate\(`#\/albums\/\$\{encodeURIComponent\(albumId\)\}`, \{ replace: true \}\)/,
   );
});

test("library rows do not animate in and keep restrained interaction feedback", () => {
   const css = readProjectFile("styles/ui.css");
   const start = css.indexOf("LIBRARY REDESIGN — songbook index");
   const end = css.indexOf("@media screen and (max-width: 900px)", start);
   const block = css.slice(start, end);
   assert.match(block, /transition:\s*background-color/);
   assert.match(block, /animation:\s*none/);
   assert.match(block, /\.cloud-gallery\.library-redesign \.song-card:focus-visible/);
   assert.match(block, /\.cloud-gallery\.library-redesign \.song-card-cover::after,[\s\S]*?display:\s*none/);
});

test("row actions stay visible and open through a native details menu", () => {
   const html = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   assert.match(html, /<details class="song-row-menu">/);
   assert.match(html, /<summary class="song-row-menu-trigger"/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-row-menu-items,[\s\S]*?box-shadow:/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card:has\(\.song-row-menu\[open\]\),[\s\S]{0,160}?z-index:\s*30/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card,[\s\S]*?overflow:\s*visible/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-row-menu-trigger:focus-visible/);
});

test("the songbook index uses restrained surfaces and one brand accent", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /--library-accent:\s*#237a50/);
   assert.match(css, /--library-ground:\s*#f2f5f2/);
   assert.match(css, /html\[data-theme="dark"\] \.cloud-gallery\.library-redesign[\s\S]*?--library-ground:\s*#0f1110/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card-cover\.is-motif,[\s\S]*?background:\s*var\(--library-raised\)/);
   assert.match(css, /\.cloud-gallery\.library-redesign,[\s\S]*?font-family: "Sora", "Inter", system-ui, sans-serif !important/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.cloud-gallery-state p,[\s\S]*?font:\s*600 16px/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.mode-tile\.is-numbers[\s\S]*?var\(--mode-numbers-fill\)/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.mode-tile\.is-chords[\s\S]*?var\(--mode-chords-fill\)/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.song-card-chip strong,[\s\S]*?font:\s*700 13px/);
});

// ---- Fermata (hold): data model, playback queue, and the glyph ---------------
// A fermata stores the number of EXTRA beats a note is held before the next beat
// plays. It rides ON the beat value object (section.beats[slot].fermata) so it
// survives copy/paste, clone, transpose and import; it affects PLAYBACK only — the
// score (and the PDF) just draws a glyph.

test("setFermata/fermataValue store a positive extra-beat count and clear cleanly", () => {
   const section = { beats: {} };
   // A fermata on an otherwise-empty beat creates the cell.
   assert.equal(setFermata(section, "0-0", 2), 2);
   assert.equal(fermataValue(section, "0-0"), 2);
   // It clamps to the allowed range and never stores a non-positive value.
   assert.equal(setFermata(section, "0-0", 999), MAX_FERMATA);
   assert.equal(fermataValue(section, "0-0"), MAX_FERMATA);
   // Clearing drops the field AND removes the now-empty cell.
   assert.equal(clearFermata(section, "0-0"), 0);
   assert.equal(fermataValue(section, "0-0"), 0);
   assert.ok(!("0-0" in section.beats), "an empty beat is removed when its fermata is cleared");
   // A beat that still holds a chord survives the clear, minus the fermata.
   section.beats["0-1"] = { chord: "C", duration: null, fermata: 3 };
   clearFermata(section, "0-1");
   assert.deepEqual(section.beats["0-1"], { chord: "C", duration: null });
});

test("normalizeSection keeps and sanitizes the fermata hold", () => {
   const out = normalizeSection(
      {
         name: "Verse",
         bars: 1,
         beats: {
            "0-0": { chord: "1", duration: null, fermata: 2 },
            "0-1": { chord: "4", duration: null, fermata: true }, // true folds to 1
            "0-2": { chord: "5", duration: null, fermata: 0 }, // dropped
            "0-3": { chord: "6", duration: null, fermata: 999 }, // clamped
         },
      },
      "4/4",
   );
   assert.equal(out.beats["0-0"].fermata, 2);
   assert.equal(out.beats["0-1"].fermata, 1);
   assert.ok(!("fermata" in out.beats["0-2"]));
   assert.equal(out.beats["0-3"].fermata, MAX_FERMATA);
});

test("transposeBeats keeps the fermata on the transposed beat", () => {
   const beats = { "0-0": { chord: "C", duration: null, fermata: 3 } };
   const changed = transposeBeats(beats, 2, { key: "D" });
   assert.equal(changed, 1);
   assert.equal(beats["0-0"].chord, "D");
   assert.equal(beats["0-0"].fermata, 3, "the hold rides along with the chord");
});

test("restoreCollapsedBeat keeps a fermata when a rhythm marker is removed", () => {
   const section = { beats: {} };
   restoreCollapsedBeat(section, "0-0", "C", 2);
   assert.deepEqual(section.beats["0-0"], { chord: "C", duration: null, fermata: 2 });
   // A chord-only collapse carries no fermata field.
   restoreCollapsedBeat(section, "0-1", "G", 0);
   assert.deepEqual(section.beats["0-1"], { chord: "G", duration: null });
   // Nothing to keep → the cell is removed.
   restoreCollapsedBeat(section, "0-2", null, 0);
   assert.ok(!("0-2" in section.beats));
   // A fermata with no chord still yields a cell (so the glyph survives).
   restoreCollapsedBeat(section, "0-3", null, 1);
   assert.deepEqual(section.beats["0-3"], { chord: null, duration: null, fermata: 1 });
});

test("beatHTML draws the fermata glyph and its has-fermata hook", () => {
   const section = {
      id: "s1",
      name: "Intro",
      bars: 1,
      lyricsEnabled: false,
      beats: { "0-0": { chord: "C", duration: null, fermata: 2 } },
   };
   const html = beatHTML(section, 0, 0, false, false);
   assert.match(html, /has-fermata/);
   assert.match(html, /class="beat-fermata"/);
   // A plain beat with no fermata carries neither.
   const plain = beatHTML(section, 0, 1, false, false);
   assert.ok(!plain.includes("has-fermata"));
   assert.ok(!plain.includes("beat-fermata"));
});

test("beatHTML draws the fermata glyph on a NESTED ½ leaf", () => {
   const section = {
      id: "s1",
      name: "Intro",
      bars: 1,
      lyricsEnabled: false,
      beats: {
         "0-0": { chord: "5", duration: "half" },
         "0-0:0": { chord: "5", duration: "half" },
         "0-0:0.0": { chord: "5", duration: null, fermata: 1 },
         "0-0:0.1": { chord: "5", duration: null },
         "0-0:1": { chord: "6", duration: null },
      },
   };
   const html = beatHTML(section, 0, 0, false, false);
   // The nested leaf that carries the fermata must render the glyph + hook it was
   // missing before (only the plain/sub beats used to get one).
   assert.match(html, /nested-sub-beat[^"]*has-fermata/);
   assert.equal((html.match(/class="beat-fermata"/g) || []).length, 1);
});

test("the nested ½ fermata is anchored to match the rhythm-½ height (screen + print)", () => {
   const css = readProjectFile("styles/score/preview.css").replace(/\/\*[\s\S]*?\*\//g, "");
   // The base glyph is anchored just above the OWNER's top, so a ½/⅓/¼ sub-beat and
   // a subdivided group (which FILL the lane) lift their fermata to the lane top.
   const base = css.match(/\.beat-fermata \{[\s\S]*?\n\}/)[0];
   assert.match(base, /bottom:\s*calc\(100% \+ 1px\);/);
   // A nested ½ leaf is a SHORT box hugging the lane bottom, so it gets its own
   // lane-height anchor to land at the SAME height as a rhythm-½ fermata.
   assert.match(css, /\.nested-sub-beat\.has-fermata > \.beat-fermata \{\s*bottom:\s*calc\(54px \+ 1px\);/);
   // ...mirrored in BOTH print contexts with the print lane-height token.
   assert.equal((css.match(/var\(--print-notation-h\) \+ 1px/g) || []).length, 2);
});

test("sectionHasFermata detects a fermata anywhere in the section", () => {
   assert.equal(sectionHasFermata({ beats: {} }), false);
   assert.equal(sectionHasFermata({ beats: { "0-0": { chord: "1", duration: null } } }), false);
   assert.equal(sectionHasFermata({ beats: { "0-0": { chord: "1", duration: null, fermata: 0 } } }), false);
   assert.equal(sectionHasFermata({ beats: { "0-0": { chord: "1", duration: null, fermata: 2 } } }), true);
   assert.equal(sectionHasFermata({ beats: { "0-1:0.0": { chord: "5", duration: null, fermata: 1 } } }), true);
});

test("a fermata section that shows its chord row gets extra top room (screen + print)", () => {
   // render.js tags the section so the CSS can add the clearance.
   const render = readProjectFile("src/render/render.js");
   assert.match(render, /sectionFermata = sectionHasFermata\(section\)/);
   assert.match(render, /sectionFermata \? " has-fermata" : ""/);
   const css = readProjectFile("styles/score/preview.css").replace(/\/\*[\s\S]*?\*\//g, "");
   // Screen: a bigger chord-row gap for fermata sections.
   assert.match(
      css,
      /\.preview-section\.has-fermata \.beat-column\.with-chord-above \{\s*row-gap:\s*calc\(var\(--chord-above-gap, 24px\) \+ 16px\);/,
   );
   // Print (both contexts): push the printed line down AND lift the chord row by the
   // SAME amount, so only the gap between the chord row and the lane grows.
   assert.equal((css.match(/margin-top:\s*calc\(var\(--print-chord-above-line-gap\) \+ 6mm\)/g) || []).length, 2);
   assert.equal((css.match(/top:\s*calc\(-1 \* var\(--print-chord-above-row\) - 6mm\)/g) || []).length, 2);
});

test("buildPlaybackQueue attaches the fermata hold (once, on a subdivided beat's last leaf)", () => {
   const section = {
      id: "s1",
      bars: 1,
      beats: {
         "0-0": { chord: "1", duration: null, fermata: 2 },
         "0-2": { chord: "5", duration: "quarter", fermata: 3 },
         "0-2:0": { chord: "5", duration: null },
         "0-2:1": { chord: "5", duration: null },
         "0-2:2": { chord: "5", duration: null },
         "0-2:3": { chord: "5", duration: null },
      },
   };
   const queue = buildPlaybackQueue([section], 4);
   assert.equal(queue.find((entry) => entry.slot === "0-0").fermata, 2);
   // The subdivided beat holds ONCE, on its last leaf (0-2:3), never per child.
   assert.equal(queue.find((e) => e.slot === "0-2:0").fermata, undefined);
   assert.equal(queue.find((e) => e.slot === "0-2:3").fermata, 3);
   // A beat with no fermata stays clean.
   assert.equal(queue.find((e) => e.slot === "0-1").fermata, undefined);
});

test("buildPlaybackQueue keeps one entry per bar in 1/4", () => {
   const section = {
      id: "pickup",
      bars: 3,
      beats: {
         "0-0": { chord: "C", duration: null },
         "1-0": { chord: "G", duration: null },
         "2-0": { chord: "Am", duration: null },
      },
   };
   const queue = buildPlaybackQueue([section], 1);
   assert.deepEqual(
      queue.map((entry) => entry.slot),
      ["0-0", "1-0", "2-0"],
   );
});

test("entryDuration adds the fermata hold on top of the written length", () => {
   // 120 bpm → one beat = 0.5s. A plain beat without a fermata is 0.5s.
   assert.equal(entryDuration({ beatUnit: 1 }, 120), 0.5);
   // A fermata of 2 extra beats → 0.5 + 2*0.5 = 1.5s.
   assert.equal(entryDuration({ beatUnit: 1, fermata: 2 }, 120), 1.5);
   // A half-beat subdivision (beatUnit 0.5) with a 1-beat hold → 0.25 + 0.5 = 0.75s.
   assert.equal(entryDuration({ beatUnit: 0.5, fermata: 1 }, 120), 0.75);
   // Default bpm (120) when none is given.
   assert.equal(entryDuration({ fermata: 1 }), 1.0);
});

test("fermataPulseTimes marks every held beat so the pause keeps time", () => {
   // No fermata → no pulses.
   assert.deepEqual(fermataPulseTimes({ beatUnit: 1 }, 120), []);
   // One held beat on a plain beat: the click lands one beat after the onset.
   assert.deepEqual(fermataPulseTimes({ beatUnit: 1, fermata: 1 }, 120), [0.5]);
   // Two held beats → a click on each held-beat boundary (still 1 beat from the next entry).
   assert.deepEqual(fermataPulseTimes({ beatUnit: 1, fermata: 2 }, 120), [0.5, 1.0]);
   // A subdivided beat keeps the hold relative to its own (shorter) written length.
   assert.deepEqual(fermataPulseTimes({ beatUnit: 0.5, fermata: 1 }, 120), [0.25]);
   // bpm drives the spacing: 60 bpm → one beat = 1s.
   assert.deepEqual(fermataPulseTimes({ beatUnit: 1, fermata: 1 }, 60), [1]);
});


// ================= Home pass 2 — the other My Songs / Albums components ====

test("library and dialog UI use the bundled Sora face, retaining mono for codes", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign,[\s\S]*?font-family: "Sora", "Inter", system-ui, sans-serif !important/);
   assert.match(css, /\.confirm-dialog code, \.invite-code-value, \.album-code-input[\s\S]*?font-family: var\(--mono/);
   assert.match(css, /html\[data-theme="dark"\] \.confirm-dialog-desc\s*\{\s*color: #b6c0b8/);
});

test("album detail keeps its typographic identity without a fake cover", () => {
   const html = readProjectFile("index.html");
   const css = readProjectFile("styles/ui.css");
   const ui = readProjectFile("src/cloudUI.js");
   assert.match(html, /class="cloud-album-hero" aria-hidden="true"><span id="albumHeroGlyph"/);
   assert.match(html, /id="albumDescription"/);
   assert.match(ui, /albumHeroGlyph/);
   assert.match(css, /\.cloud-album\.library-redesign \.cloud-album-hero\s*\{[\s\S]*?background:\s*transparent/);
   assert.match(css, /\.cloud-album\.library-redesign \.cloud-album-description/);
});

test("the album header actions are inline stroke SVGs", () => {
   const html = readProjectFile("index.html");
   for (const id of ["albumInviteBtn", "albumMembersBtn", "albumAddFromBtn", "albumNewSongBtn", "albumLeaveBtn"]) {
      const btn = html.match(new RegExp(`id="${id}"[\\s\\S]*?</button>`))[0];
      assert.match(btn, /<svg[^>]*stroke="currentColor"/, `${id} uses an SVG glyph`);
      assert.doesNotMatch(btn, /class="btn-icon" aria-hidden="true">[^<]/, `${id} carries no emoji`);
   }
});

test("the join code field formats itself into XXXX-XXXX as you type", () => {
   const ui = readProjectFile("src/cloudUI.js");
   assert.match(ui, /\$\("#joinAlbumCode"\)\?\.addEventListener\("input"/);
   assert.match(ui, /toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ""\)\.slice\(0, 8\)/);
   assert.match(ui, /token\.slice\(0, 4\)\}-\$\{token\.slice\(4\)/);
   // Typing clears a stale error state.
   assert.match(ui, /input\.classList\.remove\("is-invalid"\)/);
});

test("the invite code reads as code: mono voice, tabular figures", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.invite-code-value \{[^}]*font-variant-numeric: tabular-nums;/);
   assert.match(css, /\.album-code-input \{[^}]*font-variant-numeric: tabular-nums;/);
   assert.match(css, /\.invite-code-value \{[^}]*font-family: var\(--mono/);
});

test("copying the invite code confirms in place with a Copied flash", () => {
   const ui = readProjectFile("src/cloudUI.js");
   const css = readProjectFile("styles/ui.css");
   assert.match(ui, /flashInviteCopied\(\)/);
   assert.match(ui, /inviteCopyTimer = setTimeout\(/);
   assert.match(css, /#inviteCodeCopy\.is-copied \{/);
});

test("the profile menu keeps sign-out and the theme toggle lives in the topbar", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /id="accountBtn"[^>]*aria-controls="accountPopover"/);
   assert.match(html, /class="topbar-theme-toggle"[\s\S]*?id="themeToggle"/);
   assert.ok(!html.includes('class="account-popover-item theme-toggle"'), "the theme action is not buried in the profile menu");
   assert.match(html, /id="signOutBtn"[^>]*role="menuitem"/);
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover\s*\{[\s\S]*?box-shadow:/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover-item\.is-signout/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-button:not\(\.is-authed\) \.account-label\s*\{\s*display: inline !important/);
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /btn\.setAttribute\("aria-label", `Account menu for/);
   assert.match(cloudUI, /signOutButton\.setAttribute\("aria-busy", "true"\)/);
   assert.match(cloudUI, /confirmLabel: "Sign out"/);
});

test("library dialogs label inputs and preserve creation and import actions", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /for="newSongVersionName"/);
   assert.match(html, /id="newSongCreateBtn"[^>]*>Create song/);
   assert.match(html, /for="attachLinkInput"/);
   assert.match(html, /id="attachLinkPrivacy"/);
   assert.match(html, /for="joinAlbumCode">Invite code/);
   assert.match(html, /class="confirm-dialog library-dialog new-album-dialog" id="newAlbumDialog"/);
   assert.match(html, /class="confirm-dialog library-dialog join-album-dialog" id="joinAlbumDialog"/);
   assert.match(html, /id="addSongList" role="radiogroup"/);
   assert.match(html, /id="addSongLoading"/);
   assert.match(html, /id="addSongError"/);
   assert.match(html, /id="addSongRetry"/);
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(cloudUI, /confirmBtn\.disabled = true/);
   assert.match(cloudUI, /confirmBtn\.disabled = !\(input\?\.value \|\| ""\)\.trim\(\)/);
   assert.match(cloudUI, /signOutButton\.textContent = "Signing out…"/);
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.library-dialog \.library-dialog-actions\s*\{[\s\S]*?position:\s*sticky/);
});

test("library dialogs share one framed surface with restrained motion", () => {
   const html = readProjectFile("index.html");
   const css = readProjectFile("styles/ui.css");
   // The video filter adopts the red library media mark, not a bare glyph.
   assert.match(html, /class="library-filter-option-mark is-video"[\s\S]{0,220}?<rect x="3" y="5" width="18" height="14"/);
   assert.match(css, /\.library-filter-option-mark\.is-video \{[\s\S]*?color: var\(--library-danger\)/);
   // Attach Link explains the flow and keeps the privacy note inside a themed field.
   assert.match(html, /class="attach-link-steps"/);
   assert.match(html, /class="attach-link-paste"/);
   assert.match(html, /attach-link-privacy-icon/);
   // The mode previews use the shared mode palette and animate only on open.
   assert.match(html, /class="mode-card mode-card-chords"/);
   assert.match(html, /class="mode-card mode-card-numbers"/);
   assert.match(html, /class="mode-card mode-card-chordpro"/);
   assert.match(css, /@keyframes modeTokenIn/);
   assert.match(css, /@keyframes modeChordProSweep/);
   assert.match(css, /\.mode-picker-dialog\.is-open \.mode-preview-token/);
   // The help dialog has its own scroll region and per-topic entrance.
   assert.match(html, /id="howtoTopicList"/);
   assert.match(css, /@keyframes howtoItemIn/);
   assert.match(css, /#howToDialog\.is-open \.howto-item/);
   // Confirmation dialogs share the library tokens and mark destructive actions.
   assert.match(html, /class="confirm-dialog library-dialog" id="confirmDialog"/);
   assert.match(html, /class="confirm-dialog-head"/);
   assert.match(css, /#confirmDialog\.is-danger \.confirm-dialog-icon/);
   assert.match(css, /#confirmDialog\.is-open \.confirm-dialog-icon svg/);
   assert.match(css, /#confirmDialog \.confirm-dialog-actions \.button\.is-danger \{[\s\S]*?background: #b42318/);
   // Members expose loading and summary states.
   const cloudUI = readProjectFile("src/cloudUI.js");
   assert.match(html, /id="memberDialogSummary"/);
   assert.match(css, /\.member-list-state/);
   assert.match(css, /@keyframes memberSpin/);
   assert.match(cloudUI, /list\.setAttribute\("aria-busy", "true"\)/);
   assert.match(cloudUI, /member-list-state/);
   assert.match(cloudUI, /else if \(!\$\("#albumMembersDialog"\)\?\.hidden\) closeMembersDialog\(\);/);
});

test("profile identity and album member identity retain readable initials", () => {
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.member-avatar \{[^}]*font-family: "Sora"/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover-who strong/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-popover-avatar/);
   assert.match(css, /\.cloud-gallery\.library-redesign \.account-button:not\(\.is-authed\) \.account-avatar\s*\{\s*display:\s*none/);
});

test("dialogs never reach paper: confirm dialogs join the print hide list", () => {
   const css = readProjectFile("styles/ui.css");
   // The first "@media print" occurrence is a header-comment mention; anchor on
   // the real block opener instead.
   const at = css.indexOf("@media print {");
   const block = css.slice(at, at + 900);
   assert.match(block, /\.cloud-modal,/, "the print hide list is where we expect it");
   assert.match(block, /\.confirm-dialog \{/, "confirm dialogs are hidden in print");
   assert.match(block, /display: none !important;/);
});

test("nextSectionName skips names already used by a mid-song insertion", () => {
   assert.equal(nextSectionName([]), "Section 1");
   assert.equal(nextSectionName([{ name: "Intro" }, { name: "Verse" }]), "Section 3");
   assert.equal(
      nextSectionName([{ name: "Intro" }, { name: "Section 3" }]),
      "Section 4",
      "array length alone would collide with an existing Section 3",
   );
   assert.equal(
      nextSectionName([{ name: "Section 1" }, { name: "Section 2" }, { name: "Section 3" }]),
      "Section 4",
   );
});

test("the editor can insert a section after any section, with read-only guards", () => {
   const render = readProjectFile("src/render/render.js");
   const events = readProjectFile("src/events.js");
   const css = readProjectFile("styles/ui.css");
   assert.match(render, /class="text-button add-section"[\s\S]{0,180}data-section="\$\{section\.id\}"/);
   assert.doesNotMatch(render, /data-play-section|section-play/, "playback is centralized in the topbar");
   assert.match(events, /function insertSectionAfter\(sectionId\) \{\s*if \(blockedForEdit\(\)\) return;/);
   assert.match(events, /state\.sections\.splice\(index \+ 1, 0, section\)/);
   assert.match(events, /nextSectionName\(state\.sections\)/);
   assert.match(events, /\.add-section/);
   assert.match(css, /body\[data-member-readonly="1"\] \.add-section/);
   assert.match(css, /body\[data-view-only="1"\] \.add-section/);
   const playback = readProjectFile("src/playback/playback.js");
   assert.match(playback, /buildPlaybackQueue\(state\.sections, beatsPerBar \|\| 4, \{ fromSectionId \}\)/);
   assert.match(playback, /export async function startPlayback\(\{ fromSectionId = null/);
});

test("the topbar owns the play + BPM transport and the sheet does not", () => {
   const html = readProjectFile("index.html");
   const topbar = html.slice(html.indexOf('<div class="topbar-actions">'), html.indexOf("</header>"));
   const preview = html.slice(html.indexOf('id="previewCard"'), html.indexOf("</section>", html.indexOf('id="previewCard"')));
   assert.match(topbar, /class="transport-control"/);
   assert.match(topbar, /id="playBtn"/);
   assert.match(topbar, /id="bpmInput"/);
   assert.doesNotMatch(preview, /id="playBtn"|id="bpmInput"/, "transport must not print with the sheet");
   const css = readProjectFile("styles/ui.css");
   assert.match(css, /\.transport-control \{/);
   assert.match(css, /\.transport-play \.transport-icon-stop \{\s*display: none;/);
   assert.match(css, /\.transport-play\.is-playing \.transport-icon-stop/);
   assert.match(html, /transport-icon-stop/);
   assert.match(readProjectFile("src/events.js"), /playing \? "Stop playback" : "Play from selected section"/);
   assert.doesNotMatch(css, /\.section-play \{/, "no section-level play control");
   assert.doesNotMatch(html, /data-play-section/);
});

test("the test-mode auth bypass is local-only", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /const localHost = \["localhost", "127\.0\.0\.1", "::1"\]\.includes\(location\.hostname\);/);
   assert.match(html, /const testMode = localHost && params\.has\("test"\);/);
   assert.match(html, /document\.documentElement\.dataset\.testMode = testMode \? "1" : "0";/);

   const controller = readProjectFile("src/cloud/ui/controller.js");
   assert.match(controller, /const TEST_MODE = document\.documentElement\.dataset\.testMode === "1";/);
   assert.doesNotMatch(controller, /new URLSearchParams\(location\.search\)\.has\("test"\)/);
});

test("PDF preview zoom is anchored to one page and ignores pageCount", () => {
   // 54% is the one-page height fit at this pane size. The same call must stay
   // 54% after the content grows to a second page — the old code dropped the
   // height constraint when pageCount > 1 and jumped to the width fit (~98%).
   const pane = { availableW: 700, availableH: 600, naturalWidth: 794, onePageHeight: 1123 };
   const scale = computePreviewScale(pane);
   assert.ok(Math.abs(scale - 600 / 1123) < 1e-9, `unexpected scale ${scale}`);
   assert.equal(computePreviewScale({ ...pane, availableW: 900 }), scale, "page count is not an input");
   // Width fit wins when the pane is short and wide; clamp keeps it sane.
   assert.equal(computePreviewScale({ availableW: 300, availableH: 600, naturalWidth: 794, onePageHeight: 1123 }), 300 / 794);
   assert.equal(computePreviewScale({ availableW: 10, availableH: 10, naturalWidth: 794, onePageHeight: 1123 }), 0.2);
   assert.equal(computePreviewScale({ availableW: 5000, availableH: 5000, naturalWidth: 794, onePageHeight: 1123 }), 1);
   const options = readProjectFile("src/pdf/pdfOptions.js");
   assert.match(options, /const scale = computePreviewScale\(\{/);
   assert.doesNotMatch(options, /pageCount === 1 && availableH > 0/, "page count must not gate the height fit");
});
