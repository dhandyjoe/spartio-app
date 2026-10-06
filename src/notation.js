// notation.js — pure music/notation + section-data logic. No DOM access; safe to unit test in Node.

// ---- Naming: the sharp-vs-flat spelling standard ---------------------------
//
// Chord charts are READ by players, so a transposed chord must be spelled the way a musician
// expects to see it. Three rules (implemented by transposeKeyName / spellPitch /
// degreeSpelling below):
//   1. the KEY decides the side — a sharp key writes F♯/C♯/G♯, a flat key writes G♭/D♭/A♭.
//      Transposition moves INTERVALS, so the result has to fit the target key signature:
//      in D major the third of D is F♯, never G♭.
//   2. pitch classes OUTSIDE that key use READABLE_CHROMATIC (C♯/E♭/F♯/A♭/B♭ — a player never
//      expects to read D♯, G♯ or A♯ unless the key itself asks for them).
//   3. a slash bass that is a chord tone follows the chord's DEGREE (D/F♯, A/C♯, B/D♯, C/E).
// Unreadable names (C♭/F♭/E♯/B♯ and double accidentals) always fall back to rule 2.
export const KEY_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const KEY_NAMES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export const READABLE_CHROMATIC = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
// Accidentals in each key signature — used to pick the name that needs the fewest.
const KEY_ACCIDENTALS_SHARP = [0, 7, 2, 9, 4, 1, 6, 1, 8, 3, 10, 5];
const KEY_ACCIDENTALS_FLAT = [0, 5, 2, 3, 4, 1, 6, 1, 4, 3, 2, 5];
// Every key name the app offers/stores — both enharmonics, so a chart may live in F♯ or G♭.
export const keyNames = [
   "C",
   "C♯",
   "D♭",
   "D",
   "D♯",
   "E♭",
   "E",
   "F",
   "F♯",
   "G♭",
   "G",
   "G♯",
   "A♭",
   "A",
   "A♯",
   "B♭",
   "B",
];
// Kept for the older callers/tests; the pickers and the key select use `keyNames` above.
export const keys = KEY_NAMES_FLAT;
export const notePitches = {
   C: 0,
   "B#": 0,
   "D♭": 1,
   Db: 1,
   "C#": 1,
   "C♯": 1,
   D: 2,
   "E♭": 3,
   Eb: 3,
   "D#": 3,
   "D♯": 3,
   E: 4,
   "F♭": 4,
   Fb: 4,
   F: 5,
   "E#": 5,
   "E♯": 5,
   "G♭": 6,
   Gb: 6,
   "F#": 6,
   "F♯": 6,
   G: 7,
   "A♭": 8,
   Ab: 8,
   "G#": 8,
   "G♯": 8,
   A: 9,
   "B♭": 10,
   Bb: 10,
   "A#": 10,
   "A♯": 10,
   B: 11,
   "C♭": 11,
   Cb: 11,
};
export const chordQualities = [
   { value: "", label: "major" },
   { value: "m", label: "m" },
   { value: "7", label: "7" },
   { value: "maj7", label: "maj7" },
   { value: "sus2", label: "sus2" },
   { value: "sus4", label: "sus4" },
   { value: "add9", label: "add9" },
   { value: "+", label: "+" },
   { value: "°", label: "°" },
   { value: "ø7", label: "ø7" },
];
export const bassNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const nashvilleNumbers = ["1", "2", "3", "4", "5", "6", "7"];
export const nashvilleZeroNumbers = ["0"];
export const nashvilleLowerNumbers = ["1̣", "2̣", "3̣", "4̣", "5̣", "6̣", "7̣"];
export const nashvilleUpperNumbers = ["1̇", "2̇", "3̇", "4̇", "5̇", "6̇", "7̇"];
export const nashvilleChoices = [
   ...nashvilleNumbers,
   ...nashvilleLowerNumbers,
   ...nashvilleUpperNumbers,
   ...nashvilleZeroNumbers,
];
export const lyricsFeatureAvailable = true;
export const durationMeta = {
   half: { count: 2, symbol: "½", label: "Half beat" },
   triplet: { count: 3, symbol: "⅓", label: "Beat triplet" },
   quarter: { count: 4, symbol: "¼", label: "Quarter beat" },
};
export const meters = ["2/4", "3/4", "4/4", "6/8"];
export const nashvilleAccidentals = ["", "♭", "#"];

// Import hardening limits (guard against oversized/hostile project files).
export const MAX_BARS = 96;
export const MAX_SECTIONS = 40;
// Fermata (hold) bounds: an extra-beats pause of 1..32 per beat. Shared by the
// editor popover, the import sanitizer and the playback timeline.
export const MAX_FERMATA = 32;

// ---- Editor modes ----
// Single source of truth for the three writing modes. `dataset` drives the
// `body[data-editor-mode]` attribute (mode-specific CSS), `badge` is the label in
// the topbar pill and `cardMark` is the glyph used on library cards. Keeping this
// in the pure module means the mode mapping is unit-tested and render.js /
// cloudUI.js can never drift apart.
export const editorModeMeta = {
   chords: { id: "chords", badge: "Chord Chart", cardMark: "♪" },
   // The number grid + its lyrics row. Named for what you actually write (not angka + lyrics)
   // rather than for one region's nickname — the id stays `numbers`, so files, cloud documents
   // and the `data-editor-mode="numbers"` styling hooks are untouched by the label.
   numbers: { id: "numbers", badge: "Numeric Notation + Lyrics", cardMark: "#" },
   chordpro: { id: "chordpro", badge: "ChordPro", cardMark: "♬" },
};

/**
 * Normalise a stored/imported mode id. Anything unknown (including legacy files
 * with no `editorMode` at all) falls back to "chords", which is exactly what the
 * app did before the third mode existed.
 */
export function normalizeEditorMode(value) {
   return value === "numbers" || value === "chordpro" ? value : "chords";
}

