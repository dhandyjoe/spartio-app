import test from "node:test";
import assert from "node:assert/strict";
import {
   chordToMidiNotes,
   chordToFrequencies,
   resolveEntryNotes,
   resolveEntryFrequencies,
   buildPlaybackQueue,
} from "../src/playback.js";
import { noteNameToMidi } from "../src/synth.js?v=20260824-chordAbove";

// ---- Chord to MIDI note resolution ----

test("chordToMidiNotes resolves letter chords to MIDI note arrays", () => {
   // C major triad: low bass C2 + middle C4-E4-G4
   const notes = chordToMidiNotes("C", "C");
   assert.deepEqual(notes, [36, 60, 64, 67]);
});

test("chordToMidiNotes handles minor chords", () => {
   // Cm: C2 + C4-Eb4-G4
   const notes = chordToMidiNotes("Cm", "C");
   assert.deepEqual(notes, [36, 60, 63, 67]);
});

test("chordToMidiNotes handles 7th chords", () => {
   // C7: C2 + C4-E4-G4-Bb4
   const notes = chordToMidiNotes("C7", "C");
   assert.deepEqual(notes, [36, 60, 64, 67, 70]);
});

test("chordToMidiNotes handles maj7 chords", () => {
   // Cmaj7: C2 + C4-E4-G4-B4
   const notes = chordToMidiNotes("Cmaj7", "C");
   assert.deepEqual(notes, [36, 60, 64, 67, 71]);
});

test("chordToMidiNotes handles m7 chords", () => {
   // Cm7: C2 + C4-Eb4-G4-Bb4
   const notes = chordToMidiNotes("Cm7", "C");
   assert.deepEqual(notes, [36, 60, 63, 67, 70]);
});

test("chordToMidiNotes handles slash chords (bass note)", () => {
   // G/B: B2 bass + G4-B4-D5 triad
   const notes = chordToMidiNotes("G/B", "C");
   assert.ok(notes.length === 4);
   assert.equal(notes[0], 47); // Bass B2
   assert.ok(notes.includes(67)); // G4 root
});

test("chordToMidiNotes handles sus2 chords", () => {
   // Csus2: C2 + C4-D4-G4
   const notes = chordToMidiNotes("Csus2", "C");
   assert.deepEqual(notes, [36, 60, 62, 67]);
});

test("chordToMidiNotes handles sus4 chords", () => {
   // Csus4: C2 + C4-F4-G4
   const notes = chordToMidiNotes("Csus4", "C");
   assert.deepEqual(notes, [36, 60, 65, 67]);
});

test("chordToMidiNotes handles diminished chords (°)", () => {
   // C°: C2 + C4-Eb4-Gb4
   const notes = chordToMidiNotes("C°", "C");
   assert.deepEqual(notes, [36, 60, 63, 66]);
});

test("chordToMidiNotes handles augmented chords (+)", () => {
   // C+: C2 + C4-E4-G#4
   const notes = chordToMidiNotes("C+", "C");
   assert.deepEqual(notes, [36, 60, 64, 68]);
});

test("chordToMidiNotes handles half-diminished chords (ø7)", () => {
   // Cø7: C2 + C4-Eb4-Gb4-Bb4
   const notes = chordToMidiNotes("Cø7", "C");
   assert.deepEqual(notes, [36, 60, 63, 66, 70]);
});

test("chordToMidiNotes handles add9 chords", () => {
   // Cadd9: C2 + C4-E4-G4 + D4 (the 9th is a whole tone above the root)
   const notes = chordToMidiNotes("Cadd9", "C");
   assert.ok(notes.includes(36)); // C2 bass
   assert.ok(notes.includes(60)); // C4 root
   assert.ok(notes.includes(64)); // E
   assert.ok(notes.includes(67)); // G
   assert.ok(notes.includes(62)); // D (add9)
});

test("chordToMidiNotes handles sharp accidentals", () => {
   // C#m: C#2 + C#4-E4-G#4
   const notes = chordToMidiNotes("C#m", "C");
   assert.deepEqual(notes, [37, 61, 64, 68]);
});

