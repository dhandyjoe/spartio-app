import { currentUser, ensureFirebase, requireUser, sdk } from "./runtime.js?v=__BUILD__";
import { normalizeEditorMode } from "../../notation/notation.js?v=__BUILD__";
import { SUMMARY_REV } from "./constants.js?v=__BUILD__";

// Firestore CRUD.
// Reference helpers for the current user's library.
function songsCollection() {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "users", currentUser.uid, "songs");
}
function songRef(songId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(songsCollection(), songId);
}
function versionsCollection(songId) {
   const { db, dbFns } = sdk;
   return dbFns.collection(songsCollection(), songId, "versions");
}
function versionRef(songId, versionId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(versionsCollection(songId), versionId);
}

// A song document that still carries the whole project inline is a legacy
// (pre-version) doc — it has a `sections` array directly on the song doc.
// Exported so the pure unit tests can exercise the detection logic.
export function isLegacySongDoc(data) {
   return Boolean(data) && Array.isArray(data.sections);
}

// Compose the editor-ready project from song metadata + one version document.
// The result has EXACTLY the same shape as the pre-version projectData(), so the
// editor, playback and the PDF/export pipeline are untouched by the version model.
export function composeSong(songMeta, version) {
   const project = { ...version };
   delete project.label;
   delete project.number;
   delete project.versionId;
   delete project.createdAt;
   delete project.updatedAt;
   delete project.cloudId;
   delete project.songId;
   // NOTE: the YouTube link is NOT dropped here any more. Each arrangement owns its own link
   // (`youtubeUrl`/`youtubeId` live on the version document), so the editor document must carry
   // it: that is what makes a later "Save to Cloud" write the SAME link back instead of erasing
   // the version's link. See youtubeFields() in youtube.js.
   project.title = songMeta?.title || project.title || "Song Title";
   project.artist = songMeta?.artist !== undefined ? songMeta.artist : project.artist ?? "Artist / Composer";
   return project;
}

// Song metadata.

// Create a new song (metadata only — the first version is created by saveVersion).
export async function createSong(meta = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const now = Date.now();
   const ref = await dbFns.addDoc(songsCollection(), {
      title: meta.title || "Untitled",
      artist: meta.artist || "",
      createdAt: now,
      updatedAt: now,
   });
   return { songId: ref.id };
}

// Patch a song's metadata (merge). Timestamp is always bumped.
export async function updateSongMeta(songId, patch = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const clean = { ...patch };
   delete clean.songId;
   delete clean.cloudId;
   await dbFns.setDoc(songRef(songId), { ...clean, updatedAt: Date.now() }, { merge: true });
}

// Load a song's metadata. Legacy flat docs are upgraded to the new model first,
// so callers always see the post-migration shape.
export async function loadSongMeta(songId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(songRef(songId));
   if (!snapshot.exists()) throw new Error("Song not found.");
   const data = snapshot.data();
   if (isLegacySongDoc(data)) {
      const migrated = await tryMigrateLegacySong(songId, data);
      if (migrated) {
         const after = await dbFns.getDoc(songRef(songId));
         return { songId, ...after.data() };
      }
      // Upgrade failed (rules still deny the subcollection) — keep serving the
      // flat doc as a single implicit arrangement. The `legacy` flag lets
      // callers compose it directly instead of asking for a "first version".
      return { songId, ...data, legacy: true };
   }
   return { songId, ...data };
}
// Versions, one Firestore document per arrangement.

