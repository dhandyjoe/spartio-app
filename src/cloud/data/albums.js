import { currentUser, ensureFirebase, requireUser, sdk } from "./runtime.js?v=__BUILD__";
import { normalizeEditorMode } from "../../notation/notation.js?v=__BUILD__";
import { SUMMARY_REV } from "./constants.js?v=__BUILD__";
import {
   backfillLatestSummary,
   composeSong,
   createSong,
   deleteSong,
   loadSong,
   loadSongMeta,
   loadVersion,
   listVersions,
   saveVersion,
   sortVersionsByRecency,
   updateSongMeta,
} from "./songs.js?v=__BUILD__";

// Shared albums with invite-code self-join.
// Audience: GKJ Nehemia — an owner-curated album of arrangements that every
// member can READ. Joining is self-service via a server-verified invite code
// (verified by Firestore security rules, NOT by client code).
//
// Data model:
//   albums/{albumId}                               → { name, description, createdBy,
//                                                      createdAt, updatedAt, songCount }
//   albums/{albumId}/songs/{songId}                → song metadata (same shape as a
//                                                      users/{uid}/songs/{songId} doc)
//   albums/{albumId}/songs/{songId}/versions/{id}  → ONE arrangement (same shape as
//                                                      user versions → editor untouched)
//   albums/{albumId}/members/{uid}                 → { uid, role: "owner"|"member",
//                                                      name, email, joinedAt, addedBy }
//   albums/{albumId}/invites/{code}                → { active, createdAt, createdBy }
//                                                      (doc ID = the invite code)
//   users/{uid}/albumMemberships/{albumId}         → enumerable pointer (existing
//                                                      users/{uid}/** rules already allow)

// Path helpers.
function albumsCollection() {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "albums");
}
function albumRef(albumId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "albums", albumId);
}
function albumSongsCollection(albumId) {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "albums", albumId, "songs");
}
function albumSongRef(albumId, songId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "albums", albumId, "songs", songId);
}
function albumVersionsCollection(albumId, songId) {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "albums", albumId, "songs", songId, "versions");
}
function albumVersionRef(albumId, songId, versionId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "albums", albumId, "songs", songId, "versions", versionId);
}
function membersCollection(albumId) {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "albums", albumId, "members");
}
function memberRef(albumId, uid) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "albums", albumId, "members", uid);
}
function inviteCodeRef(code) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "inviteCodes", code);
}
function myMembershipsCollection() {
   const { db, dbFns } = sdk;
   return dbFns.collection(db, "users", currentUser.uid, "albumMemberships");
}
function myMembershipRef(albumId) {
   const { db, dbFns } = sdk;
   return dbFns.doc(db, "users", currentUser.uid, "albumMemberships", albumId);
}