test("chordToMidiNotes handles flat accidentals", () => {
   // Bbm: Bb2 + Bb4-Db4-F4
   const notes = chordToMidiNotes("Bbm", "C");
   assert.deepEqual(notes, [46, 70, 73, 77]);
});

test("chordToMidiNotes handles unicode sharp accidentals", () => {
   // C♯m: C♯2 + C♯4-E4-G♯4
   const notes = chordToMidiNotes("C♯m", "C");
   assert.deepEqual(notes, [37, 61, 64, 68]);
});

test("chordToMidiNotes handles unicode flat accidentals", () => {
   // B♭m: B♭2 + B♭4-D♭4-F4
   const notes = chordToMidiNotes("B♭m", "C");
   assert.deepEqual(notes, [46, 70, 73, 77]);
});

test("chordToMidiNotes returns empty array for empty chord", () => {
   const notes = chordToMidiNotes("", "C");
   assert.deepEqual(notes, []);
});

test("chordToMidiNotes returns empty array for invalid chord", () => {
   const notes = chordToMidiNotes("XYZ", "C");
   assert.deepEqual(notes, []);
});

test("chordToMidiNotes returns empty array for invalid input", () => {
   const notes = chordToMidiNotes("invalid-chord-123", "C");
   assert.deepEqual(notes, []);
});

// ---- Nashville number resolution ----

test("chordToMidiNotes resolves Nashville numbers to single MIDI note", () => {
   // In C: 1 = C(60)
   const notes = chordToMidiNotes("1", "C");
   assert.deepEqual(notes, [60]);
});

test("chordToMidiNotes resolves Nashville degree 5 to G in C", () => {
   // In C: 5 = G(67)
   const notes = chordToMidiNotes("5", "C");
   assert.deepEqual(notes, [67]);
});

test("chordToMidiNotes resolves Nashville degree 3 to E in C", () => {
   // In C: 3 = E(64)
   const notes = chordToMidiNotes("3", "C");
   assert.deepEqual(notes, [64]);
});

test("chordToMidiNotes resolves Nashville degree 4 to F in C", () => {
   // In C: 4 = F(65)
   const notes = chordToMidiNotes("4", "C");
   assert.deepEqual(notes, [65]);
});

test("chordToMidiNotes resolves Nashville degree 2 to D in C", () => {
   // In C: 2 = D(62)
   const notes = chordToMidiNotes("2", "C");
   assert.deepEqual(notes, [62]);
});

test("chordToMidiNotes resolves Nashville degree 6 to A in C", () => {
   // In C: 6 = A(69)
   const notes = chordToMidiNotes("6", "C");
   assert.deepEqual(notes, [69]);
});

test("chordToMidiNotes resolves Nashville degree 7 to B in C", () => {
   // In C: 7 = B(71)
   const notes = chordToMidiNotes("7", "C");
   assert.deepEqual(notes, [71]);
});

test("chordToMidiNotes handles Nashville upper octave dot (1̇)", () => {
   // In C: 1̇ = C one octave higher = C(72)
   const notes = chordToMidiNotes("1\u0307", "C");
   assert.deepEqual(notes, [72]);
});

test("chordToMidiNotes handles Nashville lower octave dot (1̣)", () => {
   // In C: 1̣ = C one octave lower = C(48)
   const notes = chordToMidiNotes("1\u0323", "C");
   assert.deepEqual(notes, [48]);
});

test("chordToMidiNotes handles Nashville accidental flat (♭3)", () => {
   // In C: ♭3 = Eb(63) - half step down from E
   const notes = chordToMidiNotes("♭3", "C");
   assert.deepEqual(notes, [63]);
});

test("chordToMidiNotes handles Nashville accidental sharp (#4)", () => {
   // In C: #4 = F#(66) - half step up from F
   const notes = chordToMidiNotes("#4", "C");
   assert.deepEqual(notes, [66]);
});

test("chordToMidiNotes: Nashville in different keys - G", () => {
   // In G: 1 = G(67)
   const notes = chordToMidiNotes("1", "G");
   assert.deepEqual(notes, [67]);
});

test("chordToMidiNotes: Nashville in different keys - D", () => {
   // In D: 1 = D(62)
   const notes = chordToMidiNotes("1", "D");
   assert.deepEqual(notes, [62]);
});