// Create or update a version of a song.
//   - versionId === null → create: auto `number = max existing + 1`.
//   - `data` is the full serializable project (same shape as projectData()).
//   - `label`/`number` are the version's own metadata; label falls back to
//     "Version 1" on create and is kept untouched on update unless provided.
// Returns { versionId, label, number }.
export async function saveVersion(songId, versionId, data = {}, { label, number, createdAt, updatedAt } = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const now = Date.now();
   if (versionId) {
      const patch = { ...data, updatedAt: now };
      delete patch.cloudId;
      delete patch.songId;
      delete patch.versionId;
      // An explicit "no link" (null) removes the fields instead of storing nulls.
      if (Object.prototype.hasOwnProperty.call(data, "youtubeUrl") && patch.youtubeUrl === null) {
         patch.youtubeUrl = dbFns.deleteField();
      }
      if (Object.prototype.hasOwnProperty.call(data, "youtubeId") && patch.youtubeId === null) {
         patch.youtubeId = dbFns.deleteField();
      }
      if (label !== undefined) patch.label = label;
      if (number !== undefined) patch.number = number;
      await dbFns.setDoc(versionRef(songId, versionId), patch, { merge: true });
      return { versionId, label: patch.label ?? data.label, number: patch.number ?? data.number };
   }
   const nextNumber = typeof number === "number" && number > 0 ? number : await nextVersionNumber(songId);
   const resolvedLabel = (label !== undefined ? label : data.label) || "Version 1";
   // Copies (album "Add from My Songs", "Save a copy") pass the SOURCE timestamps
   // so the duplicated library keeps the same recency order as the original; a
   // brand-new arrangement (the editor's first save) carries neither and gets now.
   const payload = {
      ...data,
      label: resolvedLabel,
      number: nextNumber,
      createdAt: createdAt ?? data.createdAt ?? now,
      updatedAt: updatedAt ?? data.updatedAt ?? now,
   };
   delete payload.cloudId;
   delete payload.songId;
   delete payload.versionId;
   // "No link" is the ABSENCE of the fields, never a stored null (same rule as the update path),
   // so `youtubeId` in a version document always means "this arrangement has a video".
   if (payload.youtubeUrl === null) delete payload.youtubeUrl;
   if (payload.youtubeId === null) delete payload.youtubeId;
   const ref = await dbFns.addDoc(versionsCollection(songId), payload);
   return { versionId: ref.id, label: resolvedLabel, number: nextNumber };
}

// Load one full version document.
export async function loadVersion(songId, versionId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(versionRef(songId, versionId));
   if (!snapshot.exists()) throw new Error("Version not found.");
   return { versionId: snapshot.id, ...snapshot.data() };
}

// Order version summaries by RECENCY: the most recently UPDATED arrangement comes
// first (so a freshly created version — or one just edited — lands at the top of
// the list), with the highest version `number` as the tiebreak when two share an
// `updatedAt` (e.g. a copied song whose versions were saved in the same
// millisecond, or documents migrated before `updatedAt` existed). Pure + exported
// so the ordering rule is unit-tested once and shared by both list functions.
export function sortVersionsByRecency(versions) {
   return versions
      .slice()
      .sort(
         (a, b) =>
            (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0) ||
            (Number(b.number) || 0) - (Number(a.number) || 0),
      );
}

// Lightweight version summaries (label/number/editorMode), most recently updated first.
export async function listVersions(songId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   // Tanpa orderBy: Cloud Firestore secara DIAM-DIAM mengecualikan dokumen yang
   // tidak memiliki field yang dipakai untuk sorting (number). Akibatnya versi
   // yang field `number`-nya hilang (mis. data hasil migrasi/copy lama) jadi
   // tak terlihat di dropdown. Ambil semuanya lalu urutkan di sisi client.
   const snapshot = await dbFns.getDocs(versionsCollection(songId));
   const versions = snapshot.docs.map((snap) => {
      const data = snap.data();
      return {
         versionId: snap.id,
         label: data.label || "",
         number: data.number,
         updatedAt: data.updatedAt,
         youtubeId: data.youtubeId || "",
         editorMode: normalizeEditorMode(data.editorMode),
         key: data.key || "",
         meter: data.meter || "",
         bpm: Number(data.bpm) || "",
      };
   });
   // Paling baru di-update dulu (bukan nomor versi terbesar) supaya version yang
   // baru dibuat / baru diedit muncul di atas; dokumen tanpa `updatedAt` dianggap 0.
   return sortVersionsByRecency(versions);
}

// Delete one version, then re-point the song metadata at the new latest version.
// Returns { versionId } of the new latest, or { versionId: null } when the song
// has no versions left — the song itself survives (Opsi A).
export async function deleteVersion(songId, versionId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   await dbFns.deleteDoc(versionRef(songId, versionId));
   return recomputeLatestMeta(songId);
}

// Highest existing version number + 1 (1 when no versions exist).
async function nextVersionNumber(songId) {
   const versions = await listVersions(songId);
   const highest = versions.reduce((max, v) => Math.max(max, Number(v.number) || 0), 0);
   return highest + 1;
}

// After a deletion (or when a song loses its last version), refresh the
// denormalized "latest version" fields on the song doc.
async function recomputeLatestMeta(songId) {
   const { dbFns } = sdk;
   const versions = await listVersions(songId);
   if (!versions.length) {
      await dbFns.setDoc(
         songRef(songId),
         {
            latestVersionId: dbFns.deleteField(),
            latestVersionLabel: dbFns.deleteField(),
            latestEditorMode: dbFns.deleteField(),
            latestYoutubeId: dbFns.deleteField(),
            versionCount: 0,
            updatedAt: Date.now(),
         },
         { merge: true },
      );
      return { versionId: null };
   }
   const latest = versions[0];
   await writeLatestMeta(
      songId,
      latest.versionId,
      latest.label || "",
      versions.length,
      latest.editorMode,
      latest.youtubeId,
      latest.key,
      latest.meter,
      latest.bpm,
   );
   return { versionId: latest.versionId };
}