// Invite codes.
// Unambiguous alphabet: no I/O/0/1 so a code typed from a photo is never a guess.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateInviteCode() {
   const pick = (length) =>
      Array.from({ length }, () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]).join("");
   return `${pick(4)}-${pick(4)}`;
}
// Accept "7FQ3-XK2N" or "7FQ3XK2N"; returns canonical "7FQ3-XK2N" or null.
export function normalizeInviteCode(raw) {
   const token = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
   if (token.length !== 8) return null;
   return `${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

// Current user's membership row in this album, or null when not a member.
async function getOwnMembership(albumId) {
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(memberRef(albumId, currentUser.uid));
   return snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
}
// Album-path versions mirror the user-song API.
async function nextAlbumVersionNumber(albumId, songId) {
   const versions = await listAlbumVersions(albumId, songId);
   const highest = versions.reduce((max, v) => Math.max(max, Number(v.number) || 0), 0);
   return highest + 1;
}

export async function saveAlbumVersion(albumId, songId, versionId, data = {}, { label, number, createdAt, updatedAt } = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const now = Date.now();
   if (versionId) {
      const patch = { ...data, updatedAt: now };
      delete patch.cloudId;
      delete patch.songId;
      delete patch.versionId;
      if (Object.prototype.hasOwnProperty.call(data, "youtubeUrl") && patch.youtubeUrl === null) {
         patch.youtubeUrl = dbFns.deleteField();
      }
      if (Object.prototype.hasOwnProperty.call(data, "youtubeId") && patch.youtubeId === null) {
         patch.youtubeId = dbFns.deleteField();
      }
      if (label !== undefined) patch.label = label;
      if (number !== undefined) patch.number = number;
      await dbFns.setDoc(albumVersionRef(albumId, songId, versionId), patch, { merge: true });
      return { versionId, label: patch.label ?? data.label, number: patch.number ?? data.number };
   }
   const nextNumber = typeof number === "number" && number > 0 ? number : await nextAlbumVersionNumber(albumId, songId);
   const resolvedLabel = (label !== undefined ? label : data.label) || "Version 1";
   // Same rule as saveVersion(): a copy keeps its SOURCE timestamps (so the album
   // copy preserves the source's recency order); a brand-new version gets now.
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
   // Same rule as saveVersion(): "no link" means the fields are absent, not stored nulls.
   if (payload.youtubeUrl === null) delete payload.youtubeUrl;
   if (payload.youtubeId === null) delete payload.youtubeId;
   const ref = await dbFns.addDoc(albumVersionsCollection(albumId, songId), payload);
   return { versionId: ref.id, label: resolvedLabel, number: nextNumber };
}
export async function loadAlbumVersion(albumId, songId, versionId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(albumVersionRef(albumId, songId, versionId));
   if (!snapshot.exists()) throw new Error("Version not found.");
   return { versionId: snapshot.id, ...snapshot.data() };
}

// Lightweight version summaries (label/number/editorMode), most recently updated first.
export async function listAlbumVersions(albumId, songId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   // Sama seperti listVersions: hindari orderBy("number") karena Firestore
   // mendiamkan dokumen yang field `number`-nya hilang — ambil semua, urutkan
   // di client (paling baru di-update dulu; tanpa `updatedAt` dianggap 0).
   const snapshot = await dbFns.getDocs(albumVersionsCollection(albumId, songId));
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
   return sortVersionsByRecency(versions);
}

// Denormalize the "latest version" summary on an album song doc.
async function writeAlbumLatestMeta(
   albumId,
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
      albumSongRef(albumId, songId),
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

// Public wrapper for writeAlbumLatestMeta — used when a (first) album version is
// created and must immediately become the song's "latest" on the metadata.
export async function updateAlbumLatestVersion(albumId, songId, versionId, label, count, editorMode, youtubeId, key, meter, bpm) {
   await ensureFirebase();
   requireUser();
   await writeAlbumLatestMeta(albumId, songId, versionId, label || "", count, editorMode, youtubeId, key, meter, bpm);
}

async function recomputeAlbumLatestMeta(albumId, songId) {
   const { dbFns } = sdk;
   const versions = await listAlbumVersions(albumId, songId);
   if (!versions.length) {
      await dbFns.setDoc(
         albumSongRef(albumId, songId),
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
   await writeAlbumLatestMeta(
      albumId,
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

export async function deleteAlbumVersion(albumId, songId, versionId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   await dbFns.deleteDoc(albumVersionRef(albumId, songId, versionId));
   return recomputeAlbumLatestMeta(albumId, songId);
}
// Album song metadata helpers.
async function createAlbumSong(albumId, meta = {}) {
   const { dbFns } = sdk;
   const now = Date.now();
   const ref = await dbFns.addDoc(albumSongsCollection(albumId), {
      title: meta.title || "Untitled",
      artist: meta.artist || "",
      createdAt: now,
      updatedAt: now,
   });
   return { songId: ref.id };
}

// Patch an album song's metadata (merge). Exported so the editor can keep the
// denormalized latest-* fields in sync when only a version changed (e.g. a
// staged rename / YouTube link that is persisted on the next Save).
export async function updateAlbumSongMeta(albumId, songId, patch = {}) {
   const { dbFns } = sdk;
   const clean = { ...patch };
   delete clean.cloudId;
   delete clean.songId;
   delete clean.versionId;
   await dbFns.setDoc(albumSongRef(albumId, songId), { ...clean, updatedAt: Date.now() }, { merge: true });
}

export async function loadAlbumSongMeta(albumId, songId) {
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(albumSongRef(albumId, songId));
   if (!snapshot.exists()) throw new Error("Song not found in album.");
   return { songId, ...snapshot.data() };
}

// Bump the album's updatedAt + recompute songCount (denormalized for cards),
// and mirror the number into the current user's membership pointer.
async function bumpAlbumActivity(albumId) {
   const { dbFns } = sdk;
   const now = Date.now();
   const songs = await dbFns.getDocs(albumSongsCollection(albumId));
   const count = songs.docs.length;
   await dbFns.setDoc(albumRef(albumId), { songCount: count, updatedAt: now }, { merge: true });
   try {
      await dbFns.setDoc(myMembershipRef(albumId), { albumUpdatedAt: now, songCount: count }, { merge: true });
   } catch {
      /* membership pointer is best-effort; listing self-heals */
   }
}
// Album CRUD.
export async function createAlbum({ name, description } = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const now = Date.now();
   const title = (name || "").trim() || "Untitled Album";
   const ref = await dbFns.addDoc(albumsCollection(), {
      name: title,
      description: (description || "").trim(),
      createdBy: currentUser.uid,
      createdAt: now,
      updatedAt: now,
      songCount: 0,
   });
   const albumId = ref.id;
   await dbFns.setDoc(memberRef(albumId, currentUser.uid), {
      uid: currentUser.uid,
      role: "owner",
      name: currentUser.displayName || "",
      email: currentUser.email || "",
      joinedAt: now,
      addedBy: null,
   });
   const code = generateInviteCode();
   await dbFns.setDoc(inviteCodeRef(code), { albumId, active: true, createdAt: now, createdBy: currentUser.uid });
   await dbFns.setDoc(albumRef(albumId), { activeInviteCode: code }, { merge: true });
   await dbFns.setDoc(myMembershipRef(albumId), {
      role: "owner",
      joinedAt: now,
      albumUpdatedAt: now,
      songCount: 0,
   });
   return { albumId, inviteCode: code };
}

export async function updateAlbum(albumId, { name, description } = {}) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const patch = {};
   if (name !== undefined) patch.name = (name || "").trim() || "Untitled Album";
   if (description !== undefined) patch.description = (description || "").trim();
   patch.updatedAt = Date.now();
   await dbFns.setDoc(albumRef(albumId), patch, { merge: true });
   return { albumId };
}

// Delete an album AND everything inside it (Firestore has no cascade).
export async function deleteAlbum(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const songs = await dbFns.getDocs(albumSongsCollection(albumId));
   for (const song of songs.docs) {
      const versions = await dbFns.getDocs(albumVersionsCollection(albumId, song.id));
      await Promise.all(versions.docs.map((snap) => dbFns.deleteDoc(snap.ref)));
      await dbFns.deleteDoc(song.ref);
   }
   const members = await dbFns.getDocs(membersCollection(albumId));
   // Our OWN membership row is skipped: the album doc itself is deleted below and
   // its invite codes go stale, so a leftover membership of a deleted album is
   // inert (and this keeps the delete working even for a build whose rules still
   // forbid an owner from removing their own row).
   await Promise.all(
      members.docs.filter((snap) => snap.id !== currentUser.uid).map((snap) => dbFns.deleteDoc(snap.ref)),
   );
   // Invite code docs are tiny and immutable; once the album is gone the rules
   // deny every join attempt, so no cleanup (and no collection list permission).
   await dbFns.deleteDoc(albumRef(albumId));
   try {
      await dbFns.deleteDoc(myMembershipRef(albumId));
   } catch {
      /* own pointer is best-effort */
   }
   return { albumId };
}

// The current user's album view: metadata + my live role (authoritative from the
// member doc, so a promotion/demotion elsewhere is reflected on the next open).
export async function getAlbum(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const member = await getOwnMembership(albumId);
   if (!member) throw new Error("You are not a member of this album.");
   const snapshot = await dbFns.getDoc(albumRef(albumId));
   if (!snapshot.exists()) throw new Error("Album not found.");
   const data = snapshot.data();
   return {
      albumId,
      name: data.name || "Untitled Album",
      description: data.description || "",
      createdBy: data.createdBy || "",
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
      songCount: typeof data.songCount === "number" ? data.songCount : 0,
      // The album card shows the live invite code to its MDs only (the code is
      // also the one thing a member would need to bypass the MD's control).
      activeInviteCode: typeof data.activeInviteCode === "string" ? data.activeInviteCode : "",
      role: member.role === "owner" ? "owner" : "member",
   };
}

// Albums the current user belongs to, most recently active first. Enumerated via
// the users/{uid}/albumMemberships pointer; stale pointers self-heal (if the
// album or membership vanished, the pointer is dropped on the next list).
export async function listAlbums() {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   // Ordering by albumUpdatedAt uses the automatic single-field index. Should a
   // deployment ever reject that query (index not yet created / emulator quirk),
   // fall back to an unordered read (plain collection reads never need an index)
   // and sort client-side — the album list must keep working either way.
   let markers;
   try {
      markers = await dbFns.getDocs(
         dbFns.query(myMembershipsCollection(), dbFns.orderBy("albumUpdatedAt", "desc")),
      );
   } catch (orderError) {
      console.warn("[cloud] albumMemberships orderBy read failed, falling back to unordered:", orderError);
      markers = await dbFns.getDocs(myMembershipsCollection());
   }
   const docs = [...markers.docs].sort((a, b) => {
      const ta = Number(a.data().albumUpdatedAt || 0);
      const tb = Number(b.data().albumUpdatedAt || 0);
      return tb - ta;
   });
   const albums = [];
   for (const snap of docs) {
      const albumId = snap.id;
      try {
         albums.push(await getAlbum(albumId));
      } catch (error) {
         // A REAL permission problem must bubble up (the UI points at the rules).
         if (isFirestoreDeny(error)) throw error;
         // Only a genuinely GONE album/membership is a stale pointer → remove it.
         // Anything else (transient, partial data) must NOT silently drop the
         // album from the list — log it so the exact failure stays visible.
         const msg = String(error?.message || error || "");
         if (/not found|are not a member/i.test(msg)) {
            try {
               await dbFns.deleteDoc(myMembershipRef(albumId));
            } catch {
               /* keep going */
            }
            console.warn(`[cloud] listAlbums: dropped stale pointer ${albumId} (${msg})`);
         } else {
            console.error(`[cloud] listAlbums: skipping marker ${albumId}, keeping it:`, error);
         }
      }
   }
   return albums;
}

// Firestore "missing/insufficient permissions" detector (per-collection rules).
function isFirestoreDeny(error) {
   const code = String(error?.code || "");
   const message = String(error?.message || error || "");
   return code === "permission-denied" || /Missing or insufficient permissions/i.test(message);
}
// Album songs.

// Home-card preview: the newest few arrangement titles + keys of one album.
// Deliberately separate from listAlbumSongs() so merely opening the Albums tab
// never pays for full song lists (or the latest-summary backfill that goes with
// them). Returns plain data, newest first.
export async function listAlbumSongPreview(albumId, max = 3) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const limitTo = Math.max(1, Math.min(10, Number(max) || 3));
   const snapshot = await dbFns.getDocs(
      dbFns.query(
         albumSongsCollection(albumId),
         dbFns.orderBy("updatedAt", "desc"),
         dbFns.limit(limitTo),
      ),
   );
   return snapshot.docs.map((snap) => {
      const data = snap.data();
      return {
         title: data.title || "Untitled",
         key: data.latestKey || data.key || "",
      };
   });
}

// Member count for an album card. A server-side count() is one read no matter
// how many members the album has; the member list itself stays in the Members
// dialog (where names and roles are actually needed).
export async function countAlbumMembers(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   if (typeof dbFns.getCountFromServer !== "function") return null;
   const snapshot = await dbFns.getCountFromServer(membersCollection(albumId));
   return snapshot.data().count;
}

// Album songs with the newest arrangement first. Sorting stays on the client:
// Firestore's orderBy silently omits documents that lack the field, which would
// make older album songs disappear instead of sorting to the bottom.
export function sortAlbumSongsByRecency(songs) {
   return songs
      .slice()
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

export async function listAlbumSongs(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDocs(albumSongsCollection(albumId));
   const songs = sortAlbumSongsByRecency(
      snapshot.docs.map((snap) => {
         const data = snap.data();
         return {
            cloudId: snap.id,
            songId: snap.id,
            title: data.title || "Untitled",
            artist: data.artist || "",
            updatedAt: data.updatedAt || 0,
            versionCount: data.versionCount,
            latestVersionId: data.latestVersionId,
            latestVersionLabel: data.latestVersionLabel,
            latestYoutubeId: data.latestYoutubeId,
            latestEditorMode: data.latestEditorMode,
            latestKey: data.latestKey,
            latestMeter: data.latestMeter,
            latestBPM: data.latestBPM,
            latestSummaryRev: data.latestSummaryRev,
         };
      }),
   );
   await backfillLatestSummary(
      songs,
      async (song) => {
         const snap = await dbFns.getDoc(albumVersionRef(albumId, song.cloudId, song.latestVersionId));
         return snap.exists() ? snap.data() : null;
      },
      async (song, patch) => {
         await dbFns.setDoc(albumSongRef(albumId, song.cloudId), patch, { merge: true });
      },
   );
   return songs;
}

// Load a song for the editor: metadata + the latest version, composed into the
// same project shape the editor consumes (mirrors loadSong for album scope).
export async function loadAlbumSong(albumId, songId) {
   await ensureFirebase();
   requireUser();
   const meta = await loadAlbumSongMeta(albumId, songId);
   if (!meta.latestVersionId) {
      return {
         cloudId: songId,
         albumId,
         songId,
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
   const version = await loadAlbumVersion(albumId, songId, meta.latestVersionId);
   return {
      cloudId: songId,
      albumId,
      songId,
      versionId: version.versionId,
      label: version.label || "",
      updatedAt: version.updatedAt,
      ...composeSong(meta, version),
   };
}
// Save the open score into an album song — creates the song inside the album
// directly (NO touch on users/{uid}/songs) or updates it when ctx.songId.
// Returns the next editor cloud-context { scope, albumId, songId, versionId, versionLabel }.
export async function saveToAlbum(albumId, project = {}, ctx = {}) {
   await ensureFirebase();
   requireUser();
   const title = project.title || "Untitled";
   const artist = project.artist || "";
   const data = { ...project };
   delete data.cloudId;
   delete data.songId;
   delete data.versionId;
   let songId = ctx.songId;
   let nextVersionId = ctx.versionId;
   let nextLabel = ctx.versionLabel;
   if (songId) {
      const meta = await loadAlbumSongMeta(albumId, songId);
      if (meta.latestVersionId) {
         if (nextVersionId) {
            await saveAlbumVersion(albumId, songId, nextVersionId, data, { label: nextLabel });
         } else {
            const created = await saveAlbumVersion(albumId, songId, null, data, { label: ctx.versionLabel || "Version 1" });
            await writeAlbumLatestMeta(albumId, songId, created.versionId, created.label, 1, data.editorMode, undefined, data.key, data.meter, data.bpm);
            nextVersionId = created.versionId;
            nextLabel = created.label;
         }
      } else {
         // Song exists in the album but has no versions (last deleted) → first save becomes v1.
         const created = await saveAlbumVersion(albumId, songId, null, data, { label: ctx.versionLabel || "Version 1" });
         await writeAlbumLatestMeta(albumId, songId, created.versionId, created.label, 1, data.editorMode, undefined, data.key, data.meter, data.bpm);
         nextVersionId = created.versionId;
         nextLabel = created.label;
      }
      await updateAlbumSongMeta(albumId, songId, {
         title,
         artist,
         // The just-saved version has the newest `updatedAt`, so it is now the
         // TOPMOST arrangement — keep the denormalized summary (and therefore the
         // library card's mode) pointing at it.
         latestVersionId: nextVersionId,
         latestVersionLabel: nextLabel,
         latestEditorMode: normalizeEditorMode(data.editorMode),
         latestKey: data.key || "",
         latestMeter: data.meter || "",
         latestBPM: Number(data.bpm) || "",
      });
   } else {
      // Brand-new song created directly IN the album (no My Songs copy).
      const createdSong = await createAlbumSong(albumId, { title, artist });
      songId = createdSong.songId;
      const created = await saveAlbumVersion(albumId, songId, null, data, { label: ctx.versionLabel || "Version 1" });
      await writeAlbumLatestMeta(albumId, songId, created.versionId, created.label, 1, data.editorMode, undefined, data.key, data.meter, data.bpm);
      nextVersionId = created.versionId;
      nextLabel = created.label;
   }
   await bumpAlbumActivity(albumId);
   return { scope: "album", albumId, songId, versionId: nextVersionId, versionLabel: nextLabel };
}

export async function deleteAlbumSong(albumId, songId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const versions = await dbFns.getDocs(albumVersionsCollection(albumId, songId));
   await Promise.all(versions.docs.map((snap) => dbFns.deleteDoc(snap.ref)));
   await dbFns.deleteDoc(albumSongRef(albumId, songId));
   await bumpAlbumActivity(albumId);
   return { albumId };
}
// Transport-only fields are stripped before a version payload is re-created
// under another parent (the album copy). `label`/`number` are intentionally
// removed too — saveAlbumVersion assigns them, so the copied album version
// ALWAYS ends up with proper version metadata (the album's version list is
// sorted and labelled from those fields).
// Exported for the pure unit tests: it must never mutate its input and must keep
// every content field (sections/bars/chords/lyrics/key/meter/editorMode/YouTube).
export function versionCopyPayload(source) {
   const payload = { ...source };
   delete payload.cloudId;
   delete payload.songId;
   delete payload.versionId;
   delete payload.label;
   delete payload.number;
   delete payload.createdAt;
   delete payload.updatedAt;
   delete payload.legacy;
   delete payload.hasNoVersions;
   return payload;
}

// Copy an EXISTING My Songs song (metadata + EVERY arrangement, with its full
// content: sections/bars/chords/lyrics/key/meter/editorMode/YouTube link) into
// the album. Every source version is enumerated (listVersions does NOT use an
// orderBy, so versions without a `number` field can't be silently skipped by
// Firestore) and re-created through saveAlbumVersion.
// The copy is all-or-nothing: if any write fails midway, the partially copied
// album song is removed again so the album never keeps a half-copied song.
export async function addSongToAlbum(albumId, mySongId) {
   await ensureFirebase();
   requireUser();
   const meta = await loadSongMeta(mySongId);
   const created = await createAlbumSong(albumId, { title: meta.title, artist: meta.artist || "" });
   const newSongId = created.songId;
   let versionCount = 0;
   try {
      if (meta.legacy) {
         // Legacy flat song doc: the whole project IS the single arrangement.
         const payload = versionCopyPayload(meta);
         const version = await saveAlbumVersion(albumId, newSongId, null, payload, {
            label: "Version 1",
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
         });
         await writeAlbumLatestMeta(albumId, newSongId, version.versionId, version.label, 1, payload.editorMode, undefined, payload.key, payload.meter, payload.bpm);
         versionCount = 1;
      } else {
         const versions = await listVersions(mySongId);
         for (const v of versions) {
            const source = await loadVersion(mySongId, v.versionId);
            const payload = versionCopyPayload(source);
            // label/number AND the source timestamps are carried over so the album
            // keeps the SAME version names and recency order as the source song.
            await saveAlbumVersion(albumId, newSongId, null, payload, {
               label: v.label || source.label || "",
               number: v.number,
               createdAt: source.createdAt,
               updatedAt: source.updatedAt,
            });
            versionCount += 1;
         }
         if (!versionCount) {
            // Lagu sumber tidak punya dokumen versi yang terbaca (mis. lagu tanpa
            // versi tersisa setelah versi terakhir dihapus, atau data legacy yang
            // migrasinya belum jalan) → buat minimal satu versi dari konten yang
            // tersedia (loadSong sudah menggabungkan versi terakhir / data legacy /
            // draft kosong) sehingga salinan album tidak pernah tanpa versi.
            const source = await loadSong(mySongId);
            const fallbackData = versionCopyPayload(source);
            fallbackData.title = meta.title || "Untitled";
            fallbackData.artist = meta.artist || "";
            await saveAlbumVersion(albumId, newSongId, null, fallbackData, {
               label: meta.latestVersionLabel || "Version 1",
               createdAt: source.createdAt,
               updatedAt: source.updatedAt,
            });
            versionCount = 1;
         }
         // "Latest" = the album copy with the newest `updatedAt` (the source's
         // topmost version, kept by the preserved timestamps) — independent of the
         // iteration order of the source versions.
         const copied = await listAlbumVersions(albumId, newSongId);
         const latest = copied[0] || null;
         await writeAlbumLatestMeta(
            albumId,
            newSongId,
            latest?.versionId || null,
            latest?.label || "",
            versionCount,
            latest?.editorMode,
            latest?.youtubeId,
            latest?.key,
            latest?.meter,
            latest?.bpm,
         );
      }
   } catch (error) {
      // Roll the partial copy back so "Add from My Songs" never leaves a song
      // with only some of its arrangements in the album.
      try {
         await deleteAlbumSong(albumId, newSongId);
      } catch {
         /* best-effort cleanup — the original error is what matters */
      }
      throw error;
   }
   await bumpAlbumActivity(albumId);
   return { albumId, songId: newSongId, versionCount };
}

// Member "Save a copy" — duplicates an album song into the user's own library.
// When preferVersionId is given, the returned versionId/versionLabel describe the
// copied version matching that album version (so the editor can keep pointing at
// the arrangement the user was viewing).
export async function copyAlbumSongToMySongs(albumId, songId, { preferVersionId } = {}) {
   await ensureFirebase();
   requireUser();
   const meta = await loadAlbumSongMeta(albumId, songId);
   const created = await createSong({ title: meta.title, artist: meta.artist || "" });
   const newSongId = created.songId;
   const versions = await listAlbumVersions(albumId, songId);
   if (!versions.length) {
      await updateSongMeta(newSongId, { versionCount: 0 });
      return { songId: newSongId, versionId: null, versionLabel: "" };
   }
   let count = 0;
   let preferredId = null;
   let preferredLabel = "";
   for (const v of versions) {
      const version = await loadAlbumVersion(albumId, songId, v.versionId);
      const payload = { ...version };
      delete payload.cloudId;
      delete payload.songId;
      delete payload.versionId;
      delete payload.label;
      delete payload.number;
      // The payload keeps the source `createdAt`/`updatedAt`, so saveVersion()
      // preserves the album song's recency order in the private copy.
      const createdVersion = await saveVersion(newSongId, null, payload, { label: v.label, number: v.number });
      count += 1;
      if (preferVersionId && v.versionId === preferVersionId) {
         preferredId = createdVersion.versionId;
         preferredLabel = createdVersion.label;
      }
   }
   // "Latest" = the copy with the newest `updatedAt` (the topmost version, so the
   // private copy's card shows the same mode as the album song's topmost version).
   const top = (await listVersions(newSongId))[0] || null;
   if (top) {
      await writeLatestMeta(newSongId, top.versionId, top.label || "", count, top.editorMode, top.youtubeId, top.key, top.meter, top.bpm);
   } else {
      await updateSongMeta(newSongId, { versionCount: count });
   }
   await updateSongMeta(newSongId, { title: meta.title, artist: meta.artist || "" });
   return { songId: newSongId, versionId: preferredId || top?.versionId || null, versionLabel: preferredLabel || top?.label || "" };
}
// Joining and membership use invite-code self-service.
// The current code is mirrored on the album doc (activeInviteCode) so reading it
// needs no collection query; inviteCodes/{code} keeps the server-side mapping.
export async function getInviteCode(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDoc(albumRef(albumId));
   if (!snapshot.exists()) return null;
   return snapshot.data().activeInviteCode || null;
}

// Deactivate the current code and issue a fresh one. Old codes stop working
// immediately (rules check `active == true`), so they cannot be reused.
export async function rotateInviteCode(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const previous = await getInviteCode(albumId);
   if (previous) {
      await dbFns.setDoc(inviteCodeRef(previous), { active: false }, { merge: true });
   }
   const code = generateInviteCode();
   await dbFns.setDoc(inviteCodeRef(code), { albumId, active: true, createdAt: Date.now(), createdBy: currentUser.uid });
   await dbFns.setDoc(albumRef(albumId), { activeInviteCode: code }, { merge: true });
   return { inviteCode: code };
}

/**
 * Self-service join. The invite code is VERIFIED SERVER-SIDE by the Firestore
 * rules: this client writes a member doc carrying the raw `inviteCode` field, and
 * the rules grant `create` only when that code exists, is active and belongs to
 * the album path being written. On success the code field is stripped again so
 * it is never persisted.
 */
export async function joinAlbum(rawCode) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const code = normalizeInviteCode(rawCode);
   if (!code) throw new Error("Invalid invite code.");
   const invite = await dbFns.getDoc(inviteCodeRef(code));
   if (!invite.exists()) throw new Error("That invite code is not valid.");
   const inviteData = invite.data();
   if (inviteData.active !== true) throw new Error("That invite code is no longer active.");
   const albumId = inviteData.albumId;
   if (typeof albumId !== "string" || !albumId) throw new Error("That invite code is not valid.");
   // A NON-member cannot read their own (absent) membership row — the rules only
   // grant member reads — so the check must tolerate the permission denial and
   // treat it as "not a member yet".
   let existing = null;
   try {
      existing = await getOwnMembership(albumId);
   } catch (membershipRead) {
      existing = null;
   }
   if (existing) {
      return { albumId, role: existing.role === "owner" ? "owner" : "member", alreadyMember: true };
   }
   const now = Date.now();
   try {
      // The rules verify request.resource.data.inviteCode here.
      await dbFns.setDoc(memberRef(albumId, currentUser.uid), {
         uid: currentUser.uid,
         role: "member",
         inviteCode: code,
         name: currentUser.displayName || "",
         email: currentUser.email || "",
         joinedAt: now,
         addedBy: null,
      });
   } catch (error) {
      throw new Error("That invite code is not valid for this album.");
   }
   // Strip the inviteCode so it never persists (the self-update rule lets a
   // member change ONLY the inviteCode field; role stays locked).
   try {
      await dbFns.setDoc(memberRef(albumId, currentUser.uid), { inviteCode: dbFns.deleteField() }, { merge: true });
   } catch {
      /* rule allows it, but never fail a successful join on the cleanup */
   }
   await dbFns.setDoc(myMembershipRef(albumId), { role: "member", joinedAt: now, albumUpdatedAt: now, songCount: 0 });
   return { albumId, role: "member" };
}

export async function listMembers(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const snapshot = await dbFns.getDocs(dbFns.query(membersCollection(albumId), dbFns.orderBy("joinedAt", "asc")));
   return snapshot.docs.map((snap) => ({
      uid: snap.id,
      role: snap.data().role === "owner" ? "owner" : "member",
      name: snap.data().name || "",
      email: snap.data().email || "",
      joinedAt: snap.data().joinedAt || 0,
   }));
}

// Promote/demote. Any owner may change any OTHER member's role (equal owners);
// the rules forbid writing your own membership, protecting the last owner.
export async function setMemberRole(albumId, uid, role) {
   await ensureFirebase();
   requireUser();
   if (uid === currentUser.uid) throw new Error("You cannot change your own role.");
   const { dbFns } = sdk;
   await dbFns.setDoc(memberRef(albumId, uid), { role: role === "owner" ? "owner" : "member" }, { merge: true });
}

// Owners remove members (any other member); members self-remove via leaveAlbum.
export async function removeMember(albumId, uid) {
   await ensureFirebase();
   requireUser();
   if (uid === currentUser.uid) throw new Error("Use Leave album to remove yourself.");
   const { dbFns } = sdk;
   await dbFns.deleteDoc(memberRef(albumId, uid));
}

// A MEMBER may leave an album at any time (self-serve, like joining).
export async function leaveAlbum(albumId) {
   await ensureFirebase();
   requireUser();
   const { dbFns } = sdk;
   const me = await getOwnMembership(albumId);
   if (!me) return;
   // Everyone may leave — a MEMBER and an OWNER / MD alike. The single
   // exception is the LAST owner: an album with no owner could never be managed
   // (or deleted) again, so we refuse and point at the two ways out. This guard
   // lives here because Firestore rules cannot count owners. The UI calls an
   // owner an MD (Music Director).
   if (me.role === "owner") {
      let owners = 1;
      try {
         owners = (await listMembers(albumId)).filter((member) => member.role === "owner").length;
      } catch {
         owners = 1; // unknown → be conservative and refuse
      }
      if (owners <= 1) {
         throw new Error(
            "You are the only MD. Promote another member to MD first, or delete the album.",
         );
      }
   }
   await dbFns.deleteDoc(memberRef(albumId, currentUser.uid));
   try {
      await dbFns.deleteDoc(myMembershipRef(albumId));
   } catch {
      /* best-effort */
   }
}
