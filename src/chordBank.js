// chordBank.js — pure, DOM-free chord/Nashville suggestion engine.
// Single source of truth for the "type → pick a suggestion" input flow.
// Everything here is deterministic and unit-testable in Node (no DOM, no state).
//
// Design contract (agreed 2026-08-07):
//  - The user MUST pick a suggestion; the raw text is only a search query. This
//    guarantees every stored chord is normalized/standard (unicode ♭/♯, correct
//    root casing, canonical quality spelling).
//  - One field, auto-detected mode: a leading A–G ⇒ chord mode, a leading
//    1–7 (optionally after ♭/#) ⇒ Nashville mode.
//  - Slash chords are generated on demand once the query contains "/".
//  - Nashville octave variants (high 1̇ / low 1̣) are offered AS SUGGESTIONS
//    (no ^/v typing grammar) so the un-typeable combining dots are reachable.
//  - A BARE number query (a single degree, optionally with an accidental) gets a
//    SHORT curated family instead of the quality colours, and the accidental acts as a
//    FILTER — the list never mixes plain and crossed forms:
//       1 → 1, 1̇, 1̣     ·  #1 (or the ♯ chip) → #1, #1̇, #1̣     ·  ♭1/b1 → ♭1, ♭1̇, ♭1̣
//    Quality colours (`1m`, `17`, `1°`) stay reachable by TYPING them (`1m`, `1dim`) or
//    from the ribbon palette, but they no longer crowd the numeric dropdown.
//  - `b` is a TYPING alias for ♭ (`b1` → ♭1); it is never a stored value (see
//    foldNashvilleKey) so a lowercase letter chord like `b7` stays a chord.

import { nashvilleAccidentalOf } from "./notation.js?v=__BUILD__";

// ---- Vocabulary ---------------------------------------------------------

// Option-1 quality set: practical worship/pop coverage. Order matters — it is
// the tie-break ordering shown to the user (major first, then common colours).
// Augmented / diminished / half-diminished use their proper MUSIC SYMBOLS as the
// canonical value (matching the palette in notation.js): "+" augmented, "°"
// diminished, "ø7" half-diminished. They stay reachable by typing the spelled
// words ("aug", "dim", "m7b5", …) via QUALITY_ALIASES below.
export const BANK_QUALITIES = [
   "",
   "m",
   "7",
   "maj7",
   "m7",
   "sus2",
   "sus4",
   "°",
   "+",
   "ø7",
   "add9",
   "6",
   "m6",
   "9",
   "m9",
   "13",
   "7b9",
];

// Typeable search aliases for the symbol qualities. Typing any of these (after
// the root) surfaces the symbol chord — e.g. "Gaug" → G+, "Gdim" → G°,
// "Gm7b5" → Gø7. Keys are matched folded (lowercase, ascii accidentals).
const QUALITY_ALIASES = {
   "+": ["aug", "augmented"],
   "°": ["dim", "diminished", "o"],
   ø7: ["m7b5", "min7b5", "halfdim", "halfdiminished", "ø", "o7"],
};

// Canonical roots. Flats mirror the app's key list; sharps are offered too so a
// player in a sharp key can reach F♯m etc. Accidentals are unicode (♭/♯).
const NATURAL_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];
const FLAT_ROOTS = ["D♭", "E♭", "G♭", "A♭", "B♭"];
const SHARP_ROOTS = ["C♯", "D♯", "F♯", "G♯", "A♯"];
export const BANK_ROOTS = [...NATURAL_ROOTS, ...FLAT_ROOTS, ...SHARP_ROOTS];

// Bass notes for slash chords (same spellings as roots).
export const BANK_BASSES = [...BANK_ROOTS];

// Nashville scale degrees and accidentals (nashville uses "#", not "♯").
const NASHVILLE_DEGREES = ["1", "2", "3", "4", "5", "6", "7"];
const NASHVILLE_ACCIDENTALS = ["", "♭", "#"];
const OCTAVE_UP = "\u0307"; // combining dot ABOVE  → 1̇
const OCTAVE_DOWN = "\u0323"; // combining dot BELOW → 1̣

const DEFAULT_LIMIT = 12;

// ---- Normalization ------------------------------------------------------

// Fold a value or query to a comparable key: lowercase, unicode accidentals →
// ascii (♭→b, ♯→#), strip whitespace. Quality spellings that use literal "b"
// (e.g. "7b9") are preserved because we only swap the *accidental* glyphs, and
// "b"/"#" already read the same after folding.
export function foldChordKey(value) {
   return String(value ?? "")
      .toLowerCase()
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .replace(/\s+/g, "");
}