// Denormalize the "latest version" summary that powers the song list, so listing
// the library never needs a per-song version read.
async function writeLatestMeta(
   songId,
   latestVersionId,
   latestVersionLabel,
   versionCount,
   latestEditorMode,
   latestYoutubeId,
   latestKey,
   latestMeter,
   latestBPM,
) {
   const { dbFns } = sdk;
   await dbFns.setDoc(
      songRef(songId),
      {
         latestVersionId,
         latestVersionLabel,
         versionCount,
         latestEditorMode: normalizeEditorMode(latestEditorMode),
         ...(latestYoutubeId ? { latestYoutubeId } : { latestYoutubeId: dbFns.deleteField() }),
         latestKey: latestKey || "",
         latestMeter: latestMeter || "",
         latestBPM: Number(latestBPM) || "",
         latestSummaryRev: SUMMARY_REV,
         updatedAt: Date.now(),
      },
      { merge: true },
   );
}

// Public wrapper for writeLatestMeta — used when a (first) version is created and
// must immediately become the song's "latest" on the metadata.
export async function updateLatestVersion(songId, versionId, label, count, editorMode, youtubeId, key, meter, bpm) {
   await ensureFirebase();
   requireUser();
   await writeLatestMeta(songId, versionId, label || "", count, editorMode, youtubeId, key, meter, bpm);
}
// Legacy flat-document upgrade.

// A pre-version song doc held the whole project inline. Upgrade it in place:
// move the arrangement into versions/v1 and keep only metadata on the song doc.
async function migrateLegacySong(songId, legacyData) {
   const { dbFns } = sdk;
   const now = Date.now();
   const versionDoc = { ...legacyData };
   delete versionDoc.cloudId;
   delete versionDoc.songId;
   delete versionDoc.versionId;
   delete versionDoc.createdAt;
   delete versionDoc.updatedAt;
   const payload = {
      ...versionDoc,
      label: "Version 1",
      number: 1,
      title: legacyData.title || "Untitled",
      artist: legacyData.artist || "",
      createdAt: legacyData.createdAt || now,
      updatedAt: legacyData.updatedAt || now,
   };
   await dbFns.setDoc(versionRef(songId, VERSION_ONE_ID), payload);
   await dbFns.setDoc(songRef(songId), {
      title: payload.title,
      artist: payload.artist,
      createdAt: payload.createdAt,
      updatedAt: now,
      versionCount: 1,
      latestVersionId: VERSION_ONE_ID,
      latestVersionLabel: "Version 1",
      latestEditorMode: normalizeEditorMode(legacyData.editorMode),
      latestKey: legacyData.key || "",
      latestMeter: legacyData.meter || "",
      latestBPM: Number(legacyData.bpm) || "",
   });
}

// Attempt the lazy legacy upgrade. Returns true when migrated; false when the
// upgrade cannot run (e.g. Firestore rules not yet covering the versions
// subcollection) — callers then keep serving the flat document as-is so the
// library is never hidden by a failed upgrade.
async function tryMigrateLegacySong(songId, legacyData) {
   try {
      await migrateLegacySong(songId, legacyData);
      return true;
   } catch (error) {
      return false;
   }
}

// Library CRUD retained for the current UI while callers migrate to song and version APIs.

// Create or update a song + its (single) version in one call — the Save-to-Cloud
// flow used today. When project.cloudId is present the existing song is updated
// (legacy docs are upgraded on the fly); otherwise a new song with its first
// version is created. Returns the song's document id.
export async function saveSong(project = {}, { versionLabel } = {}) {
   await ensureFirebase();
   requireUser();
   const title = project.title || "Untitled";
   const artist = project.artist || "";
   const data = { ...project };
   delete data.cloudId;
   delete data.songId;
   delete data.versionId;
   if (project.cloudId) {
      const songId = project.cloudId;
      const meta = await loadSongMeta(songId);
      if (meta.latestVersionId) {
         await saveVersion(songId, meta.latestVersionId, data, { label: meta.latestVersionLabel });
      } else {
         // Song exists but currently has no versions (last one was deleted) —
         // this save becomes its (new) first version.
         const created = await saveVersion(songId, null, data, { label: versionLabel || "Version 1" });
         await writeLatestMeta(songId, created.versionId, created.label, 1, data.editorMode, undefined, data.key, data.meter, data.bpm);
      }
      await updateSongMeta(songId, { title, artist });
      return songId;
   }
   const createdSong = await createSong({ title, artist });
   const createdVersion = await saveVersion(createdSong.songId, null, data, { label: versionLabel || "Version 1" });
   await writeLatestMeta(createdSong.songId, createdVersion.versionId, createdVersion.label, 1, data.editorMode, undefined, data.key, data.meter, data.bpm);
   return createdSong.songId;
}