export const escapeHTML = (value) =>
   String(value ?? "").replace(
      /[&<>"]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
   );

export const newSection = (name = "Intro") => ({
   id: crypto.randomUUID(),
   name,
   lyricsEnabled: true,
   lyricBeats: {},
   // The chord row above the numbers is OFF for a new section: it is a per-section
   // feature, so the user turns it on where it is needed (Chords On/Off button).
   chordAboveEnabled: false,
   chordAboveBeats: {},
   // Sparse per-bar overrides for the chord row ("2": true / "3": false).
   // An absent key means "inherit from the section" — see chordAboveShownForBar().
   chordAboveBars: {},
   bars: 4,
   beats: {},
});

// ---- Transpose ----
// Internal spelling helpers for the standard documented at the top of this file.
const foldAccidentals = (value) =>
   String(value ?? "")
      .trim()
      .replaceAll("♯", "#")
      .replaceAll("♭", "b");
const KEY_NAME_SET = new Set(keyNames.map(foldAccidentals));
/** True when a stored/imported key name is one the app can handle (F♯, D♭, C, …). */
export const isKnownKey = (value) => KEY_NAME_SET.has(foldAccidentals(value));
/** A key is on the flat side when it carries a ♭ — plus F, whose signature has one flat. */
function prefersFlats(keyName) {
   const folded = foldAccidentals(keyName);
   if (folded.includes("b")) return true;
   if (folded.includes("#")) return false;
   return folded === "F";
}
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
// Semitone offset of each natural letter above the tonic of a major scale.
const LETTER_STEPS = [0, 2, 4, 5, 7, 9, 11];
const scaleCache = new Map();
/**
 * The major scale of a key as pitch class → spelled note, built from the tonic's LETTER so the
 * degrees keep their names (D major → F♯, C♯; a flat key → G♭, D♭). A degree that would need a
 * double accidental is left out on purpose, so callers fall back to the readable table.
 */
function keyScale(keyName) {
   const folded = foldAccidentals(keyName);
   const cached = scaleCache.get(folded);
   if (cached) return cached;
   const scale = new Map();
   const tonicPitch = notePitches[folded];
   if (tonicPitch !== undefined) {
      const start = LETTERS.indexOf(folded[0].toUpperCase());
      for (let step = 0; step < 7; step += 1) {
         const letter = LETTERS[(start + step) % 7];
         const pitch = (tonicPitch + LETTER_STEPS[step]) % 12;
         const diff = (pitch - notePitches[letter] + 12) % 12;
         const accidental = diff === 0 ? "" : diff === 1 ? "♯" : diff === 11 ? "♭" : null;
         if (accidental !== null && !scale.has(pitch)) scale.set(pitch, `${letter}${accidental}`);
      }
   }
   scaleCache.set(folded, scale);
   return scale;
}
const UNREADABLE = /^(?:C♭|F♭|E♯|B♯)/;
/** Spell one pitch class for a chart in `keyName` (rules 1, 2 and 4). */
export function spellPitch(pitch, keyName) {
   const pc = ((pitch % 12) + 12) % 12;
   if (keyName) {
      const degree = keyScale(keyName).get(pc);
      if (degree && !UNREADABLE.test(degree)) return degree;
      // Chromatic (borrowed) notes follow the key's side as well: borrowed chords are ♭-altered
      // in practice (♭VI/♭VII/♭III), so a flat chart reads G♭/D♭ where a sharp chart reads F♯/C♯.
      if (prefersFlats(keyName)) return KEY_NAMES_FLAT[pc];
   }
   return READABLE_CHROMATIC[pc];
}
/** The name the song KEY takes after moving `semitones` (rule 1 + the F♯/G♭ tie-break). */
export function transposeKeyName(keyName, semitones) {
   const pitch = notePitches[foldAccidentals(keyName)] ?? 0;
   const pc = (((pitch + semitones) % 12) + 12) % 12;
   const sharps = KEY_ACCIDENTALS_SHARP[pc];
   const flats = KEY_ACCIDENTALS_FLAT[pc];
   if (sharps < flats) return KEY_NAMES_SHARP[pc];
   if (flats < sharps) return KEY_NAMES_FLAT[pc];
   // Equal-sized signatures happen only at pitch class 6 (F♯ 6♯ vs G♭ 6♭): keep the chart's own
   // side, so a flat score stays flat while a sharp/neutral one gets the familiar F♯.
   return prefersFlats(keyName) ? KEY_NAMES_FLAT[pc] : KEY_NAMES_SHARP[pc];
}
export function transposeNote(note, semitones, ctx) {
   const pitch = notePitches[foldAccidentals(note)];
   return pitch === undefined ? note : spellPitch(pitch + semitones, ctx?.key);
}
export function isNashvilleChord(value) {
   return /^[♭#]?[0-7][̣̇]?/u.test(String(value));
}
export function validChordSuffix(suffix) {
   return /^(?:(?:maj|min|sus|add|dim|aug|omit|no)|[mM0-9#♯b♭/()+\-°ø])*$/i.test(suffix);
}
// Distance (semitones) from the chord root → the scale degree it clearly is (1 = root, 3 = third,
// 5 = fifth, …). A tritone (6) may be ♯11 or ♭5 and a minor 6th (8) may be ♭6 or ♯5, so those are
// deliberately absent: they fall through to the readable table (F♯, A♭) where players expect them.
const CHORD_DEGREE_STEPS = { 0: 1, 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 7: 5, 9: 6, 10: 7, 11: 7 };
/** Spell `distance` semitones above a root as a degree of that chord (null when unreadable). */
function degreeSpelling(rootPitch, rootLetter, distance) {
   const step = CHORD_DEGREE_STEPS[distance];
   if (!step) return null;
   const letter = LETTERS[(LETTERS.indexOf(rootLetter) + step - 1) % 7];
   const pitch = (rootPitch + distance) % 12;
   const diff = (pitch - notePitches[letter] + 12) % 12;
   const accidental = diff === 0 ? "" : diff === 1 ? "♯" : diff === 11 ? "♭" : null;
   if (accidental === null) return null;
   const spelled = `${letter}${accidental}`;
   // E♯/B♯/C♭/F♭ are theoretically right but never printed on a chord chart: let the caller fall
   // back to the readable table (`C♯/E♯` → `C♯/F`, which is how the bass is read in practice).
   return UNREADABLE.test(spelled) ? null : spelled;
}
export function transposeChordRoot(value, semitones, ctx) {
   const match = String(value).match(/^([A-G])([#♯b♭]?)(.*)$/);
   if (!match || !validChordSuffix(match[3])) return null;
   const pitch = notePitches[foldAccidentals(`${match[1]}${match[2]}`)];
   if (pitch === undefined) return null;
   return `${spellPitch(pitch + semitones, ctx?.key)}${match[3]}`;
}
/**
 * Lenient companion used by transposeChord() for chords the user typed by hand whose
 * suffix our grammar doesn't know (`Cxyz`). We still move the ROOT — a transpose that
 * silently skipped custom chords would knock the whole chart out of key — and keep the
 * suffix exactly as written. Requiring a non-empty, whitespace-free suffix keeps plain
 * text (`Amazing grace`) from being rewritten.
 */
function transposeCustomChordRoot(value, semitones, ctx) {
   const match = String(value).match(/^([A-G])([#♯b♭]?)(\S*)$/);
   if (!match || !match[3]) return null;
   const pitch = notePitches[foldAccidentals(`${match[1]}${match[2]}`)];
   if (pitch === undefined) return null;
   return `${spellPitch(pitch + semitones, ctx?.key)}${match[3]}`;
}
/**
 * The bass of a slash chord. When it is a chord TONE (rule 3) it follows the chord's own degree —
 * `D/F♯` stays `F♯` and `G/B` becomes `A♭/C` — so a bass never turns into an enharmonic stranger.
 */
function transposeBass(transposedMain, sourceMain, bass, semitones, ctx) {
   const movedRootMatch = String(transposedMain).match(/^([A-G][♯♭]?)/);
   const sourceRootMatch = String(sourceMain).match(/^([A-G][♯♭]?)/);
   const sourceRootPitch = notePitches[foldAccidentals(sourceRootMatch?.[1])];
   const bassPitch = notePitches[foldAccidentals(bass)];
   if (!movedRootMatch || sourceRootPitch === undefined || bassPitch === undefined)
      return transposeNote(bass, semitones, ctx);
   const movedRoot = notePitches[foldAccidentals(movedRootMatch[1])];
   const distance = (bassPitch - sourceRootPitch + 24) % 12;
   const movedBass = (bassPitch + semitones + 24) % 12;
   return degreeSpelling(movedRoot, movedRootMatch[1][0], distance) ?? spellPitch(movedBass, ctx?.key);
}
export function transposeChord(value, semitones, ctx) {
   const chord = String(value);
   if (isNashvilleChord(chord)) return chord;
   const slash = chord.match(/^(.*)\/([A-G](?:[#♯b♭])?)$/),
      main = slash ? slash[1] : chord;
   const transposedMain =
      transposeChordRoot(main, semitones, ctx) ?? transposeCustomChordRoot(main, semitones, ctx);
   if (!transposedMain) return chord;
   if (!slash) return transposedMain;
   return `${transposedMain}/${transposeBass(transposedMain, main, slash[2], semitones, ctx)}`;
}
/**
 * Transpose section.beats in place. A slot value is either a plain string
 * (legacy shape) or `{ chord, duration }`; both are supported. Returns how many
 * chords actually changed, which feeds the "N chords transposed" toast.
 */
export function transposeBeats(beats, semitones, ctx) {
   let changed = 0;
   Object.entries(beats || {}).forEach(([slot, value]) => {
      const current = typeof value === "string" ? value : value?.chord;
      if (!current) return;
      const next = transposeChord(current, semitones, ctx);
      if (next === current) return;
      if (typeof value === "string") beats[slot] = next;
      else value.chord = next;
      changed += 1;
   });
   return changed;
}
/**
 * Transpose a slot→chord STRING map in place — used for the chord row that sits
 * above the numbers (`section.chordAboveBeats`). Nashville degrees and "N.C."
 * come back unchanged from transposeChord(), so a number-only row is a no-op:
 * numbers stay where they are while the letter chords move with the key.
 * Returns how many entries actually changed.
 */
export function transposeChordMap(map, semitones, ctx) {
   let changed = 0;
   Object.entries(map || {}).forEach(([slot, value]) => {
      if (typeof value !== "string" || !value) return;
      const next = transposeChord(value, semitones, ctx);
      if (next === value) return;
      map[slot] = next;
      changed += 1;
   });
   return changed;
}

// ---- Slot helpers ----
export function slotBarIndex(slot) {
   const match = String(slot).match(/^(\d+)-/);
   return match ? Number(match[1]) : -1;
}

// ---- Lyric syllable splitting (pure, DOM-free) ----
// Lightweight English-oriented syllabifier. It is heuristic (no dictionary), so
// it won't be perfect for every word, but it produces natural, singable breaks
// for typical worship lyrics (e.g. "amazing" -> a·maz·ing). Users can always
// hand-tune the result afterwards in the per-beat inputs.
const VOWELS = "aeiouy";
const isVowel = (character) => VOWELS.includes(String(character).toLowerCase());

/**
 * Split a single word into syllable chunks. Returns an array of 1+ pieces.
 * Punctuation attached to the word (commas, apostrophes) is preserved on the
 * chunk it belongs to. Very short words and single-nucleus words are not split.
 *
 * Strategy (classic vowel-group heuristic):
 *  1. Find vowel groups (maximal runs of vowels) — each is one syllable nucleus.
 *  2. Drop a silent trailing "e" nucleus ("grace", "saved" stay one syllable).
 *  3. Between two nuclei, assign the consonant cluster: a single consonant goes
 *     to the following syllable (V|CV → "a·maz"); two or more consonants split
 *     (VC|CV → "won·der"), leaving the last consonant with the next syllable.
 */
export function splitSyllables(word) {
   const raw = String(word ?? "");
   if (!raw) return [];
   const match = raw.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’-]*)?([^A-Za-z]*)$/);
   if (!match || !match[2]) return [raw];
   const [, lead, core, trail] = match;
   // Already hyphenated by the user (e.g. "a-maz-ing")? Respect their breaks.
   if (core.includes("-")) {
      return applyAffix(core.split("-").filter(Boolean), lead, trail);
   }
   const chars = core.split("");
   const letters = core.replace(/['’]/g, "");
   if (letters.length <= 3) return applyAffix([core], lead, trail);

   // 1) Vowel groups → nuclei (store start index of each group).
   const groups = [];
   let inVowel = false;
   for (let i = 0; i < chars.length; i += 1) {
      const v = /[A-Za-z]/.test(chars[i]) && isVowel(chars[i]);
      if (v && !inVowel) groups.push({ start: i, end: i });
      else if (v) groups[groups.length - 1].end = i;
      inVowel = v;
   }
   // 2) Drop silent trailing "e" (e.g. grace, saved, more) — but not "the"/"be"
   //    handled by the length<=3 guard above.
   if (groups.length >= 2) {
      const last = groups[groups.length - 1];
      const isFinalE =
         last.start === last.end && chars[last.start].toLowerCase() === "e" && last.end === chars.length - 1;
      if (isFinalE) groups.pop();
   }
   // 2b) Drop a silent "e" in a "-ed"/"-es" ending (saved, praised, ransomed,
   //     raises) so the ending clings to the previous syllable rather than
   //     forming its own beat. The "e" is voiced after t/d ("wanted"), so skip
   //     those.
   if (groups.length >= 2) {
      const last = groups[groups.length - 1];
      const tail = core.slice(last.start).toLowerCase();
      const beforeE = last.start > 0 ? chars[last.start - 1].toLowerCase() : "";
      if (last.start === last.end && (tail === "ed" || tail === "es") && beforeE && !"td".includes(beforeE)) {
         groups.pop();
      }
   }
   if (groups.length <= 1) return applyAffix([core], lead, trail);

   // 3) Choose a cut index between each pair of adjacent nuclei.
   const cuts = [];
   for (let g = 0; g < groups.length - 1; g += 1) {
      const vowelEnd = groups[g].end; // last vowel of this nucleus
      const nextVowelStart = groups[g + 1].start; // first vowel of next nucleus
      const consonants = nextVowelStart - vowelEnd - 1;
      // 1 (or 0) consonant → cut right after the vowel (V|CV).
      // 2+ consonants → keep the first consonant with this syllable (VC|CV).
      const cut = consonants <= 1 ? vowelEnd + 1 : vowelEnd + 2;
      if (cut > 0 && cut < chars.length) cuts.push(cut);
   }
   if (!cuts.length) return applyAffix([core], lead, trail);

   const pieces = [];
   let start = 0;
   for (const cut of cuts) {
      pieces.push(core.slice(start, cut));
      start = cut;
   }
   pieces.push(core.slice(start));
   return applyAffix(mergeVowelless(pieces.filter(Boolean)), lead, trail);
}

// Merge any chunk that has no vowel (unsingable, e.g. a lone "g"/"ch") into an
// adjacent chunk so every syllable carries a nucleus.
function mergeVowelless(pieces) {
   const out = [];
   for (const piece of pieces) {
      if (!/[aeiouy]/i.test(piece) && out.length) out[out.length - 1] += piece;
      else out.push(piece);
   }
   return out.length ? out : pieces;
}

// Re-attach leading/trailing punctuation to the first/last syllable chunk.
function applyAffix(pieces, lead, trail) {
   if (!pieces.length) return [`${lead}${trail}`];
   const out = pieces.slice();
   out[0] = `${lead}${out[0]}`;
   out[out.length - 1] = `${out[out.length - 1]}${trail}`;
   return out;
}

/**
 * Turn a free-form lyric line/paragraph into an ordered list of syllable
 * tokens ready to drop into consecutive beats. Multi-syllable words get a
 * trailing hyphen on every chunk except the last, matching hymnal style
 * (e.g. "amazing grace" -> ["a-", "maz-", "ing", "grace"]).
 */
export function syllabifyLyrics(text) {
   const words = String(text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
   const tokens = [];
   for (const word of words) {
      const pieces = splitSyllables(word);
      pieces.forEach((piece, index) => {
         const isLast = index === pieces.length - 1;
         const needsHyphen = !isLast && !/[-.,;:!?]$/.test(piece);
         tokens.push(needsHyphen ? `${piece}-` : piece);
      });
   }
   return tokens;
}

// ---- Section-data helpers (mutate plain data; no DOM) ----
export function beatValue(section, slot) {
   const value = section.beats[slot];
   return typeof value === "string" ? { chord: value, duration: null } : value || { chord: null, duration: null };
}
// ---- Fermata (hold) --------------------------------------------------------
// A fermata adds a pause of N EXTRA beats before the NEXT beat plays. It is a
// per-beat performance mark stored ON the beat value (`section.beats[slot].fermata`)
// so copy/paste, clone, transpose and undo/redo carry it with the chord/number for
// free (all of those copy the value object wholesale). It affects PLAYBACK only —
// the printed/PDF score merely draws the glyph.
export function fermataValue(section, slot) {
   const count = Number(section?.beats?.[slot]?.fermata);
   return Number.isInteger(count) && count > 0 ? Math.min(count, MAX_FERMATA) : 0;
}
/**
 * Set (or clear, with count <= 0) the fermata hold on a beat. Returns the stored
 * extra-beat count (0 when cleared). The beat cell survives as long as it still
 * carries a chord, a rhythm marker or a fermata, so clearing a fermata on an
 * otherwise-empty beat leaves no stray cell behind.
 */
export function setFermata(section, slot, count) {
   const value = { ...beatValue(section, slot) };
   const next = Math.min(MAX_FERMATA, Math.max(0, Math.trunc(Number(count) || 0)));
   if (next > 0) value.fermata = next;
   else delete value.fermata;
   if (value.chord || value.duration || value.fermata) section.beats[slot] = value;
   else delete section.beats[slot];
   return value.fermata || 0;
}
export function clearFermata(section, slot) {
   return setFermata(section, slot, 0);
}
/** True when ANY beat in the section carries a fermata hold. */
export function sectionHasFermata(section) {
   const beats = section?.beats || {};
   return Object.keys(beats).some((slot) => fermataValue(section, slot) > 0);
}
/**
 * Re-create a beat after its subdivisions were collapsed back onto it, KEEPING any
 * fermata the beat (or one of its children) carried — the pause is independent of
 * the rhythm marker, so removing a ½/⅓/¼ split must not silently drop it. Mutates.
 */
export function restoreCollapsedBeat(section, slot, chord, fermata = 0) {
   const hold = Math.min(MAX_FERMATA, Math.max(0, Math.trunc(fermata) || 0));
   if (chord || hold > 0) {
      const value = { chord: chord || null, duration: null };
      if (hold > 0) value.fermata = hold;
      section.beats[slot] = value;
   } else {
      delete section.beats[slot];
   }
}
export function lyricValue(section, slot) {
   return typeof section.lyricBeats?.[slot] === "string" ? section.lyricBeats[slot] : "";
}
export function setLyric(section, slot, text) {
   section.lyricBeats ??= {};
   if (text.trim()) section.lyricBeats[slot] = text;
   else delete section.lyricBeats[slot];
}
// ---- Chord-above (Chord Chart mode) --------------------------------------
// A letter chord shown ABOVE a Nashville number, one per beat slot. Mirrors the
// lyricBeats model but lives above the notation row instead of below it.
export function chordAboveValue(section, slot) {
   return typeof section.chordAboveBeats?.[slot] === "string" ? section.chordAboveBeats[slot] : "";
}
export function setChordAbove(section, slot, chord) {
   section.chordAboveBeats ??= {};
   if (String(chord).trim()) section.chordAboveBeats[slot] = String(chord).trim();
   else delete section.chordAboveBeats[slot];
}

// ---- Chord-above visibility (per section → per bar) ------------------------
// The chord row is a PER-SECTION feature (there is no song-wide switch): a section
// holds its own default, and `section.chordAboveBars` narrows it further with
// explicit per-bar overrides. An absent per-bar key means "inherit from the
// section". Sparse keys (instead of a fixed-length array) keep the shift/copy
// semantics of removeBar/insertBars/overwriteBars trivial and can never drift out
// of sync with `section.bars`.
/** Does ONE bar show the chord row? */
export function chordAboveShownForBar(section, bar) {
   const override = section.chordAboveBars?.[String(bar)];
   if (typeof override === "boolean") return override;
   return section.chordAboveEnabled === true;
}
/** Does ANY bar of the section show the chord row? Drives the reserved row height. */
export function sectionShowsChordAbove(section) {
   const bars = Math.max(1, Number(section?.bars) || 1);
   for (let bar = 0; bar < bars; bar += 1) {
      if (chordAboveShownForBar(section, bar)) return true;
   }
   return false;
}
/** Explicit per-bar override; pass `undefined` to clear it back to "inherit". */
export function setChordAboveForBar(section, bar, shown) {
   section.chordAboveBars ??= {};
   const key = String(bar);
   if (typeof shown === "boolean") section.chordAboveBars[key] = shown;
   else delete section.chordAboveBars[key];
}
// Shift/drop the per-bar overrides exactly like the slot-keyed maps below:
// every bar >= fromBar moves by `delta`, and `removedBar` is dropped instead.
function shiftChordAboveBars(source, { fromBar, delta, removedBar = null }) {
   return Object.fromEntries(
      Object.entries(source || {}).flatMap(([key, value]) => {
         const index = Number(key);
         if (!Number.isInteger(index) || index < 0 || typeof value !== "boolean") return [];
         if (removedBar !== null && index === removedBar) return [];
         const shifted = index >= fromBar ? index + delta : index;
         return shifted < 0 ? [] : [[String(shifted), value]];
      }),
   );
}
// Copy the overrides inside [lo..hi], rebased so that `lo` becomes bar 0.
function pickChordAboveBars(section, lo, hi) {
   return Object.fromEntries(
      Object.entries(section.chordAboveBars || {}).flatMap(([key, value]) => {
         const index = Number(key);
         if (!Number.isInteger(index) || index < lo || index > hi) return [];
         if (typeof value !== "boolean") return [];
         return [[String(index - lo), value]];
      }),
   );
}
// Rebase a payload's (bar-0-based) overrides onto `targetBar`. Mutates `target`.
function rebaseChordAboveBars(source, target, targetBar) {
   Object.entries(source || {}).forEach(([key, value]) => {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || typeof value !== "boolean") return;
      target[String(index + targetBar)] = value;
   });
}
export function prepareLyricsForDuration(section, baseSlot, nextDuration) {
   section.lyricBeats ??= {};
   const currentDuration = beatValue(section, baseSlot).duration,
      baseText = lyricValue(section, baseSlot);
   if (!currentDuration && baseText) {
      setLyric(section, `${baseSlot}:0`, baseText);
      delete section.lyricBeats[baseSlot];
   }
   if (currentDuration === "quarter" && nextDuration === "half") {
      const trailing = [1, 2, 3]
         .map((index) => lyricValue(section, `${baseSlot}:${index}`))
         .filter(Boolean)
         .join(" ");
      setLyric(section, `${baseSlot}:1`, trailing);
      delete section.lyricBeats[`${baseSlot}:2`];
      delete section.lyricBeats[`${baseSlot}:3`];
   }
}
// ---- Chord row above the numbers: rhythm + move helpers --------------------
/**
 * Keep the chord row aligned when a beat gains or changes a rhythm marker — the
 * mirror of prepareLyricsForDuration():
 *  • a plain beat's single cell moves to the FIRST subdivision (":0");
 *  • "quarter" → "half" collapses the trailing cells into the 2nd half (":1").
 * A chord cell holds ONE chord, so unlike lyrics there is nothing to join: the
 * first non-empty chord wins and the rest are dropped. Mutates section.
 */
export function prepareChordAboveForDuration(section, baseSlot, nextDuration) {
   section.chordAboveBeats ??= {};
   const currentDuration = beatValue(section, baseSlot).duration,
      baseChord = chordAboveValue(section, baseSlot);
   if (!currentDuration && baseChord) {
      setChordAbove(section, `${baseSlot}:0`, baseChord);
      delete section.chordAboveBeats[baseSlot];
   }
   if (currentDuration === "quarter" && nextDuration === "half") {
      const first =
         chordAboveValue(section, `${baseSlot}:1`) || chordAboveValue(section, `${baseSlot}:2`);
      setChordAbove(section, `${baseSlot}:1`, first);
      delete section.chordAboveBeats[`${baseSlot}:2`];
      delete section.chordAboveBeats[`${baseSlot}:3`];
   }
}
/**
 * Collapse the chord row of every descendant slot of `baseSlot` back onto the
 * base slot (used when a rhythm marker is removed). Returns true when a chord
 * was kept, mirroring how merged lyrics report back.
 */
export function collapseChordAbove(section, baseSlot) {
   const slots = Object.keys(section.chordAboveBeats || {})
      .filter(
         (slot) =>
            slot === baseSlot || slot.startsWith(`${baseSlot}:`) || slot.startsWith(`${baseSlot}.`),
      )
      .sort();
   if (!slots.length) return false;
   const first = slots.map((slot) => chordAboveValue(section, slot)).find(Boolean) || "";
   slots.forEach((slot) => delete section.chordAboveBeats[slot]);
   if (first) setChordAbove(section, baseSlot, first);
   return !!first;
}
/** Move one chord-row cell to another slot (used by the nested half-beat split). */
export function moveChordAbove(section, fromSlot, toSlot) {
   const chord = chordAboveValue(section, fromSlot);
   if (!chord) return false;
   setChordAbove(section, toSlot, chord);
   setChordAbove(section, fromSlot, "");
   return true;
}
export function barHasContent(section, bar) {
   return (
      Object.keys(section.beats || {}).some((slot) => slotBarIndex(slot) === bar) ||
      Object.entries(section.lyricBeats || {}).some(
         ([slot, text]) => slotBarIndex(slot) === bar && String(text).trim(),
      ) ||
      Object.entries(section.chordAboveBeats || {}).some(
         ([slot, chord]) => slotBarIndex(slot) === bar && String(chord).trim(),
      )
   );
}
export function removeBar(section, bar) {
   const shiftSlots = (source) =>
      Object.fromEntries(
         Object.entries(source || {}).flatMap(([slot, value]) => {
            const match = slot.match(/^(\d+)(-.+)$/);
            if (!match) return [[slot, value]];
            const index = Number(match[1]);
            if (index === bar) return [];
            return [[`${index > bar ? index - 1 : index}${match[2]}`, value]];
         }),
      );
   section.beats = shiftSlots(section.beats);
   section.lyricBeats = shiftSlots(section.lyricBeats);
   section.chordAboveBeats = shiftSlots(section.chordAboveBeats);
   // Per-bar chord-row overrides follow their bar: the deleted bar is dropped
   // and everything after it moves up one, so a hidden row can never "jump" to
   // a different bar after a delete.
   section.chordAboveBars = shiftChordAboveBars(section.chordAboveBars, {
      fromBar: bar,
      delta: -1,
      removedBar: bar,
   });
   section.bars = Math.max(1, section.bars - 1);
}

// ---- Copy / paste helpers (pure, unit-testable) ----
// Extract a single bar's beats + lyrics, normalized so the bar index becomes 0.
// Returns { beats, lyricBeats } — deep-cloned, safe to store in a clipboard.
export function extractBar(section, bar) {
   const pick = (source) =>
      Object.fromEntries(
         Object.entries(source || {}).flatMap(([slot, value]) => {
            const match = slot.match(/^(\d+)(-.+)$/);
            if (!match) return [];
            if (Number(match[1]) !== bar) return [];
            // Re-base the bar index to 0 and deep-clone the value.
            const cloned = value && typeof value === "object" ? { ...value } : value;
            return [[`0${match[2]}`, cloned]];
         }),
      );
   return {
      beats: pick(section.beats),
      lyricBeats: pick(section.lyricBeats),
      chordAboveBeats: pick(section.chordAboveBeats),
      chordAboveBars: pickChordAboveBars(section, bar, bar),
   };
}

// Overwrite a target bar's content with a previously-extracted bar payload.
// Existing slots for that bar are cleared first, then the payload (which is
// normalized to bar 0) is written at the target bar index. Mutates section.
export function replaceBarContent(section, bar, payload) {
   const clearBar = (source) =>
      Object.fromEntries(Object.entries(source || {}).filter(([slot]) => slotBarIndex(slot) !== bar));
   const rebase = (source, target) => {
      Object.entries(source || {}).forEach(([slot, value]) => {
         const match = slot.match(/^0(-.+)$/);
         if (!match) return;
         const cloned = value && typeof value === "object" ? { ...value } : value;
         target[`${bar}${match[1]}`] = cloned;
      });
   };
   const beats = clearBar(section.beats);
   const lyricBeats = clearBar(section.lyricBeats);
   const chordAboveBeats = clearBar(section.chordAboveBeats);
   // Chord-row visibility travels with the bar too: the pasted bar's own flag
   // wins, and a source bar without an explicit flag leaves the target on
   // "inherit from the section" (same clearing rule as the maps above).
   const chordAboveBars = Object.fromEntries(
      Object.entries(section.chordAboveBars || {}).filter(([key]) => Number(key) !== bar),
   );
   rebase(payload?.beats, beats);
   rebase(payload?.lyricBeats, lyricBeats);
   rebase(payload?.chordAboveBeats, chordAboveBeats);
   rebaseChordAboveBars(payload?.chordAboveBars, chordAboveBars, bar);
   section.beats = beats;
   section.lyricBeats = lyricBeats;
   section.chordAboveBeats = chordAboveBeats;
   section.chordAboveBars = chordAboveBars;
}

// Deep-clone a section and assign a fresh id (for copy/paste + duplicate).
export function cloneSection(section, newName) {
   const clone = JSON.parse(JSON.stringify(section));
   clone.id = crypto.randomUUID();
   if (newName) clone.name = newName;
   return clone;
}

// Extract a contiguous RANGE of bars [startBar..endBar] (inclusive), normalized
// so the first bar in the range becomes bar 0. Returns { count, beats, lyricBeats }
// — deep-cloned, safe to store in a clipboard. Order-agnostic (start/end can be
// passed either way round).
export function extractBars(section, startBar, endBar) {
   const lo = Math.min(startBar, endBar);
   const hi = Math.max(startBar, endBar);
   const pick = (source) =>
      Object.fromEntries(
         Object.entries(source || {}).flatMap(([slot, value]) => {
            const match = slot.match(/^(\d+)(-.+)$/);
            if (!match) return [];
            const index = Number(match[1]);
            if (index < lo || index > hi) return [];
            const cloned = value && typeof value === "object" ? { ...value } : value;
            return [[`${index - lo}${match[2]}`, cloned]];
         }),
      );
   return {
      count: hi - lo + 1,
      beats: pick(section.beats),
      lyricBeats: pick(section.lyricBeats),
      chordAboveBeats: pick(section.chordAboveBeats),
      chordAboveBars: pickChordAboveBars(section, lo, hi),
   };
}

// Extract an ARBITRARY SET of bars (non-contiguous — e.g. {1, 3}) as ONE payload,
// ordered by bar index: the k-th selected bar becomes bar k. Paste then fills
// consecutive bars in that order (see insertBars / overwriteBars), so copying
// {1, 3} and pasting at bar X writes the original bar 1 into X and bar 3 into X+1.
// Reuses the (well-tested) single-bar range extractor, so slot/override rebasing
// stays single-sourced with extractBars.
export function extractBarsByIndices(section, indices) {
   const ordered = [...new Set(indices)]
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b);
   const payload = { count: ordered.length, beats: {}, lyricBeats: {}, chordAboveBeats: {}, chordAboveBars: {} };
   const rebaseSlotMap = (source, target, outIndex) => {
      Object.entries(source || {}).forEach(([slot, value]) => {
         const match = slot.match(/^(\d+)(-.+)$/);
         if (!match) return;
         target[`${outIndex}${match[2]}`] = value;
      });
   };
   ordered.forEach((barIndex, outIndex) => {
      const part = extractBars(section, barIndex, barIndex);
      rebaseSlotMap(part.beats, payload.beats, outIndex);
      rebaseSlotMap(part.lyricBeats, payload.lyricBeats, outIndex);
      rebaseSlotMap(part.chordAboveBeats, payload.chordAboveBeats, outIndex);
      // Single-bar overrides come back keyed "0"; relocate onto the output slot.
      Object.entries(part.chordAboveBars || {}).forEach(([, value]) => {
         payload.chordAboveBars[String(outIndex)] = value;
      });
   });
   return payload;
}

// Insert a previously-extracted multi-bar payload into a section BEFORE the
// given target bar. Existing bars at/after the target shift right by
// payload.count; the payload (normalized to bar 0) is written at the target
// index. Mutates section. Respects MAX_BARS (returns false if it would overflow).
export function insertBars(section, targetBar, payload) {
   const count = payload?.count || 0;
   if (!count) return false;
   if (section.bars + count > MAX_BARS) return false;
   // Shift every existing slot at index >= targetBar right by `count`.
   const shiftSlots = (source) =>
      Object.fromEntries(
         Object.entries(source || {}).map(([slot, value]) => {
            const match = slot.match(/^(\d+)(-.+)$/);
            if (!match) return [slot, value];
            const index = Number(match[1]);
            const shifted = index >= targetBar ? index + count : index;
            return [`${shifted}${match[2]}`, value];
         }),
      );
   const beats = shiftSlots(section.beats);
   const lyricBeats = shiftSlots(section.lyricBeats);
   const chordAboveBeats = shiftSlots(section.chordAboveBeats);
   // Per-bar chord-row overrides shift right with their bar (bar-0 keys need a
   // dedicated shift — the slot maps above are keyed "bar-beat", these are not).
   const chordAboveBars = shiftChordAboveBars(section.chordAboveBars, {
      fromBar: targetBar,
      delta: count,
   });
   // Write the payload (bar-0-based) at the target index.
   const rebase = (source, target) => {
      Object.entries(source || {}).forEach(([slot, value]) => {
         const match = slot.match(/^(\d+)(-.+)$/);
         if (!match) return;
         const cloned = value && typeof value === "object" ? { ...value } : value;
         target[`${Number(match[1]) + targetBar}${match[2]}`] = cloned;
      });
   };
   rebase(payload.beats, beats);
   rebase(payload.lyricBeats, lyricBeats);
   rebase(payload.chordAboveBeats, chordAboveBeats);
   rebaseChordAboveBars(payload.chordAboveBars, chordAboveBars, targetBar);
   section.beats = beats;
   section.lyricBeats = lyricBeats;
   section.chordAboveBeats = chordAboveBeats;
   section.chordAboveBars = chordAboveBars;
   section.bars = section.bars + count;
   return true;
}

// Paste a previously-extracted multi-bar payload by OVERWRITING the bars at the
// target index and the ones after it (target, target+1, …). Bars are NOT shifted
// right; existing content in the overwritten range is replaced. The section grows
// only if the payload extends past the current last bar. Mutates section.
// Respects MAX_BARS (returns false if the paste would overflow the limit).
export function overwriteBars(section, targetBar, payload) {
   const count = payload?.count || 0;
   if (!count) return false;
   const endBar = targetBar + count - 1; // inclusive last bar the paste writes to
   if (endBar + 1 > MAX_BARS) return false;
   // Clear every slot inside the target range [targetBar..endBar]; slots outside
   // that range are kept exactly where they are (no shifting).
   const clearRange = (source) =>
      Object.fromEntries(
         Object.entries(source || {}).filter(([slot]) => {
            const index = slotBarIndex(slot);
            return index < targetBar || index > endBar;
         }),
      );
   const beats = clearRange(section.beats);
   const lyricBeats = clearRange(section.lyricBeats);
   const chordAboveBeats = clearRange(section.chordAboveBeats);
   // Chord-row overrides are keyed by a bare bar index (not "bar-beat"), so they
   // get their own range clear before the payload is rebased onto the target.
   const chordAboveBars = Object.fromEntries(
      Object.entries(section.chordAboveBars || {}).filter(([key]) => {
         const index = Number(key);
         return !Number.isInteger(index) || index < targetBar || index > endBar;
      }),
   );
   // Write the payload (bar-0-based) at the target index.
   const rebase = (source, target) => {
      Object.entries(source || {}).forEach(([slot, value]) => {
         const match = slot.match(/^(\d+)(-.+)$/);
         if (!match) return;
         const cloned = value && typeof value === "object" ? { ...value } : value;
         target[`${Number(match[1]) + targetBar}${match[2]}`] = cloned;
      });
   };
   rebase(payload.beats, beats);
   rebase(payload.lyricBeats, lyricBeats);
   rebase(payload.chordAboveBeats, chordAboveBeats);
   rebaseChordAboveBars(payload.chordAboveBars, chordAboveBars, targetBar);
   section.beats = beats;
   section.lyricBeats = lyricBeats;
   section.chordAboveBeats = chordAboveBeats;
   section.chordAboveBars = chordAboveBars;
   // Grow the bar count only when the paste extends beyond the current end.
   section.bars = Math.max(section.bars, endBar + 1);
   return true;
}

// ---- Import normalization / hardening ----
export function normalizeSection(section, meter = "4/4") {
   const bars = Math.min(MAX_BARS, Math.max(1, Number(section.bars) || 4));
   const beats = {};
   if (section.beats && typeof section.beats === "object")
      Object.entries(section.beats).forEach(([slot, value]) => {
         if (typeof value === "string") beats[slot] = value;
         else if (value && typeof value === "object") {
            const entry = {
               chord: typeof value.chord === "string" ? value.chord : null,
               duration: ["half", "triplet", "quarter"].includes(value.duration) ? value.duration : null,
            };
            // Fermata hold: a positive integer of extra beats survives the import
            // (`true` folds to 1); anything else is dropped so a hostile file can
            // never inject an absurd pause.
            const hold = Number(value.fermata);
            if (Number.isInteger(hold) && hold > 0) entry.fermata = Math.min(hold, MAX_FERMATA);
            beats[slot] = entry;
         }
      });
   const lyricBeats = {};
   if (section.lyricBeats && typeof section.lyricBeats === "object")
      Object.entries(section.lyricBeats).forEach(([slot, text]) => {
         if (typeof text === "string" && text.trim()) lyricBeats[slot] = text;
      });
   if (!Object.keys(lyricBeats).length && typeof section.lyrics === "string" && section.lyrics.trim()) {
      const words = section.lyrics.trim().split(/\s+/),
         beatCount = Math.max(1, Number(String(meter).split("/")[0]) || 4);
      words.forEach((word, index) => {
         if (index < bars * beatCount) lyricBeats[`${Math.floor(index / beatCount)}-${index % beatCount}`] = word;
      });
   }
   // Chord-above (Chord Chart mode): letter chords displayed above each number.
   const chordAboveBeats = {};
   if (section.chordAboveBeats && typeof section.chordAboveBeats === "object")
      Object.entries(section.chordAboveBeats).forEach(([slot, chord]) => {
         if (typeof chord === "string" && chord.trim()) chordAboveBeats[slot] = chord.trim();
      });
   // Per-bar chord-row overrides: only explicit booleans for bars that actually
   // exist survive, so an untrusted file can never flag a bar outside the score.
   const chordAboveBars = {};
   if (section.chordAboveBars && typeof section.chordAboveBars === "object")
      Object.entries(section.chordAboveBars).forEach(([key, value]) => {
         const index = Number(key);
         if (!Number.isInteger(index) || index < 0 || index >= bars) return;
         if (typeof value === "boolean") chordAboveBars[String(index)] = value;
      });
   return {
      id: section.id || crypto.randomUUID(),
      name: String(section.name || "Section"),
      lyricsEnabled: section.lyricsEnabled !== false,
      lyricBeats,
      // Per-section chord row. The file's own flag is restored verbatim, so a song saved with
      // the row ON reopens with it ON. Nothing turns it on by itself: a song that never had it
      // enabled stays OFF even when it holds chord-row data (the old song-wide `CHORDS+`
      // migration that used to force it ON is gone — see the README).
      chordAboveEnabled: section.chordAboveEnabled === true,
      chordAboveBeats,
      chordAboveBars,
      bars,
      beats,
   };
}

export function safeFileName(value) {
   return (
      (value || "worship-notation-score")
         .trim()
         .replace(/[^a-z0-9-_]+/gi, "-")
         .replace(/^-|-$/g, "") || "worship-notation-score"
   );
}