// Fold Nashville values for comparison. We drop the combining octave dots so
// that a base-degree query ("1") still prefix-matches its octave variants.
export function foldNashvilleKey(value) {
   return String(value ?? "")
      .replace(new RegExp(`[${OCTAVE_UP}${OCTAVE_DOWN}]`, "gu"), "")
      .toLowerCase()
      .replace(/♯/g, "#")
      // `b` is the typable stand-in for ♭, so a typed `b1` matches the `♭1` candidate.
      // Folding BOTH sides keeps the alias a query-only convenience — what gets stored
      // is always the bank's canonical `♭1`.
      .replace(/♭/g, "b")
      .replace(/\s+/g, "");
}

// ---- Quality normalization (one source of truth for audio) ----------------
// The bank stores chords with canonical symbols (+, °, ø7). Every alternative spelling
// of the same quality — `aug`/`dim`/`m7b5`/`m7♭5`/`ø`/`o7`, `min7`, `ma7`, `Δ7`, `omit3`
// — is folded back onto that canonical spelling here, so a chord can never mean one
// thing to the suggestion list and another to the audio engine (the `Bm7♭5` vs `Bø7`
// mismatch that used to sound like a plain major chord).
const QUALITY_CANONICAL = new Map(
   Object.entries(QUALITY_ALIASES).flatMap(([symbol, aliases]) =>
      aliases.map((alias) => [alias, symbol]),
   ),
);
// Generic spelling rules applied before the alias lookup (order matters: `min7b5`
// must become `m7b5` so the alias table can resolve it to `ø7`).
const QUALITY_REWRITES = [
   [/^min/, "m"],
   [/^mi(?=\d|$)/, "m"],
   [/^omit/, "no"],
   [/^[Δδ]/, "maj"],
   [/^ma(?=\d|$)/, "maj"],
];

/**
 * Fold a typed quality suffix onto the key the audio engine voices (pure).
 * Returns the canonical symbol when the spelling is a known alias (`m7♭5` → `ø7`),
 * otherwise the folded ascii spelling (`7♭9` → `7b9`, `maj9` → `maj9`), so an unknown
 * custom suffix (`xyz`) still comes back as-is and simply falls back to the default
 * voicing instead of breaking.
 */
export function normalizeQuality(quality) {
   const raw = String(quality ?? "").trim();
   if (!raw) return "";
   let folded = foldChordKey(raw);
   for (const [pattern, replacement] of QUALITY_REWRITES)
      folded = folded.replace(pattern, replacement);
   return QUALITY_CANONICAL.get(folded) ?? folded;
}

// ---- Mode detection -----------------------------------------------------