// The song document carries a denormalized summary of its latest arrangement
// (mode, key, meter, tempo). Documents written before a field existed — or
// before the summary was refreshed — can disagree with the arrangement that is
// actually stored. `SUMMARY_REV` marks a summary that has been verified against
// the latest version; songs without the marker are checked once, then repaired
// in place, so the library shows the real mode and tempo of every arrangement.
/**
 * Fold the latest arrangement's own fields into a song summary. The VERSION
 * document is the source of truth: a Nashville arrangement stored under an old
 * mode id is repaired to "numbers" here instead of falling back to "chords".
 * Pure and exported so the rule is unit-tested.
 * Returns the patch to write back to the song document.
 */
export function applyVersionSummary(song, version = {}) {
   const patch = {};
   if (version.editorMode) {
      const mode = normalizeEditorMode(version.editorMode);
      if (song.latestEditorMode !== mode) {
         song.latestEditorMode = mode;
         patch.latestEditorMode = mode;
      }
   }
   // 120 is the editor's default tempo, so a version that never stored one is
   // reported as 120 — the same value the editor shows.
   const bpm = Number(version.bpm ?? version.BPM) || 120;
   if (Number(song.latestBPM) !== bpm) {
      song.latestBPM = bpm;
      patch.latestBPM = bpm;
   }
   if (version.key && song.latestKey !== version.key) {
      song.latestKey = version.key;
      patch.latestKey = version.key;
   }
   if (version.meter && song.latestMeter !== version.meter) {
      song.latestMeter = version.meter;
      patch.latestMeter = version.meter;
   }
   return patch;
}

export async function backfillLatestSummary(songs, readVersion, writeSong) {
   const missing = songs.filter(
      (song) =>
         song.latestVersionId &&
         (song.latestSummaryRev !== SUMMARY_REV ||
            song.latestBPM === undefined ||
            song.latestBPM === null ||
            song.latestBPM === "" ||
            song.latestEditorMode === undefined ||
            !song.latestKey ||
            !song.latestMeter),
   );
   if (!missing.length) return songs;
   await Promise.all(
      missing.map(async (song) => {
         try {
            const data = await readVersion(song);
            if (!data) return;
            const patch = applyVersionSummary(song, data);
            song.latestSummaryRev = SUMMARY_REV;
            patch.latestSummaryRev = SUMMARY_REV;
            await writeSong(song, patch);
         } catch {
            /* offline or rules deny the read — the list stays usable without it */
         }
      }),
   );
   return songs;
}