test("chordToMidiNotes: Nashville in different keys - A", () => {
   // In A: 1 = A(69)
   const notes = chordToMidiNotes("1", "A");
   assert.deepEqual(notes, [69]);
});

test("chordToMidiNotes: Nashville with flat key (Bb)", () => {
   // In Bb: 1 = Bb(70) — Bb sits at octave 4 (C4 = 60), same as every other key.
   const notes = chordToMidiNotes("1", "B♭");
   assert.deepEqual(notes, [70]);
});

test("chordToMidiNotes: Nashville with flat key (Db)", () => {
   // In Db: 1 = Db(61)
   const notes = chordToMidiNotes("1", "D♭");
   assert.deepEqual(notes, [61]);
});

test("chordToMidiNotes: Nashville with flat key (Eb)", () => {
   // In Eb: 1 = Eb(63)
   const notes = chordToMidiNotes("1", "E♭");
   assert.deepEqual(notes, [63]);
});

test("chordToMidiNotes: Nashville with flat key (F#)", () => {
   // In F#: 1 = F#(66)
   const notes = chordToMidiNotes("1", "F♯");
   assert.deepEqual(notes, [66]);
});

test("chordToMidiNotes ignores Nashville quality suffix", () => {
   // 1m should return same as 1 (ignore the 'm' quality)
   const notes1 = chordToMidiNotes("1", "C");
   const notes1m = chordToMidiNotes("1m", "C");
   assert.deepEqual(notes1, notes1m);
});

test("chordToMidiNotes ignores Nashville 7 quality suffix", () => {
   // 17 should return same as 1 (ignore the '7' quality)
   const notes1 = chordToMidiNotes("1", "C");
   const notes17 = chordToMidiNotes("17", "C");
   assert.deepEqual(notes1, notes17);
});

test("chordToMidiNotes: Nashville with octave + accidental (♭3̇)", () => {
   // ♭3̇ in C: 3 = E(64), ♭ = Eb(63), ̇ = octave up
   const notes = chordToMidiNotes("♭3\u0307", "C");
   assert.deepEqual(notes, [75]); // Eb one octave up
});

test("chordToMidiNotes: Nashville with octave + accidental (#5̣)", () => {
   // #5̣ in C: 5 = G(67), # = G#(68), ̣ = octave down
   const notes = chordToMidiNotes("#5\u0323", "C");
   assert.deepEqual(notes, [56]); // G# one octave down
});

// ---- Frequency conversion ----

test("chordToFrequencies converts chords to Hz arrays", () => {
   const freqs = chordToFrequencies("C", "C");
   assert.ok(Array.isArray(freqs));
   assert.equal(freqs.length, 4); // C2 bass + C4-E4-G4 triad
   assert.ok(freqs.every(f => typeof f === "number"));
   // C2(36) ≈ 65.41 Hz, C4(60) ≈ 261.63 Hz, E4(64) ≈ 329.63 Hz, G4(67) ≈ 392 Hz
   assert.ok(freqs[0] > 64.5 && freqs[0] < 66);
   assert.ok(freqs[1] > 260 && freqs[1] < 263);
   assert.ok(freqs[2] > 329 && freqs[2] < 330);
   assert.ok(freqs[3] > 391 && freqs[3] < 393);
});

test("chordToFrequencies handles Nashville numbers", () => {
   const freqs = chordToFrequencies("5", "C");
   assert.ok(Array.isArray(freqs));
   assert.equal(freqs.length, 1);
   // G(67) ≈ 392 Hz
   assert.ok(freqs[0] > 391 && freqs[0] < 393);
});

test("chordToFrequencies returns empty for invalid chord", () => {
   const freqs = chordToFrequencies("INVALID", "C");
   assert.deepEqual(freqs, []);
});

test("chordToFrequencies returns empty for empty chord", () => {
   const freqs = chordToFrequencies("", "C");
   assert.deepEqual(freqs, []);
});

// ---- Edge cases ----

test("chordToMidiNotes handles very high chords (F#m add9)", () => {
   const notes = chordToMidiNotes("F#madd9", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length > 0);
   assert.ok(notes.every(n => typeof n === "number"));
});