// A query is Nashville when, after an optional leading ♭/# (or b/#), the first
// meaningful character is a digit 1–7. Otherwise, if it starts with A–G it is a
// letter chord. Empty/other → "chord" (default palette).
export function detectMode(rawInput) {
   const trimmed = String(rawInput ?? "").trim();
   if (!trimmed) return "chord";
   const nash = trimmed.replace(/^[♭#b]/i, "");
   if (/^[1-7]/.test(nash)) return "nashville";
   if (/^[a-g]/i.test(trimmed)) return "chord";
   return "chord";
}

// ---- Candidate generation ----------------------------------------------

function chordCandidates() {
   const out = [];
   for (const root of BANK_ROOTS) for (const quality of BANK_QUALITIES) out.push(`${root}${quality}`);
   return out;
}

function nashvilleCandidatesForDegree(accidental, degree) {
   // Order: base, octave-high, octave-low, then quality colours (base octave).
   const base = `${accidental}${degree}`;
   const ordered = [base, `${accidental}${degree}${OCTAVE_UP}`, `${accidental}${degree}${OCTAVE_DOWN}`];
   for (const quality of BANK_QUALITIES) {
      if (quality === "") continue;
      ordered.push(`${accidental}${degree}${quality}`);
   }
   return ordered;
}

function allNashvilleCandidates() {
   const out = [];
   for (const accidental of NASHVILLE_ACCIDENTALS)
      for (const degree of NASHVILLE_DEGREES) out.push(...nashvilleCandidatesForDegree(accidental, degree));
   return out;
}

// ---- Curated family for a bare number query ------------------------------
// A query holding ONE degree (optionally with an accidental and/or an octave dot) is a
// numeric-notation writer asking "what can I write on this beat?" — not a chord search.
// Those queries get a SHORT family instead of the quality colours, and the accidental
// FILTERS it: no accidental lists only the three plain forms, an accidental lists only its
// own three — so `#1` / `♭1` (naik ½ / turun ½) are one chip tap away without ever crowding
// the list. Quality colours stay reachable by typing them (`1m`, `1dim`, `1ø7`).
const BARE_NUMBER_RE = /^([♭#♯b]?)([1-7])([̣̇]?)$/u;
// In Numbers mode an accidental on its own ("#", or "♭"/"b") asks the same question for
// every degree. Chord Chart keeps its sharp-chord browsing for a bare "#", so this arm is
// Numbers-mode only.
const BARE_ACCIDENTAL_RE = /^[♯#]$/u;
const BARE_FLAT_ALIAS_RE = /^[♭b]$/u;

const accidentalWithOctaves = (accidental, degree) => [
   `${accidental}${degree}`,
   `${accidental}${degree}${OCTAVE_UP}`,
   `${accidental}${degree}${OCTAVE_DOWN}`,
];

/**
 * The curated family for a bare number query, or null when the query is not one (then the
 * ranked candidates take over). The accidental acts as a FILTER over the family, so the list
 * always shows exactly what the user is about to commit:
 *   "1"  → 1, 1̇, 1̣                                     (no accidental: the three plain forms)
 *   "#1" → #1, #1̇, #1̣   · "♭1"/"b1" → ♭1, ♭1̇, ♭1̣      (one chip tap / typed accidental away)
 *   "#"  → #1, #1̇, #1̣, #2, …  (Numbers mode only, still no quality colours)
 */
function bareNumberSuggestions(input, limit, mode) {
   if (BARE_ACCIDENTAL_RE.test(input) || (mode === "numbers" && BARE_FLAT_ALIAS_RE.test(input))) {
      const accidental = nashvilleAccidentalOf(input);
      const family = [];
      for (const degree of NASHVILLE_DEGREES) family.push(...accidentalWithOctaves(accidental, degree));
      return family.slice(0, limit);
   }
   const match = input.match(BARE_NUMBER_RE);
   if (!match) return null;
   const accidental = nashvilleAccidentalOf(match[1]);
   const degree = match[2];
   // No accidental → only the plain forms are listed (`1`, `1̇`, `1̣`); the crossed ones are
   // never mixed in. Pressing ♯/♭ (or typing `#`/`b`) swaps the list to that family alone,
   // which keeps the dropdown short and the value about to be committed unambiguous.
   const family = accidentalWithOctaves(accidental, degree);
   // An already-complete query (`#1̇` — reachable when a placed note is retyped) keeps its
   // exact form first, so Enter commits exactly what the user is looking at.
   const exact = `${accidental}${degree}${match[3]}`;
   const index = family.indexOf(exact);
   if (match[3] && index > 0) family.unshift(...family.splice(index, 1));
   return family.slice(0, limit);
}

// Nashville suggestions = the curated family when the query is a bare number, otherwise the
// full ranked candidate set (so `1m`, `1aug`, `1m7b5`, `♭7maj7` … keep working).
function nashvilleSuggestions(input, limit, mode) {
   return (
      bareNumberSuggestions(input, limit, mode) ??
      rankAndSlice(allNashvilleCandidates(), foldNashvilleKey(input), nashvilleFoldKeys, limit)
   );
}

// ---- Ranking ------------------------------------------------------------

// Rank a folded candidate against a folded query: 0 exact, 1 prefix, 2 contains,
// -1 no match. Lower is better; original array order breaks ties (stable sort).
function rankKey(candidateKey, queryKey) {
   if (!queryKey) return 1; // empty query → everything is a "prefix" match
   if (candidateKey === queryKey) return 0;
   if (candidateKey.startsWith(queryKey)) return 1;
   if (candidateKey.includes(queryKey)) return 2;
   return -1;
}

// A candidate may expose several fold keys (e.g. G+ also answers to "gaug").
// Rank against the best (lowest, non-negative) of them.
function rankKeys(candidateKeys, queryKey) {
   let best = -1;
   for (const key of candidateKeys) {
      const rank = rankKey(key, queryKey);
      if (rank >= 0 && (best === -1 || rank < best)) best = rank;
   }
   return best;
}

// foldFn may return a single key (string) or several (array). Normalise to an
// array so callers can attach search aliases to a candidate.
function rankAndSlice(candidates, queryKey, foldFn, limit) {
   const scored = [];
   candidates.forEach((value, index) => {
      const folded = foldFn(value);
      const keys = Array.isArray(folded) ? folded : [folded];
      const rank = rankKeys(keys, queryKey);
      if (rank >= 0) scored.push({ value, rank, index });
   });
   scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
   return scored.slice(0, limit).map((entry) => entry.value);
}

// Fold keys for a chord candidate: its own folded value plus any spelled-out
// aliases for a trailing symbol quality (so "Gaug" finds G+, "Gm7b5" finds Gø7).
function chordFoldKeys(value) {
   const primary = foldChordKey(value);
   const keys = [primary];
   for (const [symbol, aliases] of Object.entries(QUALITY_ALIASES)) {
      const symKey = foldChordKey(symbol);
      if (symKey && primary.endsWith(symKey)) {
         const base = primary.slice(0, primary.length - symKey.length);
         for (const alias of aliases) keys.push(base + foldChordKey(alias));
      }
   }
   return keys;
}

// Same alias expansion for Nashville candidates (so "1aug" finds 1+, etc.).
function nashvilleFoldKeys(value) {
   const primary = foldNashvilleKey(value);
   const keys = [primary];
   for (const [symbol, aliases] of Object.entries(QUALITY_ALIASES)) {
      const symKey = foldNashvilleKey(symbol);
      if (symKey && primary.endsWith(symKey)) {
         const base = primary.slice(0, primary.length - symKey.length);
         for (const alias of aliases) keys.push(base + foldNashvilleKey(alias));
      }
   }
   return keys;
}

// ---- Slash chords (on demand) -------------------------------------------

// When the query has a "/", suggest "<left>/<bass>" pairs. The left side is
// resolved to its best canonical chord match; the bass side filters BANK_BASSES.
function slashSuggestions(rawInput, limit) {
   const [leftRaw, bassRaw = ""] = String(rawInput).split("/");
   const leftKey = foldChordKey(leftRaw);
   const leftMatch = rankAndSlice(chordCandidates(), leftKey, chordFoldKeys, 1)[0] || leftRaw.trim();
   if (!leftMatch) return [];
   const bassKey = foldChordKey(bassRaw);
   const basses = rankAndSlice(BANK_BASSES, bassKey, foldChordKey, limit);
   return basses.map((bass) => `${leftMatch}/${bass}`);
}

// ---- Public API ---------------------------------------------------------

/**
 * Suggest normalized chord/Nashville values for a raw query string.
 * @param {string} rawInput - what the user has typed so far.
 * @param {{limit?:number, mode?:"chords"|"numbers"}} [options]
 *   - mode "chords": letter chord suggestions by default, but a numeric query
 *     (leading 1–7) surfaces Nashville degrees incl. octave variants (1̇/1̣).
 *   - mode "numbers": only Nashville number suggestions (never chords).
 *   - omitted: auto-detect from the query (legacy behavior).
 * @returns {string[]} ordered suggestion values (already normalized/standard).
 */
export function suggestChords(rawInput, options = {}) {
   const limit = options.limit ?? DEFAULT_LIMIT;
   const mode = options.mode;
   const input = String(rawInput ?? "").trim();
   if (!input) return [];

   // Numbers mode: always Nashville, ignore chord candidates entirely.
   if (mode === "numbers") {
      return nashvilleSuggestions(input, limit, mode);
   }

   // Chords mode (Chord Chart): primarily letter chords, but a numeric query
   // (leading 1–7, optionally prefixed with ♭/#) surfaces Nashville degrees so
   // users can drop in a number with octave variants (base, high 1̇, low 1̣)
   // without leaving Chord Chart mode. Slash queries still resolve to slash
   // chords first.
   if (mode === "chords") {
      if (input.includes("/")) return slashSuggestions(input, limit);
      if (detectMode(input) === "nashville") return nashvilleSuggestions(input, limit, mode);
      return rankAndSlice(chordCandidates(), foldChordKey(input), chordFoldKeys, limit);
   }

   // Auto-detect (legacy behavior when no mode specified).
   if (detectMode(input) === "nashville") {
      return nashvilleSuggestions(input, limit, mode);
   }

   if (input.includes("/")) return slashSuggestions(input, limit);

   return rankAndSlice(chordCandidates(), foldChordKey(input), chordFoldKeys, limit);
}

/** True when at least one suggestion exists for the query. */
export function hasSuggestions(rawInput, options = {}) {
   return suggestChords(rawInput, { ...options, limit: 1 }).length > 0;
}