// List all songs for the current user, newest-updated first. Returns metadata +
// the denormalized latest-version summary (no per-song version reads). Legacy
// flat docs are migrated lazily as they are encountered.
export async function listSongs() {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const q = dbFns.query(songsCollection(), dbFns.orderBy("updatedAt", "desc"));
   const snapshot = await dbFns.getDocs(q);
   const songs = [];
   for (const snap of snapshot.docs) {
      const data = snap.data();
      if (isLegacySongDoc(data)) {
         const migrated = await tryMigrateLegacySong(snap.id, data);
         if (migrated) {
            songs.push({
               cloudId: snap.id,
               songId: snap.id,
               title: data.title || "Untitled",
               artist: data.artist || "",
               updatedAt: Date.now(),
               versionCount: 1,
               latestVersionId: VERSION_ONE_ID,
               latestVersionLabel: "Version 1",
               latestBPM: data.bpm,
               latestSummaryRev: data.latestSummaryRev,
            });
         } else {
            // Upgrade not possible yet (rules not covering the subcollection):
            // serve the flat document so the library never appears empty.
            songs.push({
               cloudId: snap.id,
               songId: snap.id,
               title: data.title || "Untitled",
               artist: data.artist || "",
               updatedAt: data.updatedAt || Date.now(),
               sections: data.sections,
               key: data.key,
               meter: data.meter,
               bpm: data.bpm ?? data.BPM,
               editorMode: data.editorMode,
            });
         }
      } else {
         songs.push({
               cloudId: snap.id,
               songId: snap.id,
               title: data.title || "Untitled",
               artist: data.artist || "",
               updatedAt: data.updatedAt,
               versionCount: data.versionCount,
               latestVersionId: data.latestVersionId,
               latestVersionLabel: data.latestVersionLabel,
               latestYoutubeId: data.latestYoutubeId,
               latestEditorMode: data.latestEditorMode,
               latestKey: data.latestKey,
               latestMeter: data.latestMeter,
               latestBPM: data.latestBPM,
               latestSummaryRev: data.latestSummaryRev,
            });
      }
   }
   await backfillLatestSummary(
      songs,
      async (song) => {
         const snap = await dbFns.getDoc(versionRef(song.cloudId, song.latestVersionId));
         return snap.exists() ? snap.data() : null;
      },
      async (song, patch) => {
         await dbFns.setDoc(songRef(song.cloudId), patch, { merge: true });
      },
   );
   return songs;
}
// Load a song for the editor: metadata + the latest version, composed into the
// same project shape the editor has always consumed. Returns
// { cloudId, songId, versionId, label, updatedAt, ...project }. When the song has
// no versions left, returns a minimal blank draft with hasNoVersions: true so the
// UI can prompt for a first version (Opsi A).
export async function loadSong(cloudId) {
   await ensureFirebase();
   requireUser();
   const meta = await loadSongMeta(cloudId);
   if (meta.legacy) {
      // A flat legacy document that couldn't be upgraded yet — serve it whole.
      return { cloudId, songId: cloudId, versionId: null, label: "", ...meta };
   }
   if (!meta.latestVersionId) {
      return {
         cloudId,
         songId: cloudId,
         versionId: null,
         label: "",
         hasNoVersions: true,
         format: "chord-sheet",
         version: 2,
         title: meta.title || "Song Title",
         artist: meta.artist || "Artist / Composer",
         sections: [{ name: "Intro", bars: [] }],
      };
   }
   const version = await loadVersion(cloudId, meta.latestVersionId);
   return {
      cloudId,
      songId: cloudId,
      versionId: version.versionId,
      label: version.label || "",
      updatedAt: version.updatedAt,
      ...composeSong(meta, version),
   };
}

// Delete a song and EVERY version document under it (Firestore has no cascade).
export async function deleteSong(cloudId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDocs(versionsCollection(cloudId));
   await Promise.all(snapshot.docs.map((snap) => dbFns.deleteDoc(snap.ref)));
   await dbFns.deleteDoc(songRef(cloudId));
}

// Duplicate an existing song: metadata + every version, copied as-is into fresh
// documents (each copy keeps its SOURCE timestamps so the duplicate preserves the
// original's recency order). Returns the new song's id.
export async function duplicateSong(cloudId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const meta = await loadSongMeta(cloudId);
   const created = await createSong({ title: `${meta.title || "Untitled"} (copy)`, artist: meta.artist || "" });
   const newSongId = created.songId;
   const snapshot = await dbFns.getDocs(versionsCollection(cloudId));
   // Urutkan ascending di sisi client agar copy tidak kehilangan versi yang
   // field `number`-nya hilang (sama seperti listVersions).
   const versionDocs = snapshot.docs.slice().sort(
      (a, b) => (Number(a.data().number) || 0) - (Number(b.data().number) || 0),
   );
   let count = 0;
   for (const snap of versionDocs) {
      // Timestamps are carried over (NOT reset to now) so the copy keeps the same
      // "most recently updated first" order as its source.
      const copy = { ...snap.data() };
      delete copy.cloudId;
      delete copy.songId;
      delete copy.versionId;
      await dbFns.addDoc(versionsCollection(newSongId), copy);
      count += 1;
   }
   if (count) {
      // "Latest" = the copy with the newest `updatedAt` (so the duplicate's library
      // card shows the same mode as the source's topmost version).
      const top = (await listVersions(newSongId))[0];
      if (top) {
         await writeLatestMeta(newSongId, top.versionId, top.label || "", count, top.editorMode, top.youtubeId, top.key, top.meter, top.bpm);
      }
   } else {
      await updateSongMeta(newSongId, { versionCount: 0 });
   }
   return newSongId;
}

// Stable id used when a legacy flat song doc is upgraded to the new model.
const VERSION_ONE_ID = "v1";