test("chordToMidiNotes: complex slash chord (Am7/G)", () => {
   const notes = chordToMidiNotes("Am7/G", "C");
   assert.ok(Array.isArray(notes));
   // Should have bass G + Am7 triad (at least 4 notes)
   assert.ok(notes.length >= 4);
   // Bass note should be lower than other notes
   assert.ok(notes[0] < notes[1]);
});

test("chordToMidiNotes: very complex slash chord (F#m7/A)", () => {
   const notes = chordToMidiNotes("F#m7/A", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length >= 4);
});

test("chordToMidiNotes handles multiple accidentals in complex chords", () => {
   const notes = chordToMidiNotes("B♭maj7", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length > 0);
   assert.equal(notes[0], 46); // Bb2 bass
});

test("chordToMidiNotes: 6th chords", () => {
   const notes = chordToMidiNotes("C6", "C");
   assert.ok(notes.includes(36)); // C2 bass
   assert.ok(notes.includes(60)); // C4
   assert.ok(notes.includes(64)); // E
   assert.ok(notes.includes(67)); // G
   assert.ok(notes.includes(69)); // A (6th)
});

test("chordToMidiNotes: m6 chords", () => {
   const notes = chordToMidiNotes("Cm6", "C");
   assert.ok(notes.includes(36)); // C2 bass
   assert.ok(notes.includes(60)); // C4
   assert.ok(notes.includes(63)); // Eb
   assert.ok(notes.includes(67)); // G
   assert.ok(notes.includes(69)); // A (6th)
});

test("chordToMidiNotes: 9th chords", () => {
   const notes = chordToMidiNotes("C9", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length > 3); // More than basic triad
});

test("chordToMidiNotes: m9 chords", () => {
   const notes = chordToMidiNotes("Cm9", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length > 3);
});

test("chordToMidiNotes: 13th chords", () => {
   const notes = chordToMidiNotes("C13", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length > 3);
});

test("chordToMidiNotes: 7b9 chords", () => {
   const notes = chordToMidiNotes("C7b9", "C");
   assert.ok(Array.isArray(notes));
   assert.ok(notes.length >= 4);
});

// ---- Key-relative resolution ----

test("chordToMidiNotes: transposition - Nashville 1 in different keys", () => {
   const noteC = chordToMidiNotes("1", "C")[0];
   const noteG = chordToMidiNotes("1", "G")[0];
   const noteF = chordToMidiNotes("1", "F")[0];
   
   // Should all be different
   assert.notEqual(noteC, noteG);
   assert.notEqual(noteG, noteF);
   assert.notEqual(noteC, noteF);
   
   // C=60, G=67, F=65
   assert.equal(noteC, 60);
   assert.equal(noteG, 67);
   assert.equal(noteF, 65);
});

test("chordToMidiNotes: transposition - Nashville 5 in different keys", () => {
   const noteC = chordToMidiNotes("5", "C")[0]; // G=67
   const noteG = chordToMidiNotes("5", "G")[0]; // D=62
   
   assert.notEqual(noteC, noteG);
   assert.equal(noteC, 67);
   assert.equal(noteG, 62);
});

// ---- Integration tests ----

test("chordToMidiNotes and chordToFrequencies produce consistent results", () => {
   const chord = "Am7";
   const key = "C";
   
   const notes = chordToMidiNotes(chord, key);
   const freqs = chordToFrequencies(chord, key);
   
   assert.equal(notes.length, freqs.length);
   assert.ok(notes.every(n => typeof n === "number"));
   assert.ok(freqs.every(f => typeof f === "number"));
});

test("chordToMidiNotes with various keys consistency", () => {
   // Same chord quality should have same intervals
   const notesC = chordToMidiNotes("Cm7", "C");
   const notesG = chordToMidiNotes("Gm7", "C");
   
   // Both should be Cm7 and Gm7 respectively (5 notes: bass + 4 chord tones)
   assert.equal(notesC.length, 5);
   assert.equal(notesG.length, 5);
   
   // Intervals should be same
   const intervalsC = [notesC[1] - notesC[0], notesC[2] - notesC[1], notesC[3] - notesC[2]];
   const intervalsG = [notesG[1] - notesG[0], notesG[2] - notesG[1], notesG[3] - notesG[2]];
   
   assert.deepEqual(intervalsC, intervalsG);
});

