import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
   editorModeMeta,
   normalizeEditorMode,
} from "../src/notation.js";
import { encodeShare, decodeShare, buildShareLink, extractPayloadFromLink, canCompress } from "../src/share.js";
import {
   composeSong,
   isLegacySongDoc,
   generateInviteCode,
   normalizeInviteCode,
   versionCopyPayload,
} from "../src/cloud.js";
import { friendlyName } from "../src/identity.js";
import { parseYoutubeUrl, canonicalUrl, thumbnailUrl, youtubeFields, parseStartTime, formatStartTime, youtubeChipMeta } from "../src/youtube.js";
import { beatHTML, chordProSectionHTML } from "../src/render.js";
import { isValidChordSpelling, withTypedSpelling } from "../src/chordEditor.js";
import {
   PDF_BAR_NUMBERS,
   defaultPdfOptions,
   sanitize,
   applyPdfOptions,
} from "../src/pdfOptions.js";
import { getState, setState } from "../src/store.js";
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
} from "../src/chordPro.js";

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
   const notation = readProjectFile("src/notation.js");
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
   assert.equal(safeFileName(""), "worship-notation-score");
   assert.equal(safeFileName("///"), "worship-notation-score");
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
} from "../src/chordBank.js";

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

test("suggestChords offers Nashville octave variants for a bare degree", () => {
   const out = suggestChords("1");
   assert.equal(out[0], "1"); // base degree first
   assert.ok(out.includes("1\u0307")); // octave-high 1̇
   assert.ok(out.includes("1\u0323")); // octave-low 1̣
   assert.ok(out.some((value) => value === "1°" || value === "1m")); // quality colours present
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
} from "../src/notation.js?v=20260808-hide-dot-active";

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
   assert.match(html, /🎬<\/span> No video/);
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
   const render = readProjectFile("src/render.js");
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
   assert.match(html, /<h3 class="mode-card-title">Numeric Notation \+ Lyrics<\/h3>/);
   assert.match(html, /id="modeCardNumbers" type="button" data-mode="numbers"/);
   assert.match(html, /Lyrics row — optional \(Lyrics toggle\)/);
   assert.match(html, /Numeric Notation \+ Lyrics<\/strong>/);
   assert.ok(!/Nashville Numbers/.test(html), "the old mode label must be gone");
   assert.match(readProjectFile("README.md"), /\*\*Numeric Notation \+ Lyrics\*\*/);
});