test("chordToMidiNotes slash chord placement", () => {
   // D/F# should have F# as bass (lowest note)
   const notes = chordToMidiNotes("D/F#", "C");
   
   // F# bass is MIDI 42 (F#2), D root is MIDI 62 (D4)
   assert.equal(notes[0], 42);
   assert.ok(notes.includes(62)); // D root
});

test("chordToMidiNotes all major chords in C major scale", () => {
   // C, D, E, F, G, A, B major chords in key of C
   const keys = ["C", "D", "E", "F", "G", "A", "B"];
   const allNotes = keys.map(k => chordToMidiNotes(k, "C"));
   
   // All should produce a low bass + triad (4 notes each)
   allNotes.forEach(notes => {
      assert.equal(notes.length, 4);
      assert.ok(notes.every(n => typeof n === "number"));
   });
});

// ---- noteNameToMidi (Salamander sample names) ----

test("noteNameToMidi parses sharp-suffix names", () => {
   assert.equal(noteNameToMidi("A0"), 21);
   assert.equal(noteNameToMidi("C8"), 108);
   assert.equal(noteNameToMidi("Ds4"), 63);
   assert.equal(noteNameToMidi("Fs3"), 54);
});

test("noteNameToMidi still parses flat names", () => {
   assert.equal(noteNameToMidi("Gb4"), 66);
   assert.equal(noteNameToMidi("Eb3"), 51);
   assert.equal(noteNameToMidi("Bb2"), 46);
});

test("noteNameToMidi returns null for invalid names", () => {
   assert.equal(noteNameToMidi("H4"), null);
   assert.equal(noteNameToMidi(""), null);
   assert.equal(noteNameToMidi("C-1"), null);
});

// ---- Quality aliases + extended voicings (Bm7♭5 etc.) ----------------------

test("alias spellings sound exactly like their canonical symbol", () => {
   // The reported case: `Bm7♭5` (offered by the bank as `Bø7`) used to fall back to a
   // plain B major triad. Every half-diminished spelling must voice the same notes.
   const halfDim = chordToMidiNotes("Bø7", "B");
   assert.deepEqual(halfDim, [47, 71, 74, 77, 81]);
   for (const spelling of ["Bm7♭5", "Bm7b5", "Bmin7b5", "Bø", "Bo7"]) {
      assert.deepEqual(chordToMidiNotes(spelling, "B"), halfDim, spelling);
   }
   assert.deepEqual(chordToMidiNotes("Bdim", "B"), chordToMidiNotes("B°", "B"));
   assert.deepEqual(chordToMidiNotes("Baug", "B"), chordToMidiNotes("B+", "B"));
   assert.deepEqual(chordToMidiNotes("Bmin7", "B"), chordToMidiNotes("Bm7", "B"));
   assert.deepEqual(chordToMidiNotes("Bma7", "B"), chordToMidiNotes("Bmaj7", "B"));
   assert.deepEqual(chordToMidiNotes("BΔ7", "B"), chordToMidiNotes("Bmaj7", "B"));
});

test("extended qualities keep their colour instead of falling back to major", () => {
   assert.deepEqual(chordToMidiNotes("Bmaj9", "B"), [47, 71, 75, 78, 82, 85]);
   assert.deepEqual(chordToMidiNotes("B6/9", "B"), [47, 71, 75, 78, 80, 85]);
   assert.deepEqual(chordToMidiNotes("B7sus4", "B"), [47, 71, 76, 78, 81]);
   assert.deepEqual(chordToMidiNotes("Bdim7", "B"), [47, 71, 74, 77, 80]);
   assert.deepEqual(chordToMidiNotes("Baug7", "B"), [47, 71, 75, 79, 81]);
   // A custom suffix we don't know still makes a sound (major fallback), never silence.
   assert.deepEqual(chordToMidiNotes("Bxyz", "B"), chordToMidiNotes("B", "B"));
   // ...and an unreadable root stays silent (nothing to voice).
   assert.deepEqual(chordToMidiNotes("H7", "B"), []);
});

// ---- Chord row above the numbers (section.chordAboveBeats) -----------------
test("resolveEntryNotes keeps the old behavior when the chord row is empty", () => {
   // Letter chord → historical voicing; number alone → historical single note.
   assert.deepEqual(resolveEntryNotes({ chord: "C" }, "C"), [36, 60, 64, 67]);
   assert.deepEqual(resolveEntryNotes({ chord: "1" }, "C"), [60]);
   assert.deepEqual(resolveEntryNotes({ chord: null, chordAbove: null }, "C"), []);
   assert.deepEqual(resolveEntryNotes(undefined, "C"), []);
});

test("resolveEntryNotes lets an empty beat sound its chord row instead of clicking", () => {
   // G2 + G4-B4-D5 — the scheduler plays notes whenever this array is non-empty.
   assert.deepEqual(resolveEntryNotes({ chord: null, chordAbove: "G" }, "C"), [43, 67, 71, 74]);
   assert.deepEqual(resolveEntryFrequencies({}, "C"), []);
});

test("resolveEntryNotes lifts the number one octave above its chord", () => {
   // 1 + chord C above → C2 bass, C4-E4-G4 harmony, and the number as C5 (72).
   assert.deepEqual(resolveEntryNotes({ chord: "1", chordAbove: "C" }, "C"), [36, 60, 64, 67, 72]);
   // In G: 5 is D, so the melody is D5 while the D chord sits below it.
   assert.deepEqual(resolveEntryNotes({ chord: "5", chordAbove: "D" }, "G"), [38, 62, 66, 69, 74]);
   // Octave markers still apply BEFORE the lift: 1̣ = C3 → lifted to C4, which is
   // already a chord tone here, so de-duplication leaves the union at 4 notes.
   assert.deepEqual(resolveEntryNotes({ chord: "1̣", chordAbove: "C" }, "C"), [36, 60, 64, 67]);
   // ...while 1̇ = C5 lifts to C6 and stays clearly above the triad.
   assert.deepEqual(resolveEntryNotes({ chord: "1̇", chordAbove: "C" }, "C"), [36, 60, 64, 67, 84]);
});

test("resolveEntryNotes stacks both voicings when both rows hold chords", () => {
   // G on the beat + C above → both voicings, with shared notes played once.
   assert.deepEqual(
      resolveEntryNotes({ chord: "G", chordAbove: "C" }, "C"),
      [36, 43, 60, 64, 67, 71, 74],
   );
});

test("resolveEntryFrequencies converts the resolved notes to Hz", () => {
   const freqs = resolveEntryFrequencies({ chord: "1", chordAbove: "C" }, "C");
   assert.equal(freqs.length, 5);
   // freqs[1] is C4 = MIDI 60 → 261.626 Hz.
   assert.ok(Math.abs(freqs[1] - 261.6255653005986) < 1e-6, `unexpected ${freqs[1]}`);
   assert.deepEqual(resolveEntryFrequencies({ chord: "1" }, "C"), [261.6255653005986]);
});

test("buildPlaybackQueue carries the chord row into subdivisions", () => {
   const section = {
      id: "s1",
      bars: 1,
      beats: {
         "0-0": { chord: "1", duration: "quarter" },
         "0-0:0": { chord: "1", duration: null },
      },
      // Only the base slot holds a cell (older/edited files): the children of the
      // split must inherit it rather than going silent.
      chordAboveBeats: { "0-0": "C" },
   };
   const queue = buildPlaybackQueue([section], 4);
   const first = queue.find((entry) => entry.slot === "0-0:0");
   assert.equal(first.chordAbove, "C");
   assert.equal(first.beatUnit, 0.25);
   // An empty beat stays empty (metronome click), and a slot without a rhythm
   // marker keeps beatUnit 1.
   const empty = queue.find((entry) => entry.slot === "0-1");
   assert.equal(empty.chord, null);
   assert.equal(empty.chordAbove, null);
   assert.equal(empty.beatUnit, 1);
   // A child with its own cell wins over the inherited one.
   section.chordAboveBeats["0-0:1"] = "G";
   const next = buildPlaybackQueue([section], 4);
   assert.equal(next.find((entry) => entry.slot === "0-0:1").chordAbove, "G");
   assert.equal(next.find((entry) => entry.slot === "0-0:2").chordAbove, "C");
});