test("normalizeEditorMode accepts the three modes and falls back to chords", () => {
   assert.equal(normalizeEditorMode("chordpro"), "chordpro");
   assert.equal(normalizeEditorMode("numbers"), "numbers");
   assert.equal(normalizeEditorMode("chords"), "chords");
   // Legacy projects have no editorMode at all — they must stay Chord Chart.
   for (const bad of [undefined, null, "", "Chords", "CHORDPRO", "nashville", 0, {}, []]) {
      assert.equal(normalizeEditorMode(bad), "chords", `expected chords for ${JSON.stringify(bad)}`);
   }
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
const readProjectFile = (relative) => readFileSync(join(projectRoot, relative), "utf8");

test("ChordPro workspace: every id used by chordProEditor.js exists in index.html", () => {
   const ids = new Set([...readProjectFile("index.html").matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
   const used = [...readProjectFile("src/chordProEditor.js").matchAll(/\$\("#([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
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
   for (const file of ["src/render.js", "src/events.js", "src/pdfOptions.js"]) {
      const used = [...readProjectFile(file).matchAll(/\$\("#([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
      for (const id of used) {
         if (legacyOptional.has(id)) continue;
         assert.ok(ids.has(id), `#${id} is used by ${file} but missing from index.html`);
      }
   }
});

test("index.html ships the ChordPro workspace, its stylesheet and the third mode card", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /styles\/chordpro\.css\?v=/);
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

test("service worker precaches every new ChordPro asset", () => {
   const sw = readProjectFile("sw.js");
   for (const asset of ["./styles/chordpro.css", "./src/chordPro.js", "./src/chordProEditor.js"]) {
      assert.ok(sw.includes(asset), `${asset} is missing from CORE_ASSETS`);
   }
});

test("every relative ES module import resolves to a file on disk", () => {
   const files = readdirSync(join(projectRoot, "src")).filter((name) => name.endsWith(".js"));
   for (const file of files) {
      for (const match of readProjectFile(`src/${file}`).matchAll(/from "(\.\/[^"?]+\.js)/g)) {
         const target = match[1].replace("./", "");
         assert.ok(files.includes(target), `src/${file} imports ${match[1]}, which does not exist`);
      }
   }
});

test("every asset version query matches the service worker's ASSET_VERSION", () => {
   const version = readProjectFile("sw.js").match(/const ASSET_VERSION = "([^"]+)"/)?.[1];
   assert.ok(version, "ASSET_VERSION not found in sw.js");
   const files = ["index.html", ...readdirSync(join(projectRoot, "src")).map((name) => `src/${name}`)];
   const mismatches = [];
   for (const file of files) {
      for (const match of readProjectFile(file).matchAll(/\?v=([A-Za-z0-9._-]+)/g)) {
         if (match[1] !== version) mismatches.push(`${file} → ${match[1]}`);
      }
   }
   assert.deepEqual(mismatches, [], `cache-buster drift vs ASSET_VERSION ${version}`);
});

test("chordpro.css keeps the two original modes untouched (no grid selectors, all cp- or gated)", () => {
   // Comments are stripped first: the file *documents* the names it must avoid.
   const css = readProjectFile("styles/chordpro.css").replace(/\/\*[\s\S]*?\*\//g, "");
   // Nothing may restyle the grid score: those class names belong to ui.css/preview.css.
   for (const forbidden of [".preview-card", ".preview-section", ".bar-grid", ".placed-chord", ".lyric-input", ".section-tools"]) {
      assert.ok(!css.includes(forbidden), `chordpro.css must not style ${forbidden}`);
   }
   // Every selector line must be cp-prefixed, gated to ChordPro mode, or one of the
   // documented shared selectors below:
   //   • .mode-picker-card / .mode-picker-grid — the New Song dialog now shows three
   //     cards, which needs a wider dialog + a 3-column grid (layout only; the two
   //     original cards keep their own styling in ui.css);
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

test("the ChordPro mode card is a normal card (no full-width span)", () => {
   const css = readProjectFile("styles/chordpro.css");
   assert.ok(!css.includes("grid-column: 1 / -1"), "the mode card must not span the whole grid");
   assert.ok(!css.includes("grid-column: 1/-1"));
   // Three equal cards in one row on wide screens.
   assert.match(css, /\.mode-picker-grid\s*\{[^}]*repeat\(3, 1fr\)/);
});

test("the ChordPro library card uses the dark-gold accent", () => {
   const css = readProjectFile("styles/chordpro.css");
   assert.match(css, /\.song-card\.is-chordpro\s*\{[^}]*background:\s*#fbf3df/);
   assert.match(css, /\.song-card\.is-chordpro \.song-card-mode-mark\s*\{[^}]*color:\s*#8a6a10/);
   assert.match(css, /html\[data-theme="dark"\] \.song-card\.is-chordpro\s*\{[^}]*background:\s*#2a2415/);
});

test("the ChordPro editor has no chord palette / drag-and-drop UI", () => {
   const html = readProjectFile("index.html");
   const source = readProjectFile("src/chordProEditor.js");
   for (const gone of ["cp-palette", "cpRootPicker", "cpChordBank", "cp-snippet"]) {
      assert.ok(!html.includes(gone), `index.html still contains ${gone}`);
      assert.ok(!source.includes(gone), `chordProEditor.js still references ${gone}`);
   }
   // The palette CSS must be gone too.
   const css = readProjectFile("styles/chordpro.css");
   for (const gone of [".cp-palette", ".cp-root", ".cp-chord-btn", ".cp-snippet"]) {
      assert.ok(!css.includes(gone), `chordpro.css still styles ${gone}`);
   }
});

test("ChordPro mode takes the beat-grid workspace out of the page", () => {
   // The structural swap lives INLINE in index.html (not in chordpro.css alone):
   // preview.css sets `.ribbon-workspace { display: block }` and styles.css
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
   const render = readProjectFile("src/render.js");
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
   const cssVersion = readProjectFile("styles/chordpro.css").match(/--chordpro-css-version:\s*([^\s;]+)/)?.[1];
   const jsVersion = readProjectFile("src/render.js").match(/CHORDPRO_CSS_VERSION = "([^"]+)"/)?.[1];
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
   // Manual escape hatch + the harness opt-out that keeps ?test= cache-free.
   assert.match(html, /params\.has\("reset"\) \|\| params\.has\("fresh"\)/);
   assert.match(html, /if \(params\.has\("test"\)\) return;/);
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
      /const NETWORK_FIRST_PATHS = \["\/", "\/index\.html", "\/styles\/styles\.css", "\/manifest\.webmanifest"\];/,
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
   assert.match(readProjectFile("styles/chordpro.css"), /\.cp-word\.is-chord-only \{[^}]*padding-right: 0\.5em/);
});

test("ChordPro PDF fonts scale up from the shared print tokens", () => {
   const css = readProjectFile("styles/chordpro.css");
   // Bigger defaults, still driven by the PDF-options tokens so the sliders work.
   assert.match(css, /--cp-chord-size: calc\(var\(--print-chord-size, 4\.3mm\) \* 1\.25\)/);
   assert.match(css, /--cp-lyric-size: calc\(var\(--print-lyric-size, 3\.2mm\) \* 1\.35\)/);
   assert.match(css, /\.cp-chord \{[^}]*font-size: var\(--cp-chord-size/);
   assert.match(css, /\.cp-lyric \{[^}]*font-size: var\(--cp-lyric-size/);
});

test("ChordPro print geometry matches the Chord Chart export", () => {
   const css = readProjectFile("styles/chordpro.css");
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
   const css = readProjectFile("styles/chordpro.css");
   assert.match(css, /\.cp-editor-foot \{[^}]*flex-direction: row/);
   assert.match(css, /\.cp-editor-foot \.cp-text-btn\.is-strong \{[^}]*flex: none/);
});

// ---- New Song dialog head, bigger mode-card visual, LIVE PREVIEW label ----

test("the New Song dialog uses the shared icon-left / text-right head", () => {
   const html = readProjectFile("index.html");
   // Anchored right after this dialog's close button so the match can't drift to
   // one of the version dialogs (which share the same .vd-dialog-head classes).
   const head = html.match(/id="newSongClose"[\s\S]*?<div class="vd-dialog-head">([\s\S]*?)<\/div>\s*<\/div>/);
   assert.ok(head, "the mode picker must use the .vd-dialog-head layout");
   assert.match(head[1], /class="confirm-dialog-icon"/);
   assert.match(head[1], /class="vd-dialog-head-text"/);
   assert.match(head[1], /id="newSongTitle"/);
   assert.match(head[1], /id="newSongDesc"/);
   // Icon first (left), text column second (right).
   assert.ok(head[1].indexOf('class="confirm-dialog-icon"') < head[1].indexOf('class="vd-dialog-head-text"'));
   // The flat (icon above title) variant must be gone.
   assert.ok(!/id="newSongClose"[\s\S]{0,200}<h2/.test(html), "title must sit inside the head text column");
});

test("the ChordPro mode-card visual is large enough to read", () => {
   const css = readProjectFile("styles/chordpro.css");
   assert.match(css, /\.cp-mca-chord \{[^}]*font-size: 22px/);
   assert.match(css, /\.cp-mca-word \{[^}]*font-size: 16px/);
   assert.match(css, /\.cp-mode-anim \{[^}]*gap: 0 12px/);
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
// Real print geometry needs a browser (see tests/regression.mjs), so the print
// contract is pinned here at the CSS level: the live input is swapped for the
// rendered chord token in BOTH print scopes, the reserved track is decided by the
// SECTION class (never by bar data, so every bar keeps the same height and the
// barlines stay aligned), and the editor-only chrome for the row can't reach paper.
test("the chord row above the numbers prints as a chord and never prints chrome", () => {
   const preview = readProjectFile("styles/preview.css");
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
   // The per-bar toggle is editor chrome: it lives inside .bar-tools, which both
   // print scopes hide.
   assert.match(ui, /\.chord-above-bar-toggle \{/);
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
   const css = readProjectFile("styles/preview.css");
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

test("the help dialog and README document the chord row above the numbers", () => {
   const html = readProjectFile("index.html");
   const dialog = html.match(/id="howToDialog"[\s\S]*?<\/ul>/);
   assert.ok(dialog, "the help dialog must exist");
   assert.match(dialog[0], /Chords above the numbers/);
   assert.match(dialog[0], /Chords On\/Off/);
   assert.match(dialog[0], /♪<\/strong> button in a bar/);
   // The ••• menu keeps copy/paste/delete only: the bulk "Chord row: all bars / no bars"
   // entries were deliberately removed, so the ♪ button is the ONLY per-bar control.
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
   assert.match(readme, /\| Bar \|[\s\S]{0,220}?♪/);
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
   assert.match(readProjectFile("src/render.js"), /bar-batch[^`]*has-chord-above/);
   // ...and the stylesheet must NOT pin --leaf for those bars (the shrink bug).
   assert.ok(
      !/\.bar\.has-chord-above \{\s*--leaf:/.test(readProjectFile("styles/preview.css")),
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
   const preview = readProjectFile("styles/preview.css").replace(/\s+/g, " ");
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
   // The LINE density numbers only the bar that starts a printed row; src/pdf.js tags every
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
      6,
      "line density: show + hide + band, in both print scopes",
   );
   assert.equal(
      (preview.match(/data-pdf-bar-numbers="every"\] body\[data-editor-mode="chords"\]/g) || []).length,
      6,
      "every-bar density: show + size override + band, in both print scopes",
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
   // The line-starts density needs `.pdf-mid-bar`, which only markMidRowBars() (src/pdf.js) sets.
   // All three surfaces call it: the real print job (beforeprint), the PDF-options pane, and the
   // manual "PDF layout" preview — otherwise a preview would number every bar while the PDF
   // numbers only the line starts.
   const pdf = readProjectFile("src/pdf.js");
   assert.match(pdf, /const MID_BAR_CLASS = "pdf-mid-bar";/);
   assert.match(pdf, /markMidRowBars\(\{ forExport: true \}\);/);
   const options = readProjectFile("src/pdfOptions.js");
   assert.match(options, /markMidRowBars\(\);/);
   assert.match(
      options,
      /if \(previewWasOn && typeof isPreviewOn === "function" && isPreviewOn\(\)\) markMidRowBars\(\);/,
      "closing the dialog must re-tag when the user's own layout preview stays on",
   );
   const events = readProjectFile("src/events.js");
   assert.match(events, /import \{[^}]*markMidRowBars[^}]*\} from "\.\/pdf\.js/);
   assert.match(events, /if \(printLayoutPreview\) requestAnimationFrame\(\(\) => markMidRowBars\(\)\);/);
   assert.match(events, /else clearMidRowBars\(\);/);
});

test("the live PDF preview shows exactly the bar numbers the PDF will print", () => {
   // The dialog moves the LIVE #previewCard into .pdf-preview-page, so its own rule only HIDES the
   // editor's faint 10px/0.34 numbers. The stamp itself comes from the shared
   // html.is-print-layout rules in preview.css (active in the pane too, opening the dialog turns
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
   const preview = readProjectFile("styles/preview.css");
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
   const options = readProjectFile("src/pdfOptions.js");
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
test("bar numbers are a Chord Chart-only option (Numbers/ChordPro never get them)", () => {
   const html = readProjectFile("index.html");
   assert.match(html, /<div class="pdf-field-divider" id="pdfBarsDivider">/);
   assert.match(html, /<section class="pdf-field" id="pdfBarNumField">/);
   const options = readProjectFile("src/pdfOptions.js");
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
      readProjectFile("src/events.js"),
      /barNumbersAvailable: \(\) => normalizeEditorMode\(getState\(\)\.editorMode\) === "chords",/,
   );
   // `hidden` must beat the flex layouts of .pdf-field / .pdf-field-divider, and the dialog pane
   // must NOT redeclare the stamp: one definition (preview.css) covers paper AND pane.
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
   const css = readProjectFile("styles/chordpro.css");
   assert.match(css, /\.cp-stage-title \{[^}]*font-size: 13px[^}]*font-weight: 800/);
   assert.match(css, /\.cp-stage-hint \{[^}]*font-size: 12\.5px[^}]*font-weight: 700/);
   // The bar lives in the card's column and lines up with the card's content edge.
   assert.match(css, /\.cp-stage-bar \{[^}]*max-width: 210mm[^}]*margin: 0 auto[^}]*padding: 0 2px 0 var\(--cp-card-pad-x/);
   assert.match(css, /\.cp-stage \{[^}]*--cp-card-pad-x: 10mm/);
   assert.match(css, /\.cp-card \{[\s\S]*?padding: var\(--cp-card-pad-y, 12mm\) var\(--cp-card-pad-x, 10mm\)/);
});

