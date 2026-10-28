// cloudUI.js — DOM wiring for the cloud login modal + My Songs gallery.
//
// Kept separate from events.js so the cloud feature is self-contained. It talks
// to Firebase only through cloud.js, and to the editor only through injected
// callbacks (getProject / applyProject / getCloudContext / setCloudContext). This
// keeps the module graph acyclic: cloudUI → { cloud, dom }, and events.js → cloudUI.
import { $, isPhone, toast } from "../../core/dom.js?v=__BUILD__";
import { friendlyName } from "../../util/identity.js?v=__BUILD__";
import { editorModeMeta, normalizeEditorMode } from "../../notation/notation.js?v=__BUILD__";
import {
   albumCardMarkup as buildAlbumCardMarkup,
   arrangementLabel,
   cardMarkup,
   coverMarkup,
   escapeHtml,
   libraryModeIcon,
   motifTokens,
   normalizeSongSearch,
   relativeUpdated,
   relativeWhen,
   songCoverId,
   songMediaMarkup,
   songTimestamp,
} from "./markup.js?v=__BUILD__";
import {
   isConfigured,
   onAuth,
   authReady,
   getCurrentUser,
   signOutUser,
   listSongs,
   loadSong,
   loadSongMeta,
   loadVersion,
   listVersions,
   createSong,
   updateSongMeta,
   saveVersion,
   updateLatestVersion,
   deleteVersion,
   composeSong,
   deleteSong,
   duplicateSong,
   createAlbum,
   updateAlbum,
   deleteAlbum,
   getAlbum,
   listAlbums,
   listAlbumSongs,
   listAlbumSongPreview,
   countAlbumMembers,
   loadAlbumSong,
   loadAlbumSongMeta,
   updateAlbumSongMeta,
   saveToAlbum,
   deleteAlbumSong,
   addSongToAlbum,
   copyAlbumSongToMySongs,
   listAlbumVersions,
   loadAlbumVersion,
   saveAlbumVersion,
   updateAlbumLatestVersion,
   deleteAlbumVersion,
   getInviteCode,
   rotateInviteCode,
   joinAlbum,
   listMembers,
   setMemberRole,
   removeMember,
   leaveAlbum,
   normalizeInviteCode,
} from "../../cloud.js?v=__BUILD__";

// Injected editor bridge (set in init).
import { buildShareLink, decodeShare, extractPayloadFromLink, IMPORT_ROUTE } from "../../util/share.js?v=__BUILD__";
import { parseYoutubeUrl, canonicalUrl, thumbnailUrl, formatStartTime } from "../../util/youtube.js?v=__BUILD__";
import { initLogin, showLoginPage, hideLoginPage } from "./auth.js?v=__BUILD__";
import { closeModal, openAttachLinkDialog, openConfirmDialog, openModal, openUnsavedChangesDialog } from "./dialogs.js?v=__BUILD__";
import { nudgeCarousel, renderCards, setGalleryState, setLoadStatus, updateEdgeBlur, updateNudgeVisibility } from "./gallery.js?v=__BUILD__";
import { ALBUM_DESC_MAX, ALBUM_TRACK_PREVIEW, MD_LABEL, MD_TITLE, cloudUIState, setActiveAlbumCtx } from "./state.js?v=__BUILD__";
import {
   albumSongFilterCounts,
   albumSongFilterIcon,
   albumSongMode,
   albumSongRowMarkup,
   albumSongSearchText,
   albumTrackChipsMarkup,
   foldAlbumSearch,
   memberControlsMarkup,
   memberManageButtonMarkup,
   roleMarker,
   roleShortLabel,
} from "./album.js?v=__BUILD__";

let bridge = {
   getProject: () => ({}),
   applyProject: () => {},
   getCloudContext: () => null,
   setCloudContext: () => {},
   setVersionYoutube: () => {},
   markDirty: () => {},
   openPdfOptions: () => {},
   hasUnsavedChanges: () => false,
   markSaved: () => {},
   isPlaying: () => false,
   stopPlayback: () => {},
};

// Distinguish Firestore permission errors (security rules) from real data
// errors, so the UI can point users at the rules instead of a generic failure.
function isFirestorePermissionsError(error) {
   const code = String(error?.code || "");
   const message = String(error?.message || error || "");
   return code === "permission-denied" || /Missing or insufficient permissions/i.test(message);
}

let cachedSongs = []; // last-fetched list (for client-side search filtering)
// My Songs index filters (desktop toolbar). Kept in memory only: the library is
// a working screen, so a fresh visit starts from "everything, newest first".
let songFilterMode = "all"; // all | chords | numbers | chordpro
let songFilterVideo = false;
let songSort = "updated"; // updated | title | artist
const SONG_FILTER_EMPTY_LABEL = "All";

// Test mode (local harness appends ?test=...): skip the auth gate entirely so
// the editor suite runs without a real Firebase sign-in. index.html sets this
// flag only on localhost, so a deployed URL cannot opt into it.
const TEST_MODE = document.documentElement.dataset.testMode === "1";
// True once the app content has been revealed at least once (post initial route).
let hasRouted = false;
// Identity we last routed for (uid or null) — prevents redundant re-routing when
// onAuthStateChanged re-emits the same user right after the initial route.
let routedUid = undefined;

// Guarded navigation back to My Songs. If the open document has unsaved cloud
// changes, ask first; otherwise leave immediately.
// Where "Back to My Songs" should land: the album detail when the open document
// is an album arrangement, the My Songs home otherwise.
function homeTarget() {
   const ctx = bridge.getCloudContext?.() || null;
   if (isAlbumCtx(ctx) && ctx.albumId) return `#/albums/${encodeURIComponent(ctx.albumId)}`;
   // Robustness: even if the context was lost, a URL that is an album editor
   // route must still land back on the album's song list.
   const route = parseRoute(location.hash);
   if (route.name === "editor" && route.albumId) return `#/albums/${encodeURIComponent(route.albumId)}`;
   return HOME_ROUTE;
}
async function leaveEditorToHome() {
   // If audio is still playing, confirm before leaving so the user isn't
   // surprised the sound cuts out when they land on the album / My Songs.
   // Playback is stopped automatically on confirmation.
   if (!(await confirmStopPlayback())) return;
   await guardUnsavedThen(() => navigate(homeTarget()));
}

// If playback is currently active, ask the user before stopping it. Returns
// true when we may proceed (nothing was playing, or they chose "Stop & leave");
// returns false when they cancelled, in which case callers must stay put.
async function confirmStopPlayback() {
   if (!bridge.isPlaying || !bridge.isPlaying()) return true;
   const confirmed = await openConfirmDialog({
      title: "Playback in progress",
      message: "The score is still playing. Stop playback and return to My Songs?",
      confirmLabel: "Stop & leave",
      cancelLabel: "Stay",
      icon: "playback-stop",
   });
   if (!confirmed) return false;
   if (bridge.stopPlayback) bridge.stopPlayback();
   return true;
}

// Central unsaved-changes gate. Runs `proceed` immediately when there is nothing
// to lose; otherwise shows the 3-choice dialog and only proceeds on save-success
// or explicit discard. Returns true if `proceed` ran, false if the user cancelled.
// A single gate means EVERY way of leaving the editor (Back button, New song,
// opening another song, browser Back) prompts consistently — no silent data loss.
//
// #2 fix: the dialog is a *cloud* save prompt, so it only makes sense when cloud
// is usable. When cloud isn't configured or the user isn't signed in, there is
// no "Save to cloud" action to offer — we skip the dialog and proceed (the
// in-session autosave note in the topbar already sets expectations, and Export
// .file remains the persistence path).
async function guardUnsavedThen(proceed) {
   if (!bridge.hasUnsavedChanges() || !cloudSaveAvailable()) {
      proceed();
      return true;
   }
   const choice = await openUnsavedChangesDialog();
   if (choice === "cancel") return false;
   if (choice === "save") {
      const saved = await saveToCloud();
      // If the save failed (offline, transient error) keep the user where they
      // are so their work isn't lost behind a silent navigation.
      if (!saved) return false;
   }
   // "discard" (or a successful save) → proceed. Clear the flag either way so we
   // don't re-prompt if nothing else changes. (Version details are written to the
   // cloud the moment the dialog is confirmed, so there is nothing staged to drop.)
   bridge.markSaved();
   proceed();
   return true;
}

// Hash routing
// My Songs is the home screen and the editor is a sub-page, so each gets a
// real URL: #/songs (home) and #/song/:songId[/v/:versionId] (editor, or
// #/song/new for an unsaved draft, or #/song/:songId/new for a song that still
// has no versions). That makes the browser Back button and page reloads behave
// the way the visual hierarchy promises. All screen changes go through
// navigate() → applyRoute(), so the URL is always the single source of truth.
const HOME_ROUTE = "#/songs";
// Guards the hashchange handler while navigate() is writing the hash itself.
let suppressHashHandling = false;
// Snapshot of the last route we applied, so the hashchange handler can detect a
// browser Back that leaves the editor while there are unsaved changes.
let lastRoute = { name: "home" };
let lastHash = "";
// True while importFromPayload() is running, so a directly-opened #/import link
// isn't re-triggered by the navigate() that runs after a successful load.
let importInFlight = false;

// Album UI state.
let homeTab = "songs"; // active home tab: "songs" | "albums"
let pendingHomeTab = "songs"; // tab to activate when showing the home screen
let currentAlbum = null; // { ..., role } being viewed in #albumModal
let cachedAlbums = []; // albums of the current user (Albums tab)
// Albums index working state. Role filter + sort live in memory only (a fresh
// visit starts from "all albums, newest first"), and the per-card extras
// (recent arrangements + member count) are cached so re-filtering or typing in
// the search never re-queries Firestore for every keystroke.
let albumRoleFilter = "all"; // all | owner | member
let albumSortMode = "updated"; // updated | title
const ALBUM_EXTRA_TTL = 60_000;
const albumCardExtras = new Map(); // albumId -> { stamp, at, tracks, members }
const albumExtraInFlight = new Set();
let cachedAlbumSongs = []; // songs of the open album (for search filtering)
let albumSongFilterMode = "all"; // all | chords | numbers | chordpro
let albumSongsReady = false;
let albumSongsRequest = 0; // invalidates a slow response after switching albums
let hasLoadedSongs = false;
let hasLoadedAlbums = false;
let albumSelectedSongId = null; // candidate song in #addSongDialog
// Album scope currently open in the editor. Kept SEPARATELY from the cloud
// context so the save direction stays correct even if the context (or the URL)
// has been overwritten by a version switch / New Version flow. The cloud
// context remains the primary source of truth; this is the safety net.
function editorRoute() {
   const ctx = bridge.getCloudContext() || {};
   // Album-scoped arrangements use #/album/... routes.
   if (ctx.scope === "album" && ctx.albumId) {
      if (!ctx.songId) return `#/album/${encodeURIComponent(ctx.albumId)}/new`;
      return ctx.versionId
         ? `#/album/${encodeURIComponent(ctx.albumId)}/${encodeURIComponent(ctx.songId)}/v/${encodeURIComponent(ctx.versionId)}`
         : `#/album/${encodeURIComponent(ctx.albumId)}/${encodeURIComponent(ctx.songId)}`;
   }
   // Safety net: never downgrade an album editor URL to a My Songs URL. If the
   // hash still says "#/album/..." AND the open document is still that album song
   // (no songId yet, or the same id), keep the album route — otherwise a stray My
   // Songs URL would make the next "Save to Cloud" write into the user's library.
   const route = parseRoute(location.hash);
   if (route.name === "editor" && route.albumId && (!ctx.songId || ctx.songId === route.id)) {
      const songId = ctx.songId || route.id || null;
      const versionId = ctx.versionId ?? route.versionId ?? null;
      if (!songId) return `#/album/${encodeURIComponent(route.albumId)}/new`;
      return versionId
         ? `#/album/${encodeURIComponent(route.albumId)}/${encodeURIComponent(songId)}/v/${encodeURIComponent(versionId)}`
         : `#/album/${encodeURIComponent(route.albumId)}/${encodeURIComponent(songId)}`;
   }
   if (ctx.songId && ctx.versionId) {
      return `#/song/${encodeURIComponent(ctx.songId)}/v/${encodeURIComponent(ctx.versionId)}`;
   }
   if (ctx.songId) return `#/song/${encodeURIComponent(ctx.songId)}/new`;
   return "#/song/new";
}

function parseRoute(hash) {
   const raw = String(hash || "").replace(/^#/, "");
   // Import link: #/import?d=<payload>. Opened directly (address bar / shared
   // link) it should trigger the same preview→load flow as the Attach button.
   const imp = raw.match(/^\/import\b/);
   if (imp) {
      const q = raw.indexOf("?");
      const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
      return { name: "import", payload: params.get("d") || null };
   }
   // Specific version route: #/song/:songId/v/:versionId.
   const versioned = raw.match(/^\/song\/([^/]+)\/v\/([^/]+)$/);
   if (versioned) {
      return { name: "editor", id: decodeURIComponent(versioned[1]), versionId: decodeURIComponent(versioned[2]) };
   }
   // Add-first-version route: #/song/:songId/new — a song that currently has no
   // versions (last one deleted) opens here so the user can add one.
   const addVersion = raw.match(/^\/song\/([^/]+)\/new$/);
   if (addVersion && addVersion[1] !== "new") {
      return { name: "editor", id: decodeURIComponent(addVersion[1]), versionId: null, addVersion: true };
   }
   const song = raw.match(/^\/song\/(.+)$/);
   if (song) return { name: "editor", id: song[1] === "new" ? null : decodeURIComponent(song[1]) };
   // Album routes (Fase 3/4).
   const albumVersioned = raw.match(/^\/album\/([^/]+)\/([^/]+)\/v\/([^/]+)$/);
   if (albumVersioned) {
      return { name: "editor", albumId: decodeURIComponent(albumVersioned[1]), id: decodeURIComponent(albumVersioned[2]), versionId: decodeURIComponent(albumVersioned[3]) };
   }
   const albumAddVersion = raw.match(/^\/album\/([^/]+)\/([^/]+)\/new$/);
   if (albumAddVersion) {
      return { name: "editor", albumId: decodeURIComponent(albumAddVersion[1]), id: decodeURIComponent(albumAddVersion[2]), versionId: null, addVersion: true };
   }
   const albumSongNew = raw.match(/^\/album\/([^/]+)\/new$/);
   if (albumSongNew) return { name: "editor", albumId: decodeURIComponent(albumSongNew[1]), id: null };
   const albumSong = raw.match(/^\/album\/([^/]+)\/([^/]+)$/);
   if (albumSong) return { name: "editor", albumId: decodeURIComponent(albumSong[1]), id: decodeURIComponent(albumSong[2]) };
   const albumDetail = raw.match(/^\/albums\/([^/]+)$/);
   if (albumDetail) return { name: "album-detail", id: decodeURIComponent(albumDetail[1]) };
   if (raw === "/albums" || raw === "/albums/") return { name: "albums" };
   return { name: "home" };
}

// Change screens by changing the URL. replace: true rewrites the current entry
// instead of pushing a new one (used to normalise the initial/blank hash).
function navigate(hash, { replace = false } = {}) {
   if (location.hash === hash) {
      applyRoute();
      return;
   }
   suppressHashHandling = true;
   if (replace) history.replaceState(null, "", hash);
   else location.hash = hash;
   suppressHashHandling = false;
   applyRoute();
}

// Render whatever screen the current hash asks for. Home shows the gallery;
// the editor hides it. Opening a song by id is handled by openSongInEditor,
// which loads the document and then navigates here.
function applyRoute() {
   const route = parseRoute(location.hash);
   const modal = $("#mySongsModal");
   if (route.name === "import") {
      // A shared link was opened directly. Show the gallery behind it, then run
      // the same preview→load flow used by the Attach Link button. We guard with
      // a flag so re-entrancy (e.g. navigate() after load) doesn't double-fire.
      showGalleryScreen();
      document.documentElement.dataset.screen = "home";
      if (route.payload && !importInFlight) {
         importFromPayload(route.payload);
      }
      lastRoute = route;
      lastHash = location.hash;
      return;
   }
   if (route.name === "home") {
      pendingHomeTab = "songs";
      closeModal($("#albumModal"));
      showGalleryScreen();
   } else if (route.name === "albums") {
      pendingHomeTab = "albums";
      closeModal($("#albumModal"));
      showGalleryScreen("albums");
   } else if (route.name === "album-detail") {
      openAlbumDetail(route.id);
      lastRoute = route;
      lastHash = location.hash;
      return;
   } else {
      closeModal(modal);
      closeModal($("#albumModal"));
   }
   // Home covers the whole viewport, so lock the page behind it — otherwise the
   // editor underneath still shows its own scrollbar on the right.
   document.documentElement.dataset.screen = route.name;
   // The contextual "Back to editor" button only makes sense when a document is
   // actually open, otherwise home would offer a dead end.
   const resume = $("#backToEditorBtn");
   if (resume) resume.hidden = route.name !== "home" || !(bridge.getCloudContext()?.songId);
   // Remember where we are so the hashchange guard can detect an editor→home
   // transition triggered by the browser Back button (see the init listener).
   syncVersionPill();
   lastRoute = route;
   lastHash = location.hash;
}
// Display names are derived by identity.js → friendlyName() (imported at the top):
// Auth displayName when present (Google), otherwise a readable name from the email
// local part. Callers keep their own fallback ("Musician" in the member list, the
// email in the account menu).

// Whether a "Save to cloud" action can actually complete right now. The unsaved
// guard and the dirty badge both hinge on this: there's no point prompting to
// save (or nagging with a badge) when Firebase isn't configured or nobody is
// signed in. TEST_MODE stands in for an authenticated session in the harness.
function cloudSaveAvailable() {
   return isConfigured() && (!!getCurrentUser() || TEST_MODE);
}

// #4 dirty indicator: toggle the "unsaved changes" state on the Save button.
// Only surface it when cloud save is actually available, otherwise the badge
// would nag about an action the user can't complete.
// The badge (amber dot) rides the top-right corner of the button, and the
// accessible label follows the ACTIVE scope ("Save to Album" inside an album,
// "Save a copy" for members) so the hint never contradicts the visible text.
function updateSaveButtonDirty(dirty) {
   const btn = $("#saveCloudBtn");
   if (!btn) return;
   const show = !!dirty && cloudSaveAvailable();
   btn.classList.toggle("is-unsaved", show);
   const label = btn.dataset.saveLabel || "Save to Cloud";
   btn.setAttribute("aria-label", show ? `${label} (unsaved changes)` : label);
}

// A short "saved" settle on the Save button (the editor's one signature move).
// Additive only: the save logic is untouched; the class just drives CSS
// (icon swaps to a check, tone settles) and is removed after ~1.6s.
let savedFlashTimer = null;
function flashSavedState() {
   const btn = $("#saveCloudBtn");
   if (!btn) return;
   btn.classList.remove("is-saved");
   // Force a reflow so a second save restarts the settle even mid-timer.
   void btn.offsetWidth;
   btn.classList.add("is-saved");
   clearTimeout(savedFlashTimer);
   savedFlashTimer = setTimeout(() => btn.classList.remove("is-saved"), 1600);
}

// Auth state → topbar reflection
function paintAccount(ids, user, accountName) {
   const btn = $(ids.btn);
   const avatar = $(ids.avatar);
   const label = $(ids.label);
   if (btn && avatar && label) {
      if (user) {
         btn.classList.add("is-authed");
         const initial = (accountName || "?").trim().charAt(0).toUpperCase();
         if (user.photoURL) {
            avatar.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`;
         } else {
            avatar.textContent = initial || "●";
         }
         label.textContent = accountName || "Account";
         btn.title = "Your account";
         btn.setAttribute("aria-label", `Account menu for ${accountName || "your account"}`);
         btn.setAttribute("aria-haspopup", "true");
      } else {
         btn.classList.remove("is-authed");
         avatar.replaceChildren();
         label.textContent = "Sign in";
         btn.title = "Sign in to sync your songs";
         btn.setAttribute("aria-label", "Sign in to sync your songs");
         btn.setAttribute("aria-haspopup", "false");
         btn.setAttribute("aria-expanded", "false");
      }
      const pAvatar = $(ids.popAvatar);
      const pName = $(ids.popName);
      const pEmail = $(ids.popEmail);
      if (pAvatar) pAvatar.innerHTML = avatar.innerHTML;
      if (pName) pName.textContent = user ? accountName || "Signed in" : "Not signed in";
      if (pEmail) {
         const email = user ? user.email || "" : "";
         pEmail.textContent = email;
         pEmail.hidden = !email;
      }
      const signOut = $(ids.signOut);
      if (signOut) signOut.hidden = !user;
   }
}

function reflectAuth(user) {
   // One derived name for every account UI: Auth displayName when present
   // (Google), otherwise a readable name from the email's local part — an
   // email/password account has no displayName at all.
   const accountName = user ? friendlyName(user || {}) || user?.email || "" : "";
   paintAccount({
      btn: "#accountBtn",
      avatar: "#accountAvatar",
      label: "#accountLabel",
      popAvatar: "#accountPopoverAvatar",
      popName: "#accountPopoverName",
      popEmail: "#accountPopoverEmail",
      signOut: "#signOutBtn",
   }, user, accountName);
   paintAccount({
      btn: "#albumAccountBtn",
      avatar: "#albumAccountAvatar",
      label: "#albumAccountLabel",
      popAvatar: "#albumAccountPopoverAvatar",
      popName: "#albumAccountPopoverName",
      popEmail: "#albumAccountPopoverEmail",
      signOut: "#albumSignOutBtn",
   }, user, accountName);

   // Cloud availability just changed (sign in/out): re-evaluate the unsaved
   // badge so it only shows when the user can actually save to the cloud.
   updateSaveButtonDirty(bridge?.hasUnsavedChanges?.() ?? false);

   // Route on auth changes that happen AFTER the initial load routing (e.g. the
   // user signs in from the login page, or signs out from the topbar). The very
   // first route is handled by routeOnLoad() via authReady().
   if (TEST_MODE || !hasRouted) return;
   const uid = user ? user.uid : null;
   if (uid === routedUid) return; // no identity change → nothing to route
   routedUid = uid;
   if (user) {
      hideLoginPage();
      openGallery();
   } else {
      showLoginPage();
   }
}

// Decide the initial screen once Firebase has restored (or failed to restore)
// the persisted session: signed-in → the route in the URL (defaulting to home);
// otherwise → login page.
async function routeOnLoad() {
   if (TEST_MODE) {
      document.documentElement.dataset.authGate = "app";
      hasRouted = true;
      // Honour a shared import link even in the test harness — call import directly
      // so we don't depend on route-specific logic in applyRoute().
      const rawHash = location.hash.replace(/^#/, "");
      const imp = rawHash.match(/^\/import\b/);
      if (imp) {
         const q = rawHash.indexOf("?");
         const params = new URLSearchParams(q >= 0 ? rawHash.slice(q + 1) : "");
         const payload = params.get("d");
         if (payload) {
            await importFromPayload(payload);
            return;
         }
      }
      return;
   }
   let user = null;
   try {
      user = await authReady();
   } catch {
      user = null;
   }
   hasRouted = true;
   routedUid = user ? user.uid : null;
   if (!user) {
      showLoginPage();
      return;
   }
   hideLoginPage();
   const route = parseRoute(location.hash);
   // A shared import link (#/import?d=...) opened directly → run the preview flow.
   if (route.name === "import") {
      applyRoute();
      return;
   }
   // A reload on #/song/:id[/v/:versionId] should reopen that song, not
   // silently drop to home.
   if (route.name === "editor" && route.albumId) {
      if (route.id) openAlbumSongInEditor(route.albumId, route.id, route.versionId);
      else openAlbumNewSongFlow(route.albumId, { replaceHistory: true });
      return;
   }
   if (route.name === "editor" && route.id) {
      openSongInEditor(route.id, route.versionId);
      return;
   }
   // Album gallery/detail routes loaded directly (address bar / reload).
   if (route.name === "albums" || route.name === "album-detail") {
      applyRoute();
      return;
   }
   // Blank/unknown hash (or #/song/new with nothing loaded) → normalise to home
   // without leaving a junk entry in the history stack.
   navigate(HOME_ROUTE, { replace: true });
}

// My Songs gallery — scrolling 2-row zigzag grid
// Cards flow into a two-row grid (column by column) that scrolls horizontally
// inside a bounded container. Columns alternate a small vertical offset for a
// zigzag wave. Cards near the left/right scroll edges are blurred; the ones in
// the clear middle are sharp. The grid is the scroll container, so it never
// pushes the shell (or header) wider than the viewport — fixing the drift bug.
function compareSongs(a, b) {
   const title = String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
   const artist = String(a.artist || "").localeCompare(String(b.artist || ""), undefined, { sensitivity: "base" });
   if (songSort === "title") return title || artist;
   if (songSort === "artist") return artist || title;
   return songTimestamp(b.updatedAt) - songTimestamp(a.updatedAt) || title;
}

function songFilterCounts() {
   const counts = { all: cachedSongs.length, chords: 0, numbers: 0, chordpro: 0, video: 0 };
   cachedSongs.forEach((song) => {
      const mode = normalizeEditorMode(song.latestEditorMode || song.editorMode);
      if (counts[mode] !== undefined) counts[mode] += 1;
      if (songCoverId(song)) counts.video += 1;
   });
   return counts;
}

function updateSongFilterCounts() {
   const counts = songFilterCounts();
   document.querySelectorAll("[data-filter-count]").forEach((el) => {
      const key = el.dataset.filterCount;
      el.textContent = String(counts[key] ?? 0);
   });
}

function updateSongFilterState() {
   document.querySelectorAll("[data-filter-mode]").forEach((btn) => {
      const active = btn.dataset.filterMode === songFilterMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
   });
   const videoBtn = $("[data-filter-video]");
   if (videoBtn) {
      videoBtn.classList.toggle("is-active", songFilterVideo);
      videoBtn.setAttribute("aria-checked", songFilterVideo ? "true" : "false");
   }
   const badge = $("[data-song-filter-badge]");
   if (badge) {
      const labels = { all: SONG_FILTER_EMPTY_LABEL, chords: "Chords", numbers: "Numeric", chordpro: "ChordPro" };
      let text = labels[songFilterMode] || SONG_FILTER_EMPTY_LABEL;
      if (songFilterVideo) text = text === SONG_FILTER_EMPTY_LABEL ? "Video" : `${text} + video`;
      badge.textContent = text;
   }
}

function updateSongResultLine(shown) {
   const el = $("#libraryResultCount");
   if (!el) return;
   const total = cachedSongs.length;
   const term = ($("#songSearch")?.value || "").trim();
   const active = !!term || songFilterMode !== "all" || songFilterVideo;
   const line = el.closest(".library-result-line");
   if (line) line.hidden = !(active && total);
   el.textContent = active && total ? `Showing ${shown} of ${total} song${total === 1 ? "" : "s"}` : "";
}

function isSongFilterMenuOpen() {
   const menu = $("#songFilterMenu");
   return !!menu && !menu.hidden;
}

function openSongFilterMenu() {
   const menu = $("#songFilterMenu");
   const btn = $("#songFilterBtn");
   if (!menu || !btn) return;
   menu.hidden = false;
   btn.setAttribute("aria-expanded", "true");
}

function closeSongFilterMenu() {
   const menu = $("#songFilterMenu");
   const btn = $("#songFilterBtn");
   if (!menu || !btn) return;
   menu.hidden = true;
   btn.setAttribute("aria-expanded", "false");
}

function syncSongSearchClear() {
   const input = $("#songSearch");
   const clear = $("#songSearchClear");
   if (clear) clear.hidden = !(input && input.value);
}

function resetSongFilters() {
   songFilterMode = "all";
   songFilterVideo = false;
   songSort = "updated";
   const sort = $("#songSort");
   if (sort) sort.value = "updated";
   updateSongFilterState();
   syncSongSearchClear();
}

function applyFilter() {
   const track = $("#songCards");
   // A cold fetch owns the list until it settles. Searching or changing a
   // filter must not replace the skeleton with the empty state mid-request.
   if (track?.dataset.skeleton === "1") {
      updateSongFilterCounts();
      updateSongFilterState();
      syncSongSearchClear();
      return;
   }
   const term = normalizeSongSearch($("#songSearch")?.value || "").trim();
   let filtered = cachedSongs.slice();
   if (term) {
      filtered = filtered.filter((song) =>
         normalizeSongSearch(
            `${song.title || ""} ${song.artist || ""} ${song.latestKey || song.key || ""}`,
         ).includes(term),
      );
   }
   if (songFilterMode !== "all") {
      filtered = filtered.filter(
         (song) => normalizeEditorMode(song.latestEditorMode || song.editorMode) === songFilterMode,
      );
   }
   if (songFilterVideo) {
      filtered = filtered.filter((song) => !!songCoverId(song));
   }
   filtered.sort(compareSongs);
   updateSongFilterCounts();
   updateSongFilterState();
   updateSongResultLine(filtered.length);
   syncSongSearchClear();
   if (!cachedSongs.length) {
      setGalleryState("empty");
      renderCards([]);
      return;
   }
   if (!filtered.length) {
      setGalleryState("no-results");
      renderCards([]);
      return;
   }
   setGalleryState("ready");
   renderCards(filtered);
}

// The home header doubles as the page title AND the "where am I" cue — on tablet
// & phone the tabs live inside the floating quick menu, so the title + count
// follow the ACTIVE view (songs vs albums). Called on tab switch and after each
// refresh, so the line is never stale.
function setLibraryCount(text) {
   const count = $("#libraryCount");
   if (!count) return;
   count.textContent = text;
   // An empty pill would render as a stray grey dot beside the page title
   // while the first fetch is still in flight.
   const pill = count.closest(".library-count-pill");
   if (pill) pill.hidden = !text;
}

function updateHomeHeading() {
   const title = $("#mySongsTitle");
   if (homeTab === "albums") {
      if (title) title.textContent = "Albums";
      const n = cachedAlbums.length;
      setLibraryCount(hasLoadedAlbums ? `${n} album${n === 1 ? "" : "s"}` : "");
      return;
   }
   if (title) title.textContent = "My Songs";
   const n = cachedSongs.length;
   setLibraryCount(hasLoadedSongs ? `${n} song${n === 1 ? "" : "s"}` : "");
}

async function refreshSongs() {
   const track = $("#songCards");
   // A warm refresh keeps the last good rows on screen; only a cold start gets
   // skeleton rows, so switching tabs never blanks a library that is already
   // readable.
   const warm = hasLoadedSongs && cachedSongs.length > 0;
   if (!warm) {
      setGalleryState("skeleton");
      renderSkeletonRows(track);
      setLoadStatus("galleryLoadingStatus", "Loading your songs…");
   } else {
      setLoadStatus("galleryLoadingStatus", "");
   }
   updateNudgeVisibility();
   try {
      cachedSongs = await listSongs();
      hasLoadedSongs = true;
      clearSkeletonTrack(track);
      // The header title + count reflect the active view (songs vs albums).
      updateHomeHeading();
      applyFilter();
      setLoadStatus("galleryLoadingStatus", "");
   } catch (error) {
      const code = String(error?.code || "");
      console.error(`[cloudUI] listSongs failed [code=${code}]`, error);
      const message = isFirestorePermissionsError(error)
         ? "Could not load — check Firestore security rules"
         : code === "unauthenticated"
            ? "Your session expired — sign in again"
            : code === "unavailable"
               ? "Could not reach Firestore — check your connection"
               : warm
                  ? "Could not refresh your songs"
                  : "Could not load your songs";
      if (!warm) {
         clearSkeletonTrack(track);
         setGalleryState("error");
         setLoadStatus("galleryLoadingStatus", "");
      }
      toast(message);
   }
}

// Switch which home tab is visible (My Songs vs Albums) without navigating.
function setHomeTab(tab) {
   const isAlbums = tab === "albums";
   homeTab = isAlbums ? "albums" : "songs";
   closeSongFilterMenu();
   const songsPanel = $("#songsPanel");
   const albumsPanel = $("#albumsPanel");
   const btnSongs = $("#tabMySongs");
   const btnAlbums = $("#tabAlbums");
   if (songsPanel) songsPanel.hidden = homeTab !== "songs";
   if (albumsPanel) albumsPanel.hidden = homeTab !== "albums";
   if (btnSongs) {
      btnSongs.classList.toggle("is-active", homeTab === "songs");
      btnSongs.setAttribute("aria-selected", homeTab === "songs" ? "true" : "false");
      btnSongs.tabIndex = homeTab === "songs" ? 0 : -1;
   }
   if (btnAlbums) {
      btnAlbums.classList.toggle("is-active", homeTab === "albums");
      btnAlbums.setAttribute("aria-selected", homeTab === "albums" ? "true" : "false");
      btnAlbums.tabIndex = homeTab === "albums" ? 0 : -1;
   }
   // "New Song" and "Attach Link" are MY SONGS actions (starting your own score /
   // importing someone else's share link); album songs are created from inside the
   // album itself (album detail → New Song). "+ New Album" takes the SAME primary
   // toolbar slot while Albums is open — immediately left of the profile button,
   // exactly like "+ New Song" — so the three toggle with the active tab.
   const newSongBtn = $("#newSongBtn");
   const attachLinkBtn = $("#attachLinkBtn");
   const newAlbumBtn = $("#newAlbumBtn");
   const joinAlbumBtn = $("#joinAlbumBtn");
   if (newSongBtn) newSongBtn.hidden = isAlbums;
   if (attachLinkBtn) attachLinkBtn.hidden = isAlbums;
   if (newAlbumBtn) newAlbumBtn.hidden = !isAlbums;
   if (joinAlbumBtn) joinAlbumBtn.hidden = !isAlbums;
   updateHomeHeading();
}

// Render the home screen (gallery). Called by the router; use navigate(HOME_ROUTE)
// from UI handlers so the URL stays in sync. `tab` selects which pane shows.
async function showGalleryScreen(tab) {
   // Gallery requires auth.
   if (!getCurrentUser() && !TEST_MODE) {
      showLoginPage();
      toast("Sign in to view your library");
      return;
   }
   if (tab) pendingHomeTab = tab;
   openModal($("#mySongsModal"));
   setHomeTab(pendingHomeTab);
   const search = $("#songSearch");
   if (search) search.value = "";
   resetSongFilters();
   closeSongFilterMenu();
   // Start both lists together. Waiting for songs before albums left the
   // Albums panel blank on a cold visit instead of showing its skeleton.
   const jobs = [refreshSongs()];
   if (pendingHomeTab === "albums" && !TEST_MODE) jobs.push(refreshAlbums());
   await Promise.all(jobs);
   updateEdgeBlur();
   updateNudgeVisibility();
}

function openGallery() {
   navigate(HOME_ROUTE);
}

// New Song / add-first-version dialog (version name + mode picker)
// The dialog is a single #newSongDialog instance; listeners are installed once
// (initNewSongDialog) and openNewSongDialog only flips it open with fresh copy,
// so multiple opens can never stack duplicate handlers.
let newSongDialogResolve = null; // current open promise (null = dialog closed)
let newSongSelectedMode = null;

function syncNewSongModePicker() {
   const cards = $("#newSongDialog")?.querySelectorAll(".mode-card") || [];
   cards.forEach((card) => {
      const selected = card.dataset.mode === newSongSelectedMode;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", selected ? "true" : "false");
   });
   const createBtn = $("#newSongCreateBtn");
   if (createBtn) createBtn.disabled = !newSongSelectedMode;
}

function closeNewSongDialog(result) {
   const resolve = newSongDialogResolve;
   newSongDialogResolve = null;
   const dialog = $("#newSongDialog");
   if (!dialog) {
      resolve?.(null);
      return;
   }
   dialog.classList.remove("is-open");
   setTimeout(() => {
      dialog.hidden = true;
      resolve?.(result);
   }, 260);
}

/**
 * Open the version-name + mode dialog. Resolves with { mode, label } when the
 * user picks a mode card with a non-empty version name, or null on cancel.
 * The version name is REQUIRED (Logic 1): picking a card with an empty name
 * shows an inline error and keeps the dialog open.
 */
function openNewSongDialog({ title = "New Song", desc = "", defaultLabel = "Version 1" } = {}) {
   const dialog = $("#newSongDialog");
   if (!dialog) return Promise.resolve(null);
   const nameInput = $("#newSongVersionName");
   const nameError = $("#newSongVersionError");
   // Re-opening the dialog resolves any previous pending open as cancelled.
   if (newSongDialogResolve) {
      const previous = newSongDialogResolve;
      newSongDialogResolve = null;
      previous(null);
   }
   const nameLabel = $("#newSongTitle");
   const nameDesc = $("#newSongDesc");
   if (nameLabel) nameLabel.textContent = title;
   if (nameDesc) nameDesc.textContent = desc;
   if (nameInput) {
      nameInput.value = defaultLabel;
      nameInput.classList.remove("is-invalid");
      nameInput.oninput = () => {
         if (nameError) nameError.hidden = true;
         nameInput.classList.remove("is-invalid");
      };
      nameInput.onkeydown = (event) => {
         if (event.key !== "Enter") return;
         event.preventDefault();
         $("#newSongCreateBtn")?.click();
      };
   }
   if (nameError) nameError.hidden = true;
   newSongSelectedMode = null;
   syncNewSongModePicker();
   return new Promise((resolve) => {
      newSongDialogResolve = resolve;
      dialog.hidden = false;
      void dialog.offsetHeight;
      setTimeout(() => dialog.classList.add("is-open"), 20);
      setTimeout(() => nameInput?.focus(), 60);
   });
}

// Install the dialog's once-only listeners (mode cards, dismiss + Escape).
function initNewSongDialog() {
   const dialog = $("#newSongDialog");
   const nameInput = $("#newSongVersionName");
   const nameError = $("#newSongVersionError");
   if (!dialog) return;
   dialog.querySelectorAll(".mode-card").forEach((card) => {
      card.addEventListener("click", () => {
         const mode = card.dataset.mode;
         if (!["chords", "numbers", "chordpro"].includes(mode)) return;
         newSongSelectedMode = mode;
         syncNewSongModePicker();
      });
   });
   $("#newSongCreateBtn")?.addEventListener("click", () => {
      const label = (nameInput?.value || "").trim();
      if (!label) {
         if (nameError) nameError.hidden = false;
         nameInput?.classList.add("is-invalid");
         nameInput?.focus();
         return;
      }
      if (!newSongSelectedMode) return;
      closeNewSongDialog({ mode: newSongSelectedMode, label });
   });
   dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-mode-dismiss]")) closeNewSongDialog(null);
   });
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && newSongDialogResolve) closeNewSongDialog(null);
   });
}

/** Fresh blank project for a chosen writing mode (extra meta overridable). */
// ChordPro starts with TWO sections so the format is obvious at a glance: an Intro
// holding a chord progression, and a Verse showing chords over lyrics (same
// deletable-sample convention as the "Song Title" / "Artist / Composer" placeholders).
const CHORDPRO_INTRO_STARTER = "[C] [Am7] [Dm7] [G7] [Cmaj7]";
const CHORDPRO_VERSE_STARTER = "[C]Type your lyric here and wrap each [G]chord in square [Am]brackets [F]";

function blankProject(mode, { title = "New Song", artist = "Artist / Composer" } = {}) {
   const chordpro = normalizeEditorMode(mode) === "chordpro";
   return {
      format: "chord-sheet",
      version: 2,
      title,
      artist,
      key: "C",
      meter: "4/4",
      bpm: 120,
      sections: chordpro
         ? [
              { name: "Intro", chordPro: CHORDPRO_INTRO_STARTER },
              { name: "Verse", chordPro: CHORDPRO_VERSE_STARTER },
           ]
         : [{ name: "Intro", bars: [] }],
      slashChords: [],
      editorMode: mode,
      lyricsEnabled: false, // lyrics start OFF in every mode; users opt in via the toggle
   };
}

// Version CRUD in the editor — version pill + popover + dialogs
// Version CRUD uses a name prompt and a details dialog for each arrangement.
let versionNameDialogResolve = null; // open promise for the new-version name prompt
// Writing mode currently selected in the New Version dialog. Each new arrangement
// may be written in its own mode, so this is read when the dialog is confirmed.
let versionNameDialogMode = "chords";
let versionDetailsResolve = null;    // open promise for the details dialog
let versionDetailsTarget = null;     // { songId, versionId } being edited
let youtubePreviewGeneration = 0;    // guards stale thumbnail onload callbacks
// Element selectors for the two YouTube fields (create-version + details dialogs).
const YT_DETAILS_IDS = {
   preview: "#versionDetailsYoutubePreview",
   thumb: "#versionDetailsThumb",
   hint: "#versionDetailsYoutubeHint",
};
const YT_NEW_VERSION_IDS = {
   preview: "#newVersionYoutubePreview",
   thumb: "#newVersionThumb",
   hint: "#newVersionYoutubeHint",
};
// Thumbnail tooltip: clicking the thumbnail opens YouTube. When the link carries a start time the
// tooltip names it (see syncYoutubePreview) instead of silently jumping to the middle of a video.
const DEFAULT_YT_THUMB_TITLE = "Play this video on YouTube";

function closeVersionNameDialog(label) {
   const resolve = versionNameDialogResolve;
   versionNameDialogResolve = null;
   const dialog = $("#newVersionNameDialog");
   if (!dialog) return resolve?.(null);
   dialog.classList.remove("is-open");
   setTimeout(() => {
      dialog.hidden = true;
      resolve?.(label);
   }, 260);
}

// Reflect the selected writing mode on the New Version dialog's picker (each
// `.vd-mode-btn` carries its mode id in `data-mode`).
function syncVersionModePicker() {
   const picker = $("#newVersionModePicker");
   if (!picker) return;
   picker.querySelectorAll(".vd-mode-btn").forEach((btn) => {
      const active = btn.dataset.mode === versionNameDialogMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
   });
}

// Name prompt for creating a new blank arrangement. Resolves with the name, or
// null on cancel. The name is REQUIRED.
function openVersionNameDialog({ title = "New Version", desc = "", defaultLabel = "Version 1", defaultMode = "chords" } = {}) {
   const dialog = $("#newVersionNameDialog");
   if (!dialog) return Promise.resolve(null);
   const input = $("#newVersionNameInput");
   const error = $("#newVersionNameError");
   if (versionNameDialogResolve) {
      const prev = versionNameDialogResolve;
      versionNameDialogResolve = null;
      prev(null);
   }
   const titleEl = $("#newVersionNameTitle");
   const descEl = $("#newVersionNameDesc");
   if (titleEl) titleEl.textContent = title;
   if (descEl) descEl.textContent = desc;
   if (input) {
      input.value = defaultLabel;
      input.classList.remove("is-invalid");
      input.oninput = () => {
         if (error) error.hidden = true;
         input.classList.remove("is-invalid");
      };
   }
   if (error) error.hidden = true;
   // Writing-mode picker: default to the given mode (normally the current
   // arrangement's), but the user may switch it, so ONE song can hold versions
   // written in different modes (Chord Chart / Numeric Notation / ChordPro).
   versionNameDialogMode = normalizeEditorMode(defaultMode);
   syncVersionModePicker();
   // Fresh dialog: start with an empty, optional YouTube field.
   const ytInput = $("#newVersionYoutube");
   if (ytInput) ytInput.value = "";
   syncYoutubePreview("", YT_NEW_VERSION_IDS);
   return new Promise((resolve) => {
      versionNameDialogResolve = resolve;
      dialog.hidden = false;
      void dialog.offsetHeight;
      setTimeout(() => dialog.classList.add("is-open"), 20);
      setTimeout(() => input?.focus(), 60);
   });
}

function closeVersionDetailsDialog(result) {
   const resolve = versionDetailsResolve;
   versionDetailsResolve = null;
   versionDetailsTarget = null;
   const dialog = $("#versionDetailsDialog");
   if (!dialog) return resolve?.(null);
   dialog.classList.remove("is-open");
   setTimeout(() => {
      dialog.hidden = true;
      resolve?.(result);
   }, 260);
}

/**
 * Open the "Version details" dialog for one arrangement.
 * Resolves with { status:'save', label, youtubeUrl, youtubeId },
 *         or { status:'delete' }, or null on cancel.
 */
function openVersionDetailsDialog({ songId, versionId, label = "", youtubeUrl = "", youtubeId = "" }) {
   const dialog = $("#versionDetailsDialog");
   if (!dialog) return Promise.resolve(null);
   if (versionDetailsResolve) {
      const prev = versionDetailsResolve;
      versionDetailsResolve = null;
      prev(null);
   }
   versionDetailsTarget = { songId, versionId };
   const nameInput = $("#versionDetailsName");
   if (nameInput) {
      nameInput.value = label || "Version 1";
      nameInput.classList.remove("is-invalid");
   }
   const nameError = $("#versionDetailsNameError");
   if (nameError) nameError.hidden = true;
   const initialUrl = youtubeUrl || (youtubeId ? canonicalUrl(youtubeId) : "");
   const youtubeInput = $("#versionDetailsYoutube");
   if (youtubeInput) youtubeInput.value = initialUrl;
   syncYoutubePreview(initialUrl);
   return new Promise((resolve) => {
      versionDetailsResolve = resolve;
      dialog.hidden = false;
      void dialog.offsetHeight;
      setTimeout(() => dialog.classList.add("is-open"), 20);
      setTimeout(() => nameInput?.focus(), 60);
   });
}

/**
 * Live preview + validation for a YouTube field. The thumbnail (and its ✕
 * remove button) only appear once the link is valid AND the image has fully
 * loaded. The thumbnail itself is the "open" affordance — clicking it opens the
 * video on YouTube in a new tab. Shared by the "Create new version" dialog and
 * the "Version details" dialog (pass `ids` for the latter).
 */
export function syncYoutubePreview(value, { preview: previewSel, thumb: thumbSel, hint: hintSel } = YT_DETAILS_IDS) {
   const preview = $(previewSel);
   const thumb = $(thumbSel);
   const hint = $(hintSel);
   const parsed = parseYoutubeUrl(value || "");
   const gen = ++youtubePreviewGeneration;
   if (!parsed) {
      if (preview) preview.hidden = true;
      if (thumb) {
         // Never let a stale thumbnail (from a previously opened version) linger.
         thumb.removeAttribute("src");
         delete thumb.dataset.ytUrl;
         thumb.title = DEFAULT_YT_THUMB_TITLE;
      }
      return parsed;
   }
   if (thumb) {
      thumb.dataset.ytUrl = parsed.url;
      thumb.src = thumbnailUrl(parsed.videoId, "mqdefault");
      // A link pasted from a full-set video carries a start time: clicking the thumbnail opens
      // YouTube at that second, so say so (this title is the only hint the thumbnail has).
      const at = formatStartTime(parsed.start);
      thumb.title = at ? `${DEFAULT_YT_THUMB_TITLE} — starts at ${at}` : DEFAULT_YT_THUMB_TITLE;
   }
   const show = () => {
      if (gen === youtubePreviewGeneration && preview) preview.hidden = false;
   };
   const hide = () => {
      if (gen === youtubePreviewGeneration && preview) preview.hidden = true;
   };
   if (thumb) {
      thumb.onload = show;
      thumb.onerror = hide;
      if (thumb.complete) show(); // cached image → already decoded
   }
   if (hint) hint.hidden = true;
   return parsed;
}

function openVersionPopover() {
   const pill = $("#versionSwitcherBtn");
   const pop = $("#versionPopover");
   if (!pop) return;
   pop.hidden = false;
   void pop.offsetHeight;
   pop.classList.add("is-open");
   pill?.setAttribute("aria-expanded", "true");
   renderVersionList();
   // Adding another version needs a saved song — disable the action on drafts.
   const newBtn = $("#versionNewBtn");
   if (newBtn) {
      const canCreate = Boolean((bridge.getCloudContext?.() || {}).songId);
      newBtn.disabled = !canCreate;
      newBtn.title = canCreate ? "Add a new arrangement" : "Save your song to cloud first";
   }
}

function closeVersionPopover() {
   const pill = $("#versionSwitcherBtn");
   const pop = $("#versionPopover");
   if (!pop) return;
   pop.classList.remove("is-open");
   pill?.setAttribute("aria-expanded", "false");
   setTimeout(() => {
      pop.hidden = true;
   }, 160);
}

// Install the version pill/popover + name & details dialog listeners once.
function initVersionCrud() {
   // New-version name prompt.
   const nameDialog = $("#newVersionNameDialog");
   const nameInput = $("#newVersionNameInput");
   const nameError = $("#newVersionNameError");
   if (nameDialog && nameInput) {
      const confirmLabel = () => {
         const label = (nameInput.value || "").trim();
         if (!label) {
            if (nameError) nameError.hidden = false;
            nameInput.classList.add("is-invalid");
            nameInput.focus();
            return;
         }
         const ytValue = (ytInput?.value || "").trim();
         const parsed = ytValue ? syncYoutubePreview(ytValue, YT_NEW_VERSION_IDS) : null;
         if (ytValue && !parsed) return; // invalid link → block create (hint shown)
         closeVersionNameDialog({
            label,
            // The version is created in the mode the user picked (falling back to
            // the current arrangement's) — so each version of a song keeps its OWN
            // writing mode.
            mode: versionNameDialogMode,
            youtubeUrl: parsed ? parsed.url : null,
            youtubeId: parsed ? parsed.videoId : null,
         });
      };
      $("#newVersionNameOk")?.addEventListener("click", confirmLabel);
      $("#newVersionNameCancel")?.addEventListener("click", () => closeVersionNameDialog(null));
      nameInput.addEventListener("keydown", (event) => {
         if (event.key === "Enter") {
            event.preventDefault();
            confirmLabel();
         }
      });
      // Optional YouTube link on the new version: live preview + validation.
      const ytInput = $("#newVersionYoutube");
      ytInput?.addEventListener("input", () => {
         const value = ytInput.value.trim();
         const parsed = syncYoutubePreview(ytInput.value, YT_NEW_VERSION_IDS);
         const hint = $("#newVersionYoutubeHint");
         if (hint) hint.hidden = !(value && !parsed);
      });
      $("#newVersionThumb")?.addEventListener("click", () => {
         const url = $("#newVersionThumb")?.dataset.ytUrl;
         if (url) window.open(url, "_blank", "noopener");
      });
      $("#newVersionYoutubeRemove")?.addEventListener("click", () => {
         if (ytInput) ytInput.value = "";
         syncYoutubePreview("", YT_NEW_VERSION_IDS);
      });
      // Writing-mode picker: choose the mode the new version starts in.
      $("#newVersionModePicker")
         ?.querySelectorAll(".vd-mode-btn")
         .forEach((btn) => {
            btn.addEventListener("click", () => {
               versionNameDialogMode = normalizeEditorMode(btn.dataset.mode);
               syncVersionModePicker();
            });
         });
      nameDialog.addEventListener("click", (event) => {
         if (event.target.closest("[data-newversionname-dismiss]")) closeVersionNameDialog(null);
      });
   }
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && versionNameDialogResolve) closeVersionNameDialog(null);
   });

   // Version details dialog: rename, YouTube, and delete.
   const detailsDialog = $("#versionDetailsDialog");
   const detName = $("#versionDetailsName");
   const detNameError = $("#versionDetailsNameError");
   const detYoutube = $("#versionDetailsYoutube");
   if (detailsDialog) {
      detailsDialog.addEventListener("click", (event) => {
         if (event.target.closest("[data-versiondetails-dismiss]")) closeVersionDetailsDialog(null);
      });
      detYoutube?.addEventListener("input", () => {
         const value = detYoutube.value.trim();
         const parsed = syncYoutubePreview(detYoutube.value);
         const hint = $("#versionDetailsYoutubeHint");
         if (hint) hint.hidden = !(value && !parsed);
      });
      $("#versionDetailsThumb")?.addEventListener("click", () => {
         const url = $("#versionDetailsThumb")?.dataset.ytUrl;
         if (url) window.open(url, "_blank", "noopener");
      });
      $("#versionDetailsRemove")?.addEventListener("click", () => {
         if (detYoutube) detYoutube.value = "";
         syncYoutubePreview("");
      });
      $("#versionDetailsSave")?.addEventListener("click", () => {
         const label = (detName?.value || "").trim();
         if (!label) {
            if (detNameError) detNameError.hidden = false;
            detName?.classList.add("is-invalid");
            detName?.focus();
            return;
         }
         const value = (detYoutube?.value || "").trim();
         const parsed = value ? syncYoutubePreview(value) : null;
         if (value && !parsed) return; // invalid link → block save (hint shown)
         closeVersionDetailsDialog({
            status: "save",
            label,
            youtubeUrl: parsed ? parsed.url : null,
            youtubeId: parsed ? parsed.videoId : null,
         });
      });
      $("#versionDetailsDelete")?.addEventListener("click", () => {
         closeVersionDetailsDialog({ status: "delete" });
      });
   }
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && versionDetailsResolve) closeVersionDetailsDialog(null);
   });

   // Version pill and popover.
   const pill = $("#versionSwitcherBtn");
   if (pill) {
      pill.addEventListener("click", () => {
         if ($("#versionPopover")?.classList.contains("is-open")) closeVersionPopover();
         else openVersionPopover();
      });
   }
   document.addEventListener("click", (event) => {
      if ($("#versionPopover")?.classList.contains("is-open") && !event.target.closest(".version-switcher")) {
         closeVersionPopover();
      }
   });
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("#versionPopover")?.classList.contains("is-open")) closeVersionPopover();
   });

   $("#versionNewBtn")?.addEventListener("click", onNewVersion);
}

// Reflect the current arrangement in the topbar version pill.
function syncVersionPill() {
   // Album context drives topbar pill/banner/save-button labels (Fase 3/4).
   if (typeof syncAlbumContextUI === "function") syncAlbumContextUI();
   const wrap = $("#versionSwitcherWrap");
   if (!wrap) return;
   const ctx = bridge.getCloudContext?.() || null;
   // Always show the pill when something is being edited — a saved song (songId)
   // OR a brand-new draft that already has its first version name.
   wrap.hidden = !ctx || (!ctx.songId && !ctx.versionLabel);
   if (wrap.hidden) return;
   const labelEl = $("#versionSwitcherLabel");
   if (labelEl) {
      labelEl.textContent = ctx.versionLabel || "Version 1";
   }
}

// Populate the popover's list of arrangements (newest first) and bind switching.
async function renderVersionList() {
   const listEl = $("#versionList");
   if (!listEl) return;
   const ctx = bridge.getCloudContext?.() || null;
   if (!ctx?.songId) {
      // Brand-new (unsaved) draft: show the pending first-version name instead
      // of an empty list, and hint that saving unlocks version management.
      if (ctx?.versionLabel) {
         listEl.innerHTML = `<div class="version-list-empty">Current: <strong>${escapeHtml(ctx.versionLabel)}</strong> — save to cloud first to manage versions.</div>`;
      } else {
         listEl.innerHTML = `<div class="version-list-empty">Save a song first to manage its versions.</div>`;
      }
      return;
   }
   const versions = await listVersionsFor(ctx);
   if (!versions.length) {
      listEl.innerHTML = `<div class="version-list-empty">No versions yet — create one below.</div>`;
      return;
   }
   const canEditDetails = !(isAlbumCtx(ctx) && ctx.role !== "owner");
   listEl.innerHTML = versions
      .map((v) => {
         const current = v.versionId === ctx.versionId;
         const name = escapeHtml(v.label || "Untitled");
         // Each version keeps its own writing mode; show it so the dropdown makes
         // the mode of every arrangement obvious (glyph + tooltip = full badge).
         const mode = normalizeEditorMode(v.editorMode);
         const modeMark = `<span class="version-item-mode" title="${editorModeMeta[mode].badge}" aria-label="${editorModeMeta[mode].badge}">${libraryModeIcon(mode, "version-item-mode-icon")}</span>`;
         const ytIcon = v.youtubeId ? `<span class="version-item-yt" title="Has YouTube link">▶</span>` : "";
         const currentMark = current ? `<span class="version-item-current">Current</span>` : "";
         const editBtn = canEditDetails
            ? `<button class="version-item-edit" type="button" data-version-id="${escapeHtml(v.versionId)}" aria-label="Edit details" title="Edit details">✎</button>`
            : "";
         return `
            <div class="version-list-item${current ? " is-current" : ""}">
               <button class="version-item-switch" type="button" data-version-id="${escapeHtml(v.versionId)}" title="Open this version">
                  <span class="version-item-label">${modeMark}${name}${ytIcon}</span>
                  ${currentMark}
               </button>
               ${editBtn}
            </div>`;
      })
      .join("");
   listEl.querySelectorAll(".version-item-switch").forEach((btn) => {
      btn.addEventListener("click", () => selectVersion(btn.dataset.versionId));
   });
   listEl.querySelectorAll(".version-item-edit").forEach((btn) => {
      btn.addEventListener("click", (event) => {
         event.stopPropagation();
         editVersionDetails(btn.dataset.versionId);
      });
   });
}

// Switch the editor to another arrangement of the same song.
async function selectVersion(versionId) {
   const ctx = bridge.getCloudContext?.() || null;
   if (!ctx?.songId || versionId === ctx.versionId) {
      closeVersionPopover();
      return;
   }
   await guardUnsavedThen(async () => {
      closeVersionPopover();
      const loading = beginEditorLoading("Loading version…");
      try {
         const meta = await loadSongMetaFor(ctx);
         const version = await loadVersionFor(ctx, versionId);
         bridge.applyProject(composeSong(meta, version));
         bridge.setCloudContext(nextCtx(ctx, { versionId, versionLabel: version.label || "" }));
         endEditorLoading(loading);
         navigate(ctxEditorUrl({ ...ctx, versionId }));
         syncVersionPill();
         toast(`Opened "${meta.title || "Untitled"}" — ${version.label || "Version"}`);
      } catch (error) {
         toast("Could not open that version");
      } finally {
         endEditorLoading(loading);
      }
   });
}

// New version… — starts a BLANK arrangement (like a new song), without copying
// the current score. Guarded so unsaved edits to the current version can be
// saved (or discarded) before leaving it.
async function onNewVersion() {
   const ctx = bridge.getCloudContext?.() || null;
   closeVersionPopover();
   if (!ctx?.songId) return;
   const current = bridge.getProject();
   const currentMode = normalizeEditorMode(current?.editorMode);
   // Each version owns its writing mode, so a NEW version may start in ANY mode —
   // the dialog asks for it (defaulting to the one currently open).
   const blankFor = (mode) =>
      blankProject(mode, {
         title: current?.title || "Song Title",
         artist: current?.artist || "Artist / Composer",
      });

   if (!ctx.versionId) {
      // Add-state: no arrangement exists yet — create the first (blank) one.
      const input = await openVersionNameDialog({
         title: "New Version",
         desc: "Start a new, blank arrangement — pick a writing mode.",
         defaultLabel: "Version 1",
         defaultMode: currentMode,
      });
      if (!input) return;
      try {
         const blank = blankFor(input.mode || currentMode);
         const payload = { ...blank, youtubeUrl: input.youtubeUrl, youtubeId: input.youtubeId };
         const created = await saveVersionFor(ctx, null, payload, { label: input.label });
         await updateLatestFor(ctx, created.versionId, created.label, 1, blank.editorMode, input.youtubeId, blank.key, blank.meter, blank.bpm);
         bridge.applyProject(blank);
         bridge.setCloudContext(nextCtx(ctx, { versionId: created.versionId, versionLabel: created.label }));
         navigate(ctxEditorUrl({ ...ctx, versionId: created.versionId }));
         syncVersionPill();
         toast(`Version "${created.label}" created`);
      } catch (error) {
         toast("Could not create version");
      }
      return;
   }

   // Editing an existing song: guard unsaved edits on the current version, then
   // create a NEW blank arrangement (no cloning of the current score).
   await guardUnsavedThen(async () => {
      try {
         const count = (await listVersionsFor(ctx)).length;
         const input = await openVersionNameDialog({
            title: "New Version",
            desc: "Start a new, blank arrangement — pick a mode (it will not copy the current score).",
            defaultLabel: `Version ${count + 1}`,
            defaultMode: currentMode,
         });
         if (!input) return;
         const blank = blankFor(input.mode || currentMode);
         const payload = { ...blank, youtubeUrl: input.youtubeUrl, youtubeId: input.youtubeId };
         const created = await saveVersionFor(ctx, null, payload, { label: input.label });
         await updateLatestFor(ctx, created.versionId, created.label, count + 1, blank.editorMode, input.youtubeId, blank.key, blank.meter, blank.bpm);
         bridge.applyProject(blank);
         bridge.setCloudContext(nextCtx(ctx, { versionId: created.versionId, versionLabel: created.label }));
         navigate(ctxEditorUrl({ ...ctx, versionId: created.versionId }));
         syncVersionPill();
         toast(`Version "${created.label}" created`);
      } catch (error) {
         toast("Could not create version");
      }
   });
}

// Edit details (pencil on a version row) — opens the "Version details" dialog
// (rename + YouTube + delete) for THAT version and applies the result. Works for
// any version, not just the currently open one.
async function editVersionDetails(versionId) {
   const ctx = bridge.getCloudContext?.() || null;
   closeVersionPopover();
   if (!ctx?.songId || !versionId) return;
   let version;
   try {
      version = await loadVersionFor(ctx, versionId);
   } catch (error) {
      toast("Could not open version details");
      return;
   }
   const result = await openVersionDetailsDialog({
      songId: ctx.songId,
      versionId,
      label: version.label || (ctx.versionId === versionId ? ctx.versionLabel : "") || "",
      youtubeUrl: version.youtubeUrl || "",
      youtubeId: version.youtubeId || "",
   });
   if (!result) return;
   if (result.status === "delete") {
      // Deleting the CURRENT version runs the full recompute/add-state flow;
      // deleting another version just removes it and refreshes the list.
      if (ctx.versionId === versionId) {
         onDeleteVersion();
         return;
      }
      try {
         await deleteVersionFor(ctx, versionId);
         toast("Version deleted");
      } catch (error) {
         toast(isFirestorePermissionsError(error) ? "Delete blocked — check Firestore security rules" : "Could not delete version");
      }
      return;
   }
   // Persist IMMEDIATELY (no staging): the link/name belongs to THIS version document, and a
   // pending edit used to be lost when the user navigated away before a "Save to Cloud".
   // The song's denormalized "latest" summary is refreshed only when this IS the latest version,
   // so editing an older arrangement never rewrites what the song list shows.
   try {
      await saveVersionFor(ctx, versionId, {
         youtubeUrl: result.youtubeUrl,
         youtubeId: result.youtubeId,
      }, { label: result.label });
      const versions = await listVersionsFor(ctx);
      if (versions[0]?.versionId === versionId) {
         const patch = {
            latestVersionLabel: result.label,
            latestYoutubeId: result.youtubeId || null,
         };
         if (isAlbumCtx(ctx)) await updateAlbumSongMeta(ctx.albumId, ctx.songId, patch);
         else await updateSongMeta(ctx.songId, patch);
      }
   } catch (error) {
      toast(isFirestorePermissionsError(error) ? "Save blocked — check Firestore security rules" : "Could not save version details");
      return;
   }
   // Editing the arrangement that is OPEN also updates the editor document, otherwise the next
   // "Save to Cloud" would write the previous link back over this one.
   if (ctx.versionId === versionId) {
      bridge.setVersionYoutube({ youtubeUrl: result.youtubeUrl, youtubeId: result.youtubeId });
      bridge.setCloudContext(nextCtx(ctx, { versionId, versionLabel: result.label }));
   }
   syncVersionPill();
   renderVersionList();
   toast(`Version "${result.label}" updated`);
}

// Delete version… — removes that arrangement. The song itself survives (Opsi A).
async function onDeleteVersion() {
   const ctx = bridge.getCloudContext?.() || null;
   closeVersionPopover();
   if (!ctx?.songId || !ctx.versionId) return;
   const confirmed = await openConfirmDialog({
      title: "Delete version?",
      message: `Delete version "${ctx.versionLabel || "Version 1"}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      icon: "delete",
      danger: true,
   });
   if (!confirmed) return;
   try {
      const result = await deleteVersionFor(ctx, ctx.versionId);
      const meta = await loadSongMetaFor(ctx);
      if (result.versionId) {
         const version = await loadVersionFor(ctx, result.versionId);
         bridge.applyProject(composeSong(meta, version));
         bridge.setCloudContext(nextCtx(ctx, { versionId: result.versionId, versionLabel: version.label || "" }));
         navigate(ctxEditorUrl({ ...ctx, versionId: result.versionId }));
         toast("Version deleted");
      } else {
         // Last arrangement removed → song stays; the editor asks for a first version.
         bridge.applyProject(
            blankProject("chords", { title: meta.title || "Song Title", artist: meta.artist || "Artist / Composer" }),
         );
         bridge.setCloudContext(nextCtx(ctx, { versionId: null, versionLabel: "" }));
         navigate(ctxEditorUrl({ ...ctx, versionId: null }));
         toast("Last version deleted — add a new one to continue");
      }
      syncVersionPill();
   } catch (error) {
      toast("Could not delete version");
   }
}

async function openSongInEditor(songId, versionId) {
   // Guarded so replacing the open document (e.g. opening another song while
   // one is already loaded with edits) can't silently discard unsaved work.
   await guardUnsavedThen(async () => {
      const loading = beginEditorLoading("Loading song…");
      try {
         const meta = await loadSongMeta(songId);
         if (meta.legacy) {
            // Firestore rules still deny the versions subcollection: open the
            // legacy flat arrangement directly so nothing looks lost.
            bridge.applyProject(meta);
            bridge.setCloudContext({ songId, versionId: null, versionLabel: "" });
            endEditorLoading(loading);
            navigate(`#/song/${encodeURIComponent(songId)}`);
            toast(`Opened "${meta.title || "Untitled"}"`);
            return;
         }
         let version = null;
         if (versionId) {
            version = await loadVersion(songId, versionId);
         } else if (meta.latestVersionId) {
            // Default (Logic 2): open the latest arrangement of the song.
            version = await loadVersion(songId, meta.latestVersionId);
         }
         if (version) {
            bridge.applyProject(composeSong(meta, version));
            bridge.setCloudContext({ songId, versionId: version.versionId, versionLabel: version.label || "" });
            endEditorLoading(loading);
            navigate(`#/song/${encodeURIComponent(songId)}/v/${encodeURIComponent(version.versionId)}`);
            toast(`Opened "${meta.title || "Untitled"}" — ${version.label || "Version"}`);
         } else {
            // The song has no versions yet (e.g. the last one was deleted) →
            // require a version name FIRST (Opsi A), then land in the editor in
            // "add first version" mode.
            endEditorLoading(loading);
            const created = await openNewSongDialog({
               title: "Add First Version",
               desc: `"${meta.title || "Untitled"}" has no versions yet. Enter a version name, then pick a writing mode to start.`,
               defaultLabel: "Version 1",
            });
            if (!created) {
               navigate(HOME_ROUTE);
               return;
            }
            bridge.applyProject(
               blankProject(created.mode, { title: meta.title || "Song Title", artist: meta.artist || "Artist / Composer" }),
            );
            bridge.setCloudContext({ songId, versionId: null, versionLabel: created.label });
            navigate(`#/song/${encodeURIComponent(songId)}/new`);
            toast(`Version "${created.label}" ready for "${meta.title || "Untitled"}"`);
         }
      } catch (error) {
         toast("Could not open that song");
         // The loading surface has replaced the library; return there instead
         // of leaving an empty editor behind a failed fetch.
         navigate(HOME_ROUTE, { replace: true });
      } finally {
         endEditorLoading(loading);
      }
   });
}

async function handleCardAction(act, cloudId, card) {
   const song = cachedSongs.find((s) => s.cloudId === cloudId);
   const title = song?.title || "this song";
   if (act === "edit") {
      // Explicit "open in editor" — the phone tap-reveal's primary action.
      openSongInEditor(cloudId);
      return;
   }
   if (act === "pdf") {
      // Load the song into the editor first, then hand over to the editor's PDF
      // options dialog — its live preview renders the real #previewCard, so the
      // user sees THIS song's score (not whatever was open before).
      const loading = beginEditorLoading("Preparing PDF…");
      try {
         const full = await loadSong(cloudId);
         bridge.applyProject(full);
         bridge.setCloudContext({ songId: cloudId, versionId: full.versionId || null, versionLabel: full.label || "" });
         endEditorLoading(loading);
         navigate(
            full.versionId
               ? `#/song/${encodeURIComponent(cloudId)}/v/${encodeURIComponent(full.versionId)}`
               : `#/song/${encodeURIComponent(cloudId)}/new`,
         );
         // Wait for the gallery to finish closing so the dialog can adopt the
         // preview card once the editor layout is settled.
         setTimeout(() => bridge.openPdfOptions(), 340);
      } catch (error) {
         toast("Could not open that song");
         navigate(HOME_ROUTE, { replace: true });
      } finally {
         endEditorLoading(loading);
      }
      return;
   }
   if (act === "delete") {
      // Themed confirm (identical to the album delete dialog).
      const confirmed = await openConfirmDialog({
         title: "Delete song?",
         message: `Delete "${title}"? This cannot be undone.`,
         confirmLabel: "Delete",
         cancelLabel: "Cancel",
         icon: "delete",
         danger: true,
      });
      if (!confirmed) return;
      try {
         await deleteSong(cloudId);
         const current = bridge.getCloudContext();
         if (current?.songId === cloudId) bridge.setCloudContext(null);
         toast("Song deleted");
         await refreshSongs();
      } catch (error) {
         toast(isFirestorePermissionsError(error) ? "Delete blocked — check Firestore security rules" : "Could not delete that song");
      }
   } else if (act === "duplicate") {
      try {
         await duplicateSong(cloudId);
         toast("Song duplicated");
         await refreshSongs();
      } catch (error) {
         toast("Could not duplicate that song");
      }
   } else if (act === "export") {
      // Generate a share link and copy it to the clipboard. If the clipboard
      // API is unavailable/blocked (permissions, non-secure context, not
      // focused), fall back to showing the link so the user can copy manually.
      try {
         const song = await loadSong(cloudId);
         // Strip the version-model meta fields so the shared payload is a clean
         // self-contained project (the editor imports it as a new song + v1).
         const project = { ...song };
         delete project.cloudId;
         delete project.songId;
         delete project.versionId;
         delete project.label;
         delete project.updatedAt;
         delete project.hasNoVersions;
         const link = await buildShareLink(project, `${location.origin}${location.pathname}`);
         const copied = await copyTextToClipboard(link);
         if (copied) {
            toast("Share link copied to clipboard!");
         } else {
            await showShareLinkFallback(link);
         }
      } catch (error) {
         console.error("[cloudUI] Share link error:", error);
         toast("Could not create share link");
      }
   }
}

// Copy text to clipboard with a legacy fallback. Returns true on success.
async function copyTextToClipboard(text) {
   try {
      if (navigator.clipboard && window.isSecureContext) {
         await navigator.clipboard.writeText(text);
         return true;
      }
   } catch {
      // fall through to legacy path
   }
   try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
   } catch {
      return false;
   }
}

// When clipboard copy fails, present the link in the Attach Link dialog's
// textarea (reused, read-only) so the user can select and copy it by hand.
async function showShareLinkFallback(link) {
   const input = $("#attachLinkInput");
   const dialog = $("#attachLinkDialog");
   const title = $("#attachLinkTitle");
   const desc = $("#attachLinkDesc");
   if (!input || !dialog) {
      window.prompt("Copy this share link:", link);
      return;
   }
   if (title) title.textContent = "Copy this link";
   if (desc) desc.textContent = "Automatic copy was blocked by the browser. Select the link below and copy it manually.";
   input.value = link;
   openModal(dialog);
   setTimeout(() => {
      input.focus();
      input.select();
   }, 40);
}

// Download a song project as a .chordsheet.json file (mirrors the editor's
// export, but self-contained so the gallery doesn't depend on events.js).
function downloadSongFile(song) {
   const project = { ...song };
   delete project.cloudId;
   const base =
      (song.title || "song")
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "") || "song";
   const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
   const url = URL.createObjectURL(blob);
   const link = document.createElement("a");
   link.href = url;
   link.download = `${base}.chordsheet.json`;
   document.body.append(link);
   link.click();
   link.remove();
   URL.revokeObjectURL(url);
}

function initGallery() {
   const modal = $("#mySongsModal");
   if (!modal) return;
   const track = $("#songCards");

   // Home is a page, not a dismissible dialog: no close button, and clicking the
   // backdrop does nothing. The only way "out" is opening a song (or the
   // contextual Back to editor button when a document is already open).
   $("#backToEditorBtn")?.addEventListener("click", () => navigate(editorRoute()));

   $("#galleryRetry")?.addEventListener("click", () => refreshSongs());
   $("#songSearch")?.addEventListener("input", applyFilter);
   $("#songSearchClear")?.addEventListener("click", () => {
      const input = $("#songSearch");
      if (!input) return;
      input.value = "";
      applyFilter();
      input.focus();
   });
   $("#songFilterBtn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isSongFilterMenuOpen()) closeSongFilterMenu();
      else openSongFilterMenu();
   });
   $("#songFilterMenu")?.addEventListener("click", (event) => {
      const modeBtn = event.target.closest("[data-filter-mode]");
      if (modeBtn) {
         songFilterMode = modeBtn.dataset.filterMode || "all";
         closeSongFilterMenu();
         applyFilter();
         return;
      }
      const videoBtn = event.target.closest("[data-filter-video]");
      if (videoBtn) {
         songFilterVideo = !songFilterVideo;
         closeSongFilterMenu();
         applyFilter();
      }
   });
   $("#songSort")?.addEventListener("change", (event) => {
      songSort = event.target.value || "updated";
      applyFilter();
   });
   $("#galleryClearFilters")?.addEventListener("click", () => {
      const input = $("#songSearch");
      if (input) input.value = "";
      resetSongFilters();
      applyFilter();
      input?.focus();
   });
   document.addEventListener("click", (event) => {
      if (!event.target.closest("#songFilter")) closeSongFilterMenu();
   });
   document.addEventListener("keydown", (event) => {
      if (modal.hidden || homeTab !== "songs") return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
         const target = event.target;
         const typing =
            target &&
            (target.tagName === "INPUT" ||
               target.tagName === "TEXTAREA" ||
               target.tagName === "SELECT" ||
               target.isContentEditable);
         if (!typing) {
            event.preventDefault();
            $("#songSearch")?.focus();
         }
         return;
      }
      if (event.key === "Escape") {
         if (isSongFilterMenuOpen()) {
            closeSongFilterMenu();
            return;
         }
         const input = $("#songSearch");
         if (document.activeElement === input) {
            input.value = "";
            applyFilter();
         }
      }
   });

    // Rows open on click. Their native disclosure menu owns the secondary actions.
    track?.addEventListener("click", (e) => {
       const actionBtn = e.target.closest(".song-card-action");
       const card = e.target.closest(".song-card");
       if (!card) return;
       if (actionBtn) {
          e.stopPropagation();
          actionBtn.closest("details")?.removeAttribute("open");
          handleCardAction(actionBtn.dataset.act, card.dataset.id, card);
          return;
       }
       if (e.target.closest(".song-row-menu")) return;
       openSongInEditor(card.dataset.id);
    });
    // Enter or Space opens a focused row. Interactive descendants keep their own keys.
    track?.addEventListener("keydown", (e) => {
       if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button, summary, input, a")) {
          const card = e.target.closest(".song-card");
          if (card) {
             e.preventDefault();
             openSongInEditor(card.dataset.id);
          }
       }
    });

    // New song: name the first version and choose a mode before opening the editor.
    // Guarded so starting fresh cannot silently discard unsaved edits.
   function startNewSongFlow() {
      guardUnsavedThen(() => {
         openNewSongDialog({
            title: "New Song",
            desc: "Name the first arrangement, then pick a writing mode to start.",
            defaultLabel: "Version 1",
         }).then((result) => {
            if (!result) return; // user cancelled
            initNewSong(result.mode, result.label);
         });
      });
   }

   /** Initialize a blank project and land on the edit page (Logic 1). */
   function initNewSong(mode, versionLabel) {
      const isNumbers = mode === "numbers";
      bridge.applyProject(blankProject(mode));
      bridge.setCloudContext({ songId: null, versionId: null, versionLabel });
      // A brand-new draft exists only in the editor — mark it as unsaved from
      // the start so the yellow badge on "Save to Cloud" is lit and leaving to
      // My Songs (or browser back) validates via the unsaved-changes guard.
      bridge.markDirty();
      navigate("#/song/new");
      toast(`Started a new ${isNumbers ? "Nashville numbers" : "chord chart"} song`);
   }

    // Attach Link opens a local preview before importing the shared song.
   async function attachLinkFlow() {
      const text = await openAttachLinkDialog();
      if (!text) return;
      const payload = extractPayloadFromLink(text);
      if (!payload) {
         await openConfirmDialog({
            title: "Invalid link",
            message:
               "That does not look like a valid share link. Please check that you copied the whole link and try again.",
            confirmLabel: "OK",
            cancelLabel: "Close",
            icon: "warning",
         });
         return;
      }
      await importFromPayload(payload);
   }

    $("#newSongBtn")?.addEventListener("click", () => {
      if (homeTab === "albums") {
         openAlbumNewSongFromHome();
         return;
      }
      startNewSongFlow();
    });
    $("#attachLinkBtn")?.addEventListener("click", attachLinkFlow);
    document.addEventListener("click", (event) => {
       document.querySelectorAll(".song-row-menu[open]").forEach((menu) => {
          if (!menu.contains(event.target)) menu.removeAttribute("open");
       });
    });
}

// Shared import flow: decode a payload, show a preview confirm, and (on accept)
// load it into the editor. Used by BOTH the Attach Link button and a directly
// opened #/import?d=... link. Guarded by importInFlight so an in-progress import
// (e.g. from the route) isn't re-triggered by a subsequent navigate/applyRoute.
async function importFromPayload(payload) {
   if (importInFlight) return;
   importInFlight = true;
   try {
      let song;
      try {
         song = await decodeShare(payload);
      } catch (error) {
         console.error("[cloudUI] Import decode error:", error);
         await openConfirmDialog({
            title: "Could not read link",
            message:
               "This link could not be decoded. It may be from a different app version or was corrupted during copy/paste.",
            confirmLabel: "OK",
            cancelLabel: "Close",
            icon: "warning",
         });
         return;
      }
      const previewText = `Import this song?\n\nTitle: ${(song.title || "Untitled").trim() || "Untitled"}\nArtist: ${(song.artist || "").trim() || "—"}\nKey: ${song.key || "—"}\nMeter: ${song.meter || "—"}\nSections: ${(song.sections || []).length}`;
      const confirmed = await openConfirmDialog({
         title: "Import Shared Song",
         message: previewText,
         confirmLabel: "Load & Use",
         cancelLabel: "Cancel",
         icon: "link",
      });
      if (!confirmed) return;
      bridge.applyProject(song);
      bridge.setCloudContext(null);
      // Go to the editor screen (NOT #/import, which would re-run this flow).
      navigate("#/song/new");
      toast("Song loaded — click Save to Cloud to keep it");
   } finally {
      importInFlight = false;
   }
}

// Save to Cloud (topbar)
// Persist a staged "version details" edit (rename / YouTube link) in the scope
// of the OPEN document: an album version is written to
// albums/{id}/songs/{id}/versions and a My Songs version to
// users/{uid}/songs/{id}/versions. Shared by BOTH branches of saveToCloud so a
// rename can never land in the wrong library, and the denormalized latest-*
// fields on the parent doc follow along.
async function saveToCloud() {
   if (!isConfigured()) {
      toast("Cloud is not configured yet");
      return false;
   }
   if (!getCurrentUser()) {
      showLoginPage();
      toast("Sign in to save to the cloud");
      return false;
   }
   try {
      const project = bridge.getProject();
      const ctx = bridge.getCloudContext() || {};
      // Album scope (Fase 3/4): an OWNER saves in place; a MEMBER can only save a
      // private copy to their own library (the album itself stays read-only).
      // Deteksi album BERLAPIS — context → memo modul → URL saat ini — supaya
      // konteks album tidak pernah "hilang" hanya karena ctx/URL tertimpa oleh
      // alur lain (ganti versi, New Version, dst.). Selama sebuah album terbuka,
      // save TIDAK BOLEH jatuh ke cabang My Songs (apalagi membuat lagu baru di
      // My Songs).
      const route = parseRoute(location.hash);
      const activeAlbumId =
         (ctx.scope === "album" && ctx.albumId)
            ? ctx.albumId
            : cloudUIState.activeAlbumCtx?.albumId
               ? cloudUIState.activeAlbumCtx.albumId
               : route.name === "editor" && route.albumId
                  ? route.albumId
                  : null;
      if (activeAlbumId) {
         // Ambil role & nama album yang LIVE dari Firestore (bukan ctx.role yang
         // bisa basi/hilang) sebelum memutuskan arah penyimpanan.
         let role = ctx.role || cloudUIState.activeAlbumCtx?.role || null;
         let albumName = ctx.albumName || cloudUIState.activeAlbumCtx?.albumName || "Album";
         try {
            const album = await getAlbum(activeAlbumId);
            role = album.role;
            albumName = album.name || albumName;
         } catch (error) {
            toast("Could not load the album — please try again");
            return false;
         }
         if (role === "owner") {
            const next = await saveToAlbum(activeAlbumId, project, { songId: ctx.songId, versionId: ctx.versionId, versionLabel: ctx.versionLabel });
            const albumContext = { ...next, scope: "album", albumId: activeAlbumId, albumName, role: "owner" };
            // Version details (rename / YouTube link) are written by the dialog itself, in
            // ALBUM scope — never through the My Songs helpers.
            bridge.setCloudContext(albumContext);
            setActiveAlbumCtx(albumContext);
            syncVersionPill();
            bridge.markSaved();
            flashSavedState();
            toast("Saved to album");
            return true;
         }
         const confirmed = await openConfirmDialog({
            title: "Save a copy to My Songs?",
            message: "You are viewing an album arrangement (read-only). Save a private copy to your own library so you can edit it freely.",
            confirmLabel: "Save a copy",
            cancelLabel: "Cancel",
            icon: "copy",
         });
         if (!confirmed) return false;
         try {
            const copied = await copyAlbumSongToMySongs(activeAlbumId, ctx.songId, { preferVersionId: ctx.versionId || undefined });
            // The editor now owns the user's private COPY: move the context AND the
            // URL to My Songs, so later saves no longer target the album.
            bridge.setCloudContext({ songId: copied.songId, versionId: copied.versionId, versionLabel: copied.versionLabel });
            setActiveAlbumCtx(null);
            if (copied.songId) {
               navigate(
                  copied.versionId
                     ? `#/song/${encodeURIComponent(copied.songId)}/v/${encodeURIComponent(copied.versionId)}`
                     : `#/song/${encodeURIComponent(copied.songId)}/new`,
               );
            }
            syncVersionPill();
            bridge.markSaved();
            flashSavedState();
            toast("Copied to your library");
            return true;
         } catch (error) {
            toast("Could not copy that song");
            return false;
         }
      }
      const title = project.title || "Untitled";
      const artist = project.artist || "";
      let nextContext;
      if (ctx.songId) {
         const songId = ctx.songId;
         if (ctx.versionId) {
            // Editing an existing arrangement: update the version doc in place.
            await saveVersion(songId, ctx.versionId, project, { label: ctx.versionLabel });
            nextContext = { songId, versionId: ctx.versionId, versionLabel: ctx.versionLabel };
         } else {
            // Song exists but currently has no versions (add-state): this save
            // becomes its (new) first version.
            const created = await saveVersion(songId, null, project, { label: ctx.versionLabel || "Version 1" });
            await updateLatestVersion(songId, created.versionId, created.label, 1, project.editorMode, project.youtubeId || undefined, project.key, project.meter, project.bpm);
            nextContext = { songId, versionId: created.versionId, versionLabel: created.label };
         }
         await updateSongMeta(songId, {
            title,
            artist,
            // The just-saved version is now the topmost (newest `updatedAt`), so the
            // denormalized summary — and the library card's mode — follows it.
            latestVersionId: nextContext.versionId,
            latestVersionLabel: nextContext.versionLabel,
            latestEditorMode: normalizeEditorMode(project.editorMode),
            latestKey: project.key || "",
            latestMeter: project.meter || "",
            latestBPM: Number(project.bpm) || "",
         });
      } else {
         // Brand-new song: metadata + its first version are created together.
         // Final assertion: reaching here with an album still in scope (context,
         // memo or URL) must be impossible — fail loudly instead of silently
         // creating a stray song in My Songs.
         if (ctx.albumId || cloudUIState.activeAlbumCtx?.albumId || (route.name === "editor" && route.albumId)) {
            throw new Error("Album save salah arah diblokir — pastikan lagu dibuka dari Album.");
         }
         const createdSong = await createSong({ title, artist });
         const created = await saveVersion(createdSong.songId, null, project, { label: ctx.versionLabel || "Version 1" });
         await updateLatestVersion(createdSong.songId, created.versionId, created.label, 1, project.editorMode, project.youtubeId || undefined, project.key, project.meter, project.bpm);
         nextContext = { songId: createdSong.songId, versionId: created.versionId, versionLabel: created.label };
      }
      // Version details (rename / YouTube link) are written by the dialog itself.
      bridge.setCloudContext(nextContext);
      // This document is a My Songs song from now on: drop any album memo so a
      // later save can never be redirected into an album by stale state.
      setActiveAlbumCtx(null);
      syncVersionPill();
      bridge.markSaved();
      flashSavedState();
      toast("Saved to cloud");
      return true;
   } catch (error) {
      toast(isFirestorePermissionsError(error) ? "Save blocked — check Firestore security rules" : "Could not save to cloud");
      return false;
   }
}

// Account menu (profile card with sign out; login prompt when signed out)
function closeAccountMenu() {
   const pop = $("#accountPopover");
   const btn = $("#accountBtn");
   if (!pop || pop.hidden) return;
   pop.classList.remove("is-open");
   btn?.setAttribute("aria-expanded", "false");
   setTimeout(() => {
      pop.hidden = true;
   }, 160);
}

function closeAlbumAccountMenu() {
   const pop = $("#albumAccountPopover");
   const btn = $("#albumAccountBtn");
   if (!pop || pop.hidden) return;
   pop.classList.remove("is-open");
   btn?.setAttribute("aria-expanded", "false");
   setTimeout(() => {
      pop.hidden = true;
   }, 160);
}

function initAccountButton() {
   const btn = $("#accountBtn");
   const pop = $("#accountPopover");
   pop?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...pop.querySelectorAll('[role="menuitem"]:not([hidden]):not(:disabled)')];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (current + delta + items.length) % items.length;
      items[nextIndex].focus();
   });

   btn?.addEventListener("click", (e) => {
      // Signed out: the button is a straight call to action, not a menu.
      if (!getCurrentUser()) {
         showLoginPage();
         return;
      }
      if (!pop) return;
      e.stopPropagation();
      const isOpen = !pop.hidden;
      if (isOpen) {
         closeAccountMenu();
         return;
      }
      pop.hidden = false;
      void pop.offsetHeight; // commit the closed start state before animating
       pop.classList.add("is-open");
       btn.setAttribute("aria-expanded", "true");
       setTimeout(() => pop.querySelector('[role="menuitem"]:not([hidden])')?.focus(), 0);
   });

   // Dismiss on outside click and on Escape (standard menu behaviour).
   document.addEventListener("click", (e) => {
      if (!pop || pop.hidden) return;
      if (e.target.closest(".account-menu")) return;
      closeAccountMenu();
   });
   document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pop && !pop.hidden) {
         closeAccountMenu();
         btn?.focus();
      }
   });
   // The theme switch lives inside the card; keep the card open after toggling
   // so the user can see the result (events.js handles the actual theming).
   $("#themeToggle")?.addEventListener("click", (e) => e.stopPropagation());

   // Album-detail profile button. Same menu contract as the library's account
   // button, with its own popover instance so the album screen never depends on
   // the hidden My Songs modal.
   const albumBtn = $("#albumAccountBtn");
   const albumPop = $("#albumAccountPopover");
   albumPop?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...albumPop.querySelectorAll('[role="menuitem"]:not([hidden]):not(:disabled)')];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (current + delta + items.length) % items.length;
      items[nextIndex].focus();
   });
   albumBtn?.addEventListener("click", (event) => {
      if (!getCurrentUser()) {
         showLoginPage();
         return;
      }
      if (!albumPop) return;
      event.stopPropagation();
      if (!albumPop.hidden) {
         closeAlbumAccountMenu();
         return;
      }
      albumPop.hidden = false;
      void albumPop.offsetHeight;
      albumPop.classList.add("is-open");
      albumBtn.setAttribute("aria-expanded", "true");
      setTimeout(() => albumPop.querySelector('[role="menuitem"]:not([hidden])')?.focus(), 0);
   });
   document.addEventListener("click", (event) => {
      if (!albumPop || albumPop.hidden) return;
      if (event.target.closest(".album-detail-account")) return;
      closeAlbumAccountMenu();
   });
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && albumPop && !albumPop.hidden) {
         closeAlbumAccountMenu();
         albumBtn?.focus();
      }
   });

    $("#signOutBtn")?.addEventListener("click", (event) => signOutFrom(event.currentTarget, closeAccountMenu));
    $("#albumSignOutBtn")?.addEventListener("click", (event) => signOutFrom(event.currentTarget, closeAlbumAccountMenu));
}

// One sign-out flow for both profile buttons (My Songs and album detail). The
// button passed in is the one that shows the busy state; the close callback
// closes the matching popover.
async function signOutFrom(signOutButton, closeMenu) {
   if (!signOutButton || signOutButton.disabled) return;
   const confirmed = await openConfirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to open your cloud library.",
      confirmLabel: "Sign out",
      cancelLabel: "Cancel",
      icon: "leave",
      danger: true,
   });
   if (!confirmed) return;
   const originalMarkup = signOutButton.innerHTML;
   signOutButton.disabled = true;
   signOutButton.setAttribute("aria-busy", "true");
   signOutButton.textContent = "Signing out…";
   try {
      await signOutUser();
      bridge.setCloudContext(null);
      setActiveAlbumCtx(null);
      closeMenu?.();
      toast("Signed out");
   } catch (error) {
      toast("Could not sign out");
   } finally {
      signOutButton.disabled = false;
      signOutButton.innerHTML = originalMarkup;
      signOutButton.removeAttribute("aria-busy");
   }
}

// Public init
// Albums tab, detail, join/invite/members, and editor scope.
let albumInviteResolve = null; // invite dialog promise (null = closed)
let albumJoinResolve = null;
let newAlbumResolve = null;
let addSongResolve = null;
let membersResolve = null;
let chooseAlbumResolve = null; // New-Song-in-Album chooser promise
let chosenAlbumId = null;

function setAlbumsState(state) {
   // "loading" | "skeleton" | "empty" | "no-results" | "error" | "ready"
   const list = $("#albumsGalleryCards");
   const load = $("#albumsLoading");
   const empty = $("#albumsEmpty");
   const err = $("#albumsError");
   const none = $("#albumsNoResults");
   if (list) list.hidden = state !== "ready" && state !== "skeleton";
   if (load) load.hidden = state !== "loading";
   if (empty) empty.hidden = state !== "empty";
   if (err) err.hidden = state !== "error";
   if (none) none.hidden = state !== "no-results";
}

// Loading placeholders keep the final geometry instead of drawing a generic
// "card": the library row reuses the real `.song-card.is-index-row` classes, so
// its columns and responsive breakpoints cannot drift from the data it stands
// in for. Flat tone bars only — the DESIGN doc's no-shimmer loading rule.
const SKELETON_ROW_COUNT = 8;
const SKELETON_ALBUM_COUNT = 4;

function skeletonRowMarkup() {
   return `
      <div class="song-card library-song-row is-index-row library-skeleton-row" aria-hidden="true">
         <span class="song-card-cover sk-cover"></span>
         <div class="song-card-identity">
            <span class="skeleton-bar sk-title-bar"></span>
            <span class="skeleton-bar sk-sub-bar"></span>
         </div>
         <div class="song-card-detail">
            <span class="song-card-arrangement skeleton-bar"></span>
            <span class="song-card-updated skeleton-bar"></span>
         </div>
         <span class="song-card-media"><span class="skeleton-bar skeleton-media-bar"></span></span>
         <div class="song-card-dock">
            <div class="song-card-meta">
               <span class="song-card-chip is-key"><span class="skeleton-bar sk-key-bar"></span></span>
               <span class="song-card-chip is-meter"><span class="song-card-meter"><span class="skeleton-bar sk-meter-bar"></span><span class="skeleton-bar sk-bpm-bar"></span></span></span>
            </div>
            <div class="song-card-actions">
               <span class="skeleton-bar sk-open-bar"></span>
               <span class="skeleton-bar sk-menu-bar"></span>
            </div>
         </div>
      </div>`;
}

function renderSkeletonRows(track, count = SKELETON_ROW_COUNT) {
   if (!track) return;
   track.dataset.skeleton = "1";
   track.setAttribute("aria-busy", "true");
   track.innerHTML = Array.from({ length: count }, skeletonRowMarkup).join("");
}

function skeletonAlbumMarkup() {
   return `
      <div class="skeleton-card is-album" aria-hidden="true">
         <div class="skeleton-album-head">
            <span class="skeleton-bar sk-role"></span>
            <span class="skeleton-bar sk-menu"></span>
         </div>
         <span class="skeleton-bar sk-album-title"></span>
         <span class="skeleton-bar sk-album-sub"></span>
         <span class="skeleton-bar sk-album-sub is-short"></span>
         <div class="skeleton-album-tracks">
            <span class="skeleton-bar sk-track"></span>
            <span class="skeleton-bar sk-track is-short"></span>
            <span class="skeleton-bar sk-track is-short"></span>
         </div>
         <div class="skeleton-album-foot">
            <span class="skeleton-bar sk-stats"></span>
            <span class="skeleton-bar sk-open"></span>
         </div>
      </div>`;
}

function renderSkeletonAlbums(track, count = SKELETON_ALBUM_COUNT) {
   if (!track) return;
   track.dataset.skeleton = "1";
   track.setAttribute("aria-busy", "true");
   track.innerHTML = Array.from({ length: count }, skeletonAlbumMarkup).join("");
}

// Drop the placeholder rows on success/error without touching real content that
// may already be on screen during a warm refresh.
function clearSkeletonTrack(track) {
   if (!track) return;
   track.removeAttribute("aria-busy");
   if (track.dataset.skeleton === "1") {
      track.innerHTML = "";
      delete track.dataset.skeleton;
   }
}

// Editor loading sheet.
// A ticket prevents a slower earlier fetch from hiding the skeleton while a
// newer song/version is still loading. The default paper stays in the DOM but is
// hidden by CSS only while data-editor-loading is set; print and the PDF pane
// explicitly restore it.
let editorLoadingTicket = 0;

function setEditorLoading(active, label = "Loading song…") {
   const root = document.documentElement;
   const viewport = $("#previewViewport");
   const skeleton = $("#editorSkeleton");
   const status = $("#editorLoadingStatus");
   const actions = document.querySelector(".topbar-actions");
   if (active) {
      // A stale HTML shell must never hide the real paper behind a skeleton
      // that is not there.
      if (!skeleton) return;
      root.dataset.editorLoading = "1";
      skeleton.hidden = false;
      if (status) {
         status.hidden = false;
         status.textContent = label;
      }
      // The topbar still describes the document being replaced. Freeze its
      // mutations (Save, Export, transport, history) until the fetch settles;
      // Back stays available.
      if (actions) actions.setAttribute("inert", "");
      if (viewport) {
         viewport.setAttribute("aria-busy", "true");
         viewport.scrollLeft = 0;
         viewport.scrollTop = 0;
      }
   } else {
      delete root.dataset.editorLoading;
      if (skeleton) skeleton.hidden = true;
      if (status) status.hidden = true;
      if (actions) actions.removeAttribute("inert");
      if (viewport) viewport.removeAttribute("aria-busy");
   }
}

// Bring the editor frame forward as soon as a song/version fetch starts. Without
// this the library would stay on screen while Firestore answers, so the loading
// sheet existed but nobody could see it.
function revealEditorLoadingSurface() {
   // Hard cut, not closeModal(): its 300ms hide timer could race a fast failure
   // and hide the library again right after we navigate back to it.
   for (const id of ["#mySongsModal", "#albumModal"]) {
      const modal = $(id);
      if (!modal) continue;
      modal.classList.remove("is-open");
      modal.hidden = true;
   }
   document.documentElement.dataset.screen = "editor";
}

function beginEditorLoading(label) {
   const ticket = ++editorLoadingTicket;
   // A stale HTML shell without the sheet must not hide the library behind a
   // loading surface that cannot render.
   if ($("#editorSkeleton")) revealEditorLoadingSurface();
   setEditorLoading(true, label);
   return ticket;
}

function endEditorLoading(ticket) {
   if (ticket !== editorLoadingTicket) return;
   setEditorLoading(false);
}

// Owners are shown as MD (Music Director).
// Firestore stores exactly two roles: `owner` (full access) and `member`
// (read-only). Musicians do not say "owner"/"co-owner" — the person who leads
// the band is the MUSIC DIRECTOR — so every screen prints **MD**. These two
// helpers are the single source of truth for that wording:
//   roleShortLabel(role) → the pill/label text (also used by the album cards,
//                          the album header and the video/album pickers)
//   roleMarker(role)     → the "(MD)" marker printed right after a name in the
//                          Members list: bold (inherited) + ITALIC
function albumExtraStamp(album) {
   return `${album.songCount ?? "?"}:${album.updatedAt ?? 0}`;
}

function readCachedAlbumExtras(album) {
   const cached = albumCardExtras.get(album.albumId);
   if (!cached) return null;
   if (cached.stamp !== albumExtraStamp(album)) return null;
   if (Date.now() - cached.at > ALBUM_EXTRA_TTL) return null;
   return cached;
}

// "Updated 2 hours ago" reads as a sentence: the two capitalised relative words
// become lower case, while a real date ("Mar 3") keeps its capital.
function albumTracksMarkup(album) {
   const cached = readCachedAlbumExtras(album);
   if (cached && Array.isArray(cached.tracks)) {
      const chips = albumTrackChipsMarkup(cached.tracks, album.songCount);
      if (!chips) return "";
      return `<div class="album-index-tracks" data-album-tracks><span class="album-index-tracks-label">Recent arrangements</span><div class="album-index-track-row">${chips}</div></div>`;
   }
   if (!album.songCount) return "";
   // Placeholder chips at the real size, so the card never jumps when the
   // preview arrives. Hidden from assistive tech — it carries no information.
   return `<div class="album-index-tracks" data-album-tracks aria-hidden="true">
      <span class="album-index-tracks-label">Recent arrangements</span>
      <div class="album-index-track-row"><span class="album-index-track is-pending"></span><span class="album-index-track is-pending is-short"></span></div>
   </div>`;
}

// Exported for the card renderer's tests and harness.
export function albumCardMarkup(album) {
   return buildAlbumCardMarkup(album, {
      readCachedAlbumExtras,
      albumTracksMarkup,
      descMax: ALBUM_DESC_MAX,
      mdLabel: MD_LABEL,
      mdTitle: MD_TITLE,
   });
}

function renderAlbums(list) {
   const grid = $("#albumsGalleryCards");
   if (!grid) return;
   grid.innerHTML = (list || []).map((album) => albumCardMarkup(album)).join("");
   grid.removeAttribute("aria-busy");
   delete grid.dataset.skeleton;
   observeAlbumCards();
}

// Card extras: recent arrangements and member count.
// Read lazily and per visible card: opening the tab costs one count() and one
// 3-document query per card that is actually on screen, never a full album read.
let albumCardObserver = null;

function paintAlbumExtras(card, extras) {
   if (!card || !card.isConnected) return;
   const tracksBox = card.querySelector("[data-album-tracks]");
   if (tracksBox) {
      const album = cachedAlbums.find((item) => item.albumId === card.dataset.albumId);
      const chips = Array.isArray(extras.tracks) ? albumTrackChipsMarkup(extras.tracks, album?.songCount) : "";
      if (chips) {
         tracksBox.hidden = false;
         tracksBox.removeAttribute("aria-hidden");
         const row = tracksBox.querySelector(".album-index-track-row");
         if (row) row.innerHTML = chips;
      } else {
         tracksBox.remove();
      }
   }
   const membersEl = card.querySelector("[data-album-members]");
   if (membersEl && Number.isFinite(extras.members)) {
      const count = Math.max(0, Math.round(extras.members));
      membersEl.textContent = `${count} member${count === 1 ? "" : "s"}`;
      membersEl.hidden = false;
   }
}

async function hydrateAlbumCard(card) {
   const album = cachedAlbums.find((item) => item.albumId === card.dataset.albumId);
   if (!album) return;
   const cached = readCachedAlbumExtras(album);
   if (cached) {
      paintAlbumExtras(card, cached);
      return;
   }
   if (albumExtraInFlight.has(album.albumId)) return;
   albumExtraInFlight.add(album.albumId);
   const [tracks, members] = await Promise.allSettled([
      listAlbumSongPreview(album.albumId, ALBUM_TRACK_PREVIEW),
      countAlbumMembers(album.albumId),
   ]);
   albumExtraInFlight.delete(album.albumId);
   const extras = {
      stamp: albumExtraStamp(album),
      at: Date.now(),
      tracks: tracks.status === "fulfilled" && Array.isArray(tracks.value) ? tracks.value : null,
      members: members.status === "fulfilled" && Number.isFinite(members.value) ? members.value : null,
   };
   // Cache only a successful read, so a transient failure retries next time.
   if (extras.tracks || extras.members !== null) albumCardExtras.set(album.albumId, extras);
   // The grid may have re-rendered while the reads were in flight (search typing):
   // paint whichever card is live now, not the detached node.
   const live = [...document.querySelectorAll("#albumsGalleryCards [data-album-id]")].find(
      (el) => el.dataset.albumId === album.albumId,
   );
   if (live) paintAlbumExtras(live, extras);
}

function observeAlbumCards() {
   const grid = $("#albumsGalleryCards");
   if (!grid) return;
   const cards = [...grid.querySelectorAll(".album-index-card")];
   if (!cards.length) return;
   if (typeof IntersectionObserver !== "function") {
      cards.forEach((card) => hydrateAlbumCard(card));
      return;
   }
   if (!albumCardObserver) {
      albumCardObserver = new IntersectionObserver(
         (entries) => {
            for (const entry of entries) {
               if (!entry.isIntersecting) continue;
               albumCardObserver.unobserve(entry.target);
               hydrateAlbumCard(entry.target);
            }
         },
         { root: grid.closest(".albums-body") || null, rootMargin: "160px 0px" },
      );
   }
   cards.forEach((card) => albumCardObserver.observe(card));
}

// Filter and sort.
function albumMatchesRole(album) {
   if (albumRoleFilter === "owner") return album.role === "owner";
   if (albumRoleFilter === "member") return album.role !== "owner";
   return true;
}

function visibleAlbums() {
   const term = ($("#albumSearch")?.value || "").trim().toLowerCase();
   const list = cachedAlbums.filter((album) => {
      if (!albumMatchesRole(album)) return false;
      if (!term) return true;
      return (album.name || "").toLowerCase().includes(term) || (album.description || "").toLowerCase().includes(term);
   });
   if (albumSortMode === "title") {
      return list.sort((a, b) =>
         (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
      );
   }
   return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function syncAlbumFilterCounts() {
   const counts = { all: cachedAlbums.length, owner: 0, member: 0 };
   for (const album of cachedAlbums) counts[album.role === "owner" ? "owner" : "member"] += 1;
   for (const key of Object.keys(counts)) {
      const el = document.querySelector(`[data-album-count="${key}"]`);
      if (el) el.textContent = String(counts[key]);
   }
}

// Client-side view over cachedAlbums: search + role filter + sort. Counts on the
// filter segments always describe the WHOLE album list, not the searched subset,
// so "Managed by me (2)" never turns into a moving target while typing.
function applyAlbumFilter() {
   syncAlbumFilterCounts();
   if ($("#albumsGalleryCards")?.dataset.skeleton === "1") return;
   if (!cachedAlbums.length) {
      setAlbumsState("empty");
      renderAlbums([]);
      return;
   }
   const filtered = visibleAlbums();
   if (!filtered.length) {
      setAlbumsState("no-results");
      renderAlbums([]);
      return;
   }
   setAlbumsState("ready");
   renderAlbums(filtered);
}

function setAlbumRoleFilter(role) {
   albumRoleFilter = role === "owner" || role === "member" ? role : "all";
   for (const button of document.querySelectorAll("[data-album-role]")) {
      const active = button.dataset.albumRole === albumRoleFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
   }
   applyAlbumFilter();
}

async function refreshAlbums() {
   const grid = $("#albumsGalleryCards");
   const warm = hasLoadedAlbums && cachedAlbums.length > 0;
   if (!warm) {
      setAlbumsState("skeleton");
      renderSkeletonAlbums(grid);
      setLoadStatus("albumsLoadingStatus", "Loading your albums…");
   } else {
      setLoadStatus("albumsLoadingStatus", "");
   }
   try {
      cachedAlbums = await listAlbums();
      hasLoadedAlbums = true;
      clearSkeletonTrack(grid);
      // Header title + count follow the active view (albums).
      updateHomeHeading();
      applyAlbumFilter();
      setLoadStatus("albumsLoadingStatus", "");
   } catch (error) {
      const code = String(error?.code || "");
      const message = String(error?.message || error || "");
      console.error(`[cloudUI] listAlbums failed [code=${code}]`, error);
      if (!warm) {
         clearSkeletonTrack(grid);
         setAlbumsState("error");
         setLoadStatus("albumsLoadingStatus", "");
      }
      const indexHint = /requires an index|failed.precondition|index/i.test(message) && !/permission/i.test(message)
         ? " Firebase Console → Firestore → Indexes → create the suggested index."
         : "";
      toast(
         `Could not ${warm ? "refresh" : "load"} albums${isFirestorePermissionsError(error) ? " — check Firestore security rules." : " — check your connection and the Firestore security rules."}${indexHint}`,
      );
   }
}

// Album-detail song list. The rows deliberately reuse the My Songs index
// anatomy (`is-index-row`): mode tile, song/artist, key, meter, arrangement,
// video, updated and actions. The album-specific work lives in the row menu
// (remove / save a copy) and in the notation filter above the sheet.
function syncAlbumSongFilterCounts() {
   const counts = albumSongFilterCounts(cachedAlbumSongs);
   for (const mode of ["all", "chords", "numbers", "chordpro"]) {
      const count = document.querySelector(`[data-album-song-count="${mode}"]`);
      if (count) count.textContent = String(counts[mode]);
      const icon = document.querySelector(`[data-album-song-icon="${mode}"]`);
      if (icon && !icon.firstChild) icon.innerHTML = albumSongFilterIcon(mode);
      const button = document.querySelector(`[data-album-song-mode="${mode}"]`);
      if (!button) continue;
      const active = albumSongFilterMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
   }
}

// Search matches what the row shows, plus the plain-language names people type
// for each mode ("nashville", "chord chart"). Accidentals are folded so "f#"
// finds "F♯m" and "bb" finds "B♭".
function visibleAlbumSongs() {
   const term = foldAlbumSearch($("#albumSongSearch")?.value);
   return cachedAlbumSongs.filter((song) => {
      if (albumSongFilterMode !== "all" && albumSongMode(song) !== albumSongFilterMode) return false;
      return !term || albumSongSearchText(song).includes(term);
   });
}

function updateAlbumSongSearchClear() {
   const clear = $("#albumSongSearchClear");
   if (clear) clear.hidden = !String($("#albumSongSearch")?.value || "").trim();
}

function setAlbumListState(state) {
   // "loading" | "skeleton" | "empty" | "no-results" | "error" | "ready"
   const list = $("#albumSongCards");
   const load = $("#albumLoading");
   const empty = $("#albumEmpty");
   const none = $("#albumNoResults");
   const error = $("#albumError");
   if (list) list.hidden = state !== "ready" && state !== "skeleton";
   if (load) load.hidden = state !== "loading";
   if (empty) empty.hidden = state !== "empty";
   if (none) none.hidden = state !== "no-results";
   if (error) error.hidden = state !== "error";
}

function renderAlbumSongs(list) {
   const track = $("#albumSongCards");
   if (!track) return;
   const role = currentAlbum?.role || "member";
   track.innerHTML = list.map((song) => albumSongRowMarkup(song, role)).join("");
   track.removeAttribute("aria-busy");
   delete track.dataset.skeleton;
   const hint = $("#albumEmptyHint");
   if (hint) {
      hint.textContent = role === "member"
         ? "No songs here yet. Check back soon, or ask an owner to add arrangements."
         : "Use New Song or Add from My Songs to fill this album.";
   }
}

function applyAlbumSongFilter() {
   syncAlbumSongFilterCounts();
   updateAlbumSongSearchClear();
   if ($("#albumSongCards")?.dataset.skeleton === "1") return;
   const filtered = visibleAlbumSongs();
   if (!cachedAlbumSongs.length) {
      setAlbumListState("empty");
      renderAlbumSongs([]);
      return;
   }
   if (!filtered.length) {
      setAlbumListState("no-results");
      renderAlbumSongs([]);
      return;
   }
   setAlbumListState("ready");
   renderAlbumSongs(filtered);
}

function setAlbumSongFilterMode(mode) {
   albumSongFilterMode = ["all", "chords", "numbers", "chordpro"].includes(mode) ? mode : "all";
   applyAlbumSongFilter();
}

function resetAlbumSongFilters() {
   albumSongFilterMode = "all";
   const input = $("#albumSongSearch");
   if (input) input.value = "";
   applyAlbumSongFilter();
}

async function refreshAlbumSongs() {
   const track = $("#albumSongCards");
   const albumId = currentAlbum?.albumId;
   if (!albumId) return;
   const request = ++albumSongsRequest;
   const warm = albumSongsReady && cachedAlbumSongs.length > 0;
   if (!warm) {
      setAlbumListState("skeleton");
      renderSkeletonRows(track, 6);
      setLoadStatus("albumLoadingStatus", "Loading album songs…");
   } else {
      setLoadStatus("albumLoadingStatus", "");
   }
   try {
      const songs = await listAlbumSongs(albumId);
      if (request !== albumSongsRequest || currentAlbum?.albumId !== albumId) return;
      cachedAlbumSongs = songs;
      albumSongsReady = true;
      clearSkeletonTrack(track);
      renderAlbumHeader();
      applyAlbumSongFilter();
      setLoadStatus("albumLoadingStatus", "");
   } catch (error) {
      if (request !== albumSongsRequest || currentAlbum?.albumId !== albumId) return;
      albumSongsReady = false;
      const message = isFirestorePermissionsError(error)
         ? "Could not load songs. Check Firestore security rules."
         : "Could not load songs. Check your connection and try again.";
      if (!warm) {
         clearSkeletonTrack(track);
         const errorMessage = $("#albumErrorMessage");
         if (errorMessage) errorMessage.textContent = message;
         setAlbumListState("error");
         setLoadStatus("albumLoadingStatus", "");
      } else {
         toast(message);
      }
   }
}

function albumSongCountForHeader() {
   const fallback = Number(currentAlbum?.songCount);
   if (albumSongsReady) return cachedAlbumSongs.length;
   return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}

function renderAlbumInviteChip() {
   const chip = $("#albumInviteChip");
   if (!chip || !currentAlbum) return;
   const code = currentAlbum.role === "owner"
      ? String(currentAlbum.activeInviteCode || "").trim()
      : "";
   chip.hidden = !code;
   if (!code) return;
   const value = $("#albumInviteCode");
   if (value) value.textContent = code;
   const copy = $("#albumInviteCopyBtn");
   if (copy) {
      copy.dataset.code = code;
      copy.title = `Copy invite code ${code}`;
      copy.setAttribute("aria-label", `Copy invite code ${code}`);
   }
}

function renderAlbumMemberChip() {
   if (!currentAlbum) return;
   const button = $("#albumMembersBtn");
   const label = $("#albumMemberCount");
   const count = Number(currentAlbum.memberCount);
   const isOwner = currentAlbum.role === "owner";
   const text = Number.isFinite(count) && count > 0
      ? `${count} member${count === 1 ? "" : "s"}`
      : "Members";
   if (label) label.textContent = text;
   if (button) {
      button.hidden = false;
      button.title = isOwner ? "View and manage members" : "View members";
      button.setAttribute("aria-label", `${text}, ${isOwner ? "manage" : "view"}`);
   }
}

// One count() read when the album opens. A rules/offline failure only leaves the
// chip at "Members"; the dialog itself loads the full list on demand.
async function hydrateAlbumMemberCount(albumId) {
   try {
      const count = await countAlbumMembers(albumId);
      if (!currentAlbum || currentAlbum.albumId !== albumId) return;
      currentAlbum.memberCount = count;
      renderAlbumMemberChip();
   } catch {
      /* Keep the neutral "Members" label. */
   }
}

function resetAlbumHeaderForLoad() {
   const title = $("#albumTitle");
   if (title) title.textContent = "Album";
   const description = $("#albumDescription");
   if (description) {
      description.textContent = "";
      description.hidden = true;
   }
   const meta = $("#albumMeta");
   if (meta) {
      meta.textContent = "";
      meta.hidden = true;
   }
   const glyph = $("#albumHeroGlyph");
   if (glyph) glyph.textContent = "A";
   const updated = $("#albumUpdated");
   if (updated) updated.textContent = "";
   const updatedSep = $("#albumUpdatedSep");
   if (updatedSep) updatedSep.hidden = true;
   const roleChip = $("#albumRoleChip");
   if (roleChip) roleChip.classList.remove("is-owner");
   const roleText = $("#albumRoleLabel");
   if (roleText) roleText.textContent = "Role";
   const inviteChip = $("#albumInviteChip");
   if (inviteChip) inviteChip.hidden = true;
   const readonlyNote = $("#albumReadonlyNote");
   if (readonlyNote) readonlyNote.hidden = true;
   const actions = $(".album-detail-actions");
   if (actions) actions.classList.remove("is-member");
   for (const id of ["albumMembersBtn", "albumInviteBtn", "albumAddFromBtn", "albumNewSongBtn", "albumLeaveBtn"]) {
      const button = $(`#${id}`);
      if (button) button.hidden = true;
   }
}

function renderAlbumHeader() {
   if (!currentAlbum) return;
   const title = $("#albumTitle");
   const description = $("#albumDescription");
   const meta = $("#albumMeta");
   const updated = $("#albumUpdated");
   const updatedSep = $("#albumUpdatedSep");
   const isOwner = currentAlbum.role === "owner";
   const roleLabel = roleShortLabel(currentAlbum.role);
   if (title) title.textContent = currentAlbum.name;
   if (description) {
      const text = String(currentAlbum.description || "").trim();
      description.textContent = text;
      description.hidden = !text;
   }
   const heroGlyph = $("#albumHeroGlyph");
   if (heroGlyph) heroGlyph.textContent = (currentAlbum.name || "A").trim().charAt(0).toUpperCase() || "A";
   const songCount = albumSongCountForHeader();
   const songLabel = `${songCount} song${songCount === 1 ? "" : "s"}`;
   const date = currentAlbum.createdAt ? new Date(currentAlbum.createdAt).toLocaleDateString() : "";
   if (meta) {
      meta.textContent = `${songLabel}${date ? ` · Created ${date}` : ""}`;
      meta.hidden = false;
   }
   const updatedText = currentAlbum.updatedAt ? relativeWhen(currentAlbum.updatedAt) : "";
   if (updated) updated.textContent = updatedText ? `Updated ${updatedText}` : "";
   if (updatedSep) updatedSep.hidden = !updatedText;
   const roleChip = $("#albumRoleChip");
   const roleText = $("#albumRoleLabel");
   if (roleText) roleText.textContent = isOwner ? `Role: ${MD_TITLE} (${roleLabel})` : "Role: Member (read-only)";
   if (roleChip) {
      roleChip.classList.toggle("is-owner", isOwner);
      roleChip.title = isOwner ? `${MD_TITLE}, full album control` : "Read-only album member";
   }
   renderAlbumMemberChip();
   renderAlbumInviteChip();
   const actions = $(".album-detail-actions");
   if (actions) actions.classList.toggle("is-member", !isOwner);
   const readonlyNote = $("#albumReadonlyNote");
   if (readonlyNote) readonlyNote.hidden = isOwner;
   const invite = $("#albumInviteBtn");
   const addFrom = $("#albumAddFromBtn");
   const newSong = $("#albumNewSongBtn");
   const leave = $("#albumLeaveBtn");
   if (invite) invite.hidden = !isOwner;
   if (addFrom) addFrom.hidden = !isOwner;
   if (newSong) newSong.hidden = !isOwner;
   if (leave) leave.hidden = false; // anyone may leave — member OR MD
}

async function openAlbumDetail(albumId) {
   const modal = $("#albumModal");
   if (!modal) return;
   closeModal($("#mySongsModal"));
   closeAlbumAccountMenu();
   openModal(modal);
   document.documentElement.dataset.screen = "album-detail";
   albumSongsRequest += 1;
   currentAlbum = null;
   cachedAlbumSongs = [];
   albumSongFilterMode = "all";
   albumSongsReady = false;
   // Clear the previous album's rows and search before the fetch so reopening
   // the screen never flashes another album's setlist or a stale query.
   const previousList = $("#albumSongCards");
   if (previousList) previousList.innerHTML = "";
   const search = $("#albumSongSearch");
   if (search) search.value = "";
   updateAlbumSongSearchClear();
   syncAlbumSongFilterCounts();
   resetAlbumHeaderForLoad();
   // The list frame stays put while the album document and its songs load.
   setAlbumListState("skeleton");
   renderSkeletonRows($("#albumSongCards"), 6);
   try {
      currentAlbum = await getAlbum(albumId);
   } catch (error) {
      toast("Could not open that album");
      navigate("#/albums");
      return;
   }
   renderAlbumHeader();
   void hydrateAlbumMemberCount(albumId);
   await refreshAlbumSongs();
}

function albumEditorUrl(albumId, songId, versionId) {
   if (!songId) return `#/album/${encodeURIComponent(albumId)}/new`;
   return versionId
      ? `#/album/${encodeURIComponent(albumId)}/${encodeURIComponent(songId)}/v/${encodeURIComponent(versionId)}`
      : `#/album/${encodeURIComponent(albumId)}/${encodeURIComponent(songId)}`;
}

// Route version CRUD to the active scope.
function isAlbumCtx(ctx) {
   return !!ctx && ctx.scope === "album" && !!ctx.albumId;
}
async function loadSongMetaFor(ctx) {
   return isAlbumCtx(ctx) ? loadAlbumSongMeta(ctx.albumId, ctx.songId) : loadSongMeta(ctx.songId);
}
async function loadVersionFor(ctx, versionId) {
   return isAlbumCtx(ctx) ? loadAlbumVersion(ctx.albumId, ctx.songId, versionId) : loadVersion(ctx.songId, versionId);
}
async function listVersionsFor(ctx) {
   return isAlbumCtx(ctx) ? listAlbumVersions(ctx.albumId, ctx.songId) : listVersions(ctx.songId);
}
async function saveVersionFor(ctx, versionId, data, opts) {
   return isAlbumCtx(ctx) ? saveAlbumVersion(ctx.albumId, ctx.songId, versionId, data, opts) : saveVersion(ctx.songId, versionId, data, opts);
}
async function deleteVersionFor(ctx, versionId) {
   return isAlbumCtx(ctx) ? deleteAlbumVersion(ctx.albumId, ctx.songId, versionId) : deleteVersion(ctx.songId, versionId);
}
async function updateLatestFor(ctx, versionId, label, count, editorMode, youtubeId, key, meter, bpm) {
   if (isAlbumCtx(ctx)) return updateAlbumLatestVersion(ctx.albumId, ctx.songId, versionId, label, count, editorMode, youtubeId, key, meter, bpm);
   return updateLatestVersion(ctx.songId, versionId, label, count, editorMode, youtubeId, key, meter, bpm);
}
// Preserve scope fields when updating the cloud context in the editor.
// `role` matters too: syncAlbumContextUI derives the pill/label/read-only state
// from it, and saveToCloud prefers the live role from Firestore but falls back
// to this one when the album read fails.
function nextCtx(ctx, patch) {
   if (isAlbumCtx(ctx)) {
      return {
         ...ctx,
         ...patch,
         scope: "album",
         albumId: ctx.albumId,
         albumName: ctx.albumName,
         role: ctx.role || null,
      };
   }
   return { ...ctx, ...patch };
}
// URL for the current version of the active context.
function ctxEditorUrl(ctx) {
   if (isAlbumCtx(ctx)) return albumEditorUrl(ctx.albumId, ctx.songId, ctx.versionId);
   return editorRoute();
}

// Open an album arrangement in the editor (owner edits in place; a member gets a
// read-only session + "Save a copy" action).
async function openAlbumSongInEditor(albumId, songId, versionId) {
   await guardUnsavedThen(async () => {
      const loading = beginEditorLoading("Loading song…");
      try {
         let albumName = currentAlbum?.name || "";
         let role = currentAlbum?.role || "member";
         if (!currentAlbum) {
            try {
               const a = await getAlbum(albumId);
               albumName = a.name;
               role = a.role;
            } catch {
               /* fall back to member */
            }
         }
         const meta = await loadAlbumSongMeta(albumId, songId);
         if (meta.legacy) {
            bridge.applyProject(meta);
            bridge.setCloudContext({ scope: "album", albumId, albumName, songId, versionId: null, versionLabel: "", role });
            endEditorLoading(loading);
            navigate(`#/album/${encodeURIComponent(albumId)}/${encodeURIComponent(songId)}`);
            toast(`Opened "${meta.title || "Untitled"}"`);
            return;
         }
         let version = null;
         if (versionId) version = await loadAlbumVersion(albumId, songId, versionId);
         else if (meta.latestVersionId) version = await loadAlbumVersion(albumId, songId, meta.latestVersionId);
         if (version) {
            bridge.applyProject(composeSong(meta, version));
            bridge.setCloudContext({ scope: "album", albumId, albumName, songId, versionId: version.versionId, versionLabel: version.label || "", role });
            endEditorLoading(loading);
            navigate(albumEditorUrl(albumId, songId, version.versionId));
            toast(`Opened "${meta.title || "Untitled"}" — ${version.label || "Version"}`);
         } else {
            // No arrangements yet → require a version name first.
            endEditorLoading(loading);
            const created = await openNewSongDialog({
               title: "Add First Version",
               desc: `"${meta.title || "Untitled"}" has no versions yet. Enter a version name, then pick a writing mode to start.`,
               defaultLabel: "Version 1",
            });
            if (!created) {
               navigate(`#/albums/${encodeURIComponent(albumId)}`);
               return;
            }
            bridge.applyProject(blankProject(created.mode, { title: meta.title || "Song Title", artist: meta.artist || "Artist / Composer" }));
            bridge.setCloudContext({ scope: "album", albumId, albumName, songId, versionId: null, versionLabel: created.label, role });
            navigate(albumEditorUrl(albumId, songId, null));
            toast(`Version "${created.label}" ready for "${meta.title || "Untitled"}"`);
         }
      } catch (error) {
         toast("Could not open that song");
         navigate(`#/albums/${encodeURIComponent(albumId)}`, { replace: true });
      } finally {
         endEditorLoading(loading);
      }
   });
}

// An MD starts a brand-new song DIRECTLY inside the album (no My Songs copy).
async function openAlbumNewSongFlow(albumId, { replaceHistory } = {}) {
   let album = currentAlbum;
   let albumName = currentAlbum?.name || "";
   let role = currentAlbum?.role || "member";
   if (!album) {
      try {
         album = await getAlbum(albumId);
         albumName = album.name;
         role = album.role;
      } catch {
         toast("Could not open that album");
         navigate("#/albums");
         return;
      }
   }
   const created = await openNewSongDialog({
      title: "New Song in Album",
      desc: `This song will be saved directly to "${albumName}" — your own library is not affected.`,
      defaultLabel: "Version 1",
   });
   if (!created) {
      if (!replaceHistory) navigate(`#/albums/${encodeURIComponent(albumId)}`);
      else navigate(HOME_ROUTE);
      return;
   }
   bridge.applyProject(blankProject(created.mode));
   bridge.setCloudContext({ scope: "album", albumId, albumName, songId: null, versionId: null, versionLabel: created.label, role });
   // A brand-new draft exists only in the editor — mark it unsaved from the start
   // (exactly like "New Song" in My Songs) so the yellow badge lights up on the
   // "Save to Album" button and leaving via Back / browser Back / reload runs the
   // unsaved-changes guard instead of silently dropping the new song.
   bridge.markDirty();
   navigate(albumEditorUrl(albumId, null, null));
   syncAlbumContextUI();
}

// "New Song" pressed while on the ALBUMS tab: create the song DIRECTLY inside an
// owned album (never touches My Songs). One owned album → go; several → ask.
async function openAlbumNewSongFromHome() {
   await guardUnsavedThen(async () => {
      let owned = [];
      try {
         owned = (await listAlbums()).filter((a) => a.role === "owner");
      } catch (error) {
         console.error("[cloudUI] listAlbums failed (New Song in album):", error);
         toast("Could not load your albums — please try again.");
         return;
      }
      if (!owned.length) {
         toast("You need an album first — create one, then songs can be saved directly to it.");
         await openNewAlbumDialog();
         return;
      }
      const album = owned.length === 1 ? owned[0] : await openChooseAlbumDialog(owned);
      if (!album) return;
      openAlbumNewSongFlow(album.albumId, { replaceHistory: false });
   });
}

// Pick which owned album receives a new song (shown only when owning several).
function closeChooseAlbumDialog(result) {
   const resolve = chooseAlbumResolve;
   chooseAlbumResolve = null;
   closeModal($("#chooseAlbumDialog"));
   resolve?.(result);
}
function openChooseAlbumDialog(albums) {
   const d = $("#chooseAlbumDialog");
   const list = $("#chooseAlbumList");
   if (!d) return Promise.resolve(null);
   if (chooseAlbumResolve) { const prev = chooseAlbumResolve; chooseAlbumResolve = null; prev(null); }
   chosenAlbumId = null;
   if (list) {
      list.innerHTML = albums
         .map(
            (a, i) => `<label class="add-song-option">
                 <input type="radio" name="chooseAlbumChoice" value="${escapeHtml(a.albumId)}" ${i === 0 ? "checked" : ""} />
                 <span class="add-song-option-text">
                    <strong>${escapeHtml(a.name)}</strong>
                    <small>${a.songCount} song${a.songCount === 1 ? "" : "s"} · ${MD_LABEL}</small>
                 </span>
              </label>`,
         )
         .join("");
      list.querySelectorAll('input[name="chooseAlbumChoice"]').forEach((r) =>
         r.addEventListener("change", () => { chosenAlbumId = r.value; }),
      );
      const first = list.querySelector('input[name="chooseAlbumChoice"]');
      chosenAlbumId = first ? first.value : null;
   }
   return new Promise((resolve) => {
      chooseAlbumResolve = resolve;
      openModal(d);
   });
}
async function submitChooseAlbum() {
   const album = chosenAlbumId ? cachedAlbums.find((a) => a.albumId === chosenAlbumId) || { albumId: chosenAlbumId } : null;
   closeChooseAlbumDialog(album || null);
}

// Reflect the active album context in the editor topbar: a context pill and (for
// members) a read-only banner + a "Save a copy" affordance instead of "Save".
function syncAlbumContextUI() {
   const ctx = bridge.getCloudContext?.() || null;
   const isAlbum = isAlbumCtx(ctx);
   // Keep the album memo in sync with the OPEN document (see activeAlbumCtx):
   // an album-scoped context arms it, anything else (My Songs song or a fresh
   // draft) clears it. Doing it here means no call site can forget it.
   if (isAlbum) setActiveAlbumCtx({ albumId: ctx.albumId, albumName: ctx.albumName, role: ctx.role });
   else setActiveAlbumCtx(null);
   // Role yang belum termuat (null) TIDAK boleh diasumsikan sebagai "member":
   // kalau role hilang, tampilan tetap netral dan saveToCloud akan mengambil
   // role LIVE dari Firestore saat penyimpanan (owner selalu tersimpan ke Album).
   const role = ctx?.role || null;
   const isMember = role === "member";
   const isOwner = role === "owner";
   const name = ctx?.albumName || "Album";
   // Members of an album get a READ-ONLY chord canvas in the editor (events.js
   // checks this flag on every chord-entry path).
   document.body.dataset.memberReadonly = isAlbum && isMember ? "1" : "0";
   const pill = $("#albumPill");
   const pillText = $("#albumPillText");
   if (pill && pillText) {
      pill.hidden = !isAlbum;
      pillText.textContent = isAlbum ? (isOwner ? `Album: ${name}` : isMember ? `Album (read-only): ${name}` : `Album: ${name}`) : "";
      pill.classList.toggle("is-readonly", isAlbum && isMember);
   }
   const banner = $("#albumReadOnlyBanner");
   if (banner) banner.hidden = !(isAlbum && isMember);
   const saveBtn = $("#saveCloudBtn");
   if (saveBtn) {
      const label = isAlbum ? (isMember ? "Save a copy" : "Save to Album") : "Save to Cloud";
      saveBtn.innerHTML = `<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="m8 17 4-4 4 4"/></svg></span><span class="btn-label">${label}</span>`;
      saveBtn.setAttribute("data-save-label", label);
      saveBtn.title = label;
   }
   // Version management is owner-only inside an album.
   const newVersionBtn = $("#versionNewBtn");
   if (newVersionBtn) newVersionBtn.hidden = isAlbum && role !== "owner";
   // Back button keeps the generic "← Back" label (album detail has its own
// "← Back to Albums" button); the tooltip stays descriptive.
   const backBtn = $("#backToSongsBtn");
   if (backBtn) {
      // Set the whole content explicitly — never touch "a text node", because
      // the FIRST text node is the whitespace before the arrow (which caused a
      // duplicate "Back" label).
      backBtn.innerHTML = `<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg></span><span class="btn-label">Back</span>`;
      backBtn.title = isAlbum ? "Back to album songs" : "Back to My Songs";
   }
   // The button label just changed ("Save to Album" / "Save a copy"), so refresh
   // the unsaved-changes badge + its accessible label for the ACTIVE scope.
   updateSaveButtonDirty(bridge.hasUnsavedChanges?.() ?? false);
}

// Join album dialog.
function closeJoinAlbumDialog(result) {
   const resolve = albumJoinResolve;
   albumJoinResolve = null;
   closeModal($("#joinAlbumDialog"));
   resolve?.(result);
}
function openJoinAlbumDialog() {
   const d = $("#joinAlbumDialog");
   const input = $("#joinAlbumCode");
   const err = $("#joinAlbumError");
   if (!d) return Promise.resolve(null);
   if (albumJoinResolve) { const prev = albumJoinResolve; albumJoinResolve = null; prev(null); }
   if (input) { input.value = ""; input.classList.remove("is-invalid"); }
   if (err) err.hidden = true;
   return new Promise((resolve) => {
      albumJoinResolve = resolve;
      openModal(d);
      setTimeout(() => input?.focus(), 60);
   });
}
async function submitJoinAlbum() {
   const input = $("#joinAlbumCode");
   const err = $("#joinAlbumError");
   const code = (input?.value || "").trim();
   if (!normalizeInviteCode(code)) {
      if (err) { err.textContent = "Enter an 8-character code like ABCD-1234."; err.hidden = false; }
      input?.classList.add("is-invalid");
      return;
   }
   try {
      const result = await joinAlbum(code);
      closeJoinAlbumDialog(result);
      toast(result.alreadyMember ? "You are already a member of that album." : "Joined the album!");
      if (result.albumId) navigate(`#/albums/${encodeURIComponent(result.albumId)}`);
      else await refreshAlbums();
   } catch (error) {
      if (err) { err.textContent = error?.message || "Could not join that album."; err.hidden = false; }
      input?.classList.add("is-invalid");
   }
}

// New album dialog.
function closeNewAlbumDialog(result) {
   const resolve = newAlbumResolve;
   newAlbumResolve = null;
   closeModal($("#newAlbumDialog"));
   resolve?.(result);
}
function openNewAlbumDialog() {
   const d = $("#newAlbumDialog");
   if (!d) return Promise.resolve(null);
   if (newAlbumResolve) { const prev = newAlbumResolve; newAlbumResolve = null; prev(null); }
   const name = $("#newAlbumName");
   const err = $("#newAlbumNameError");
   const desc = $("#newAlbumDesc");
   if (name) { name.value = ""; name.classList.remove("is-invalid"); }
   if (err) err.hidden = true;
   if (desc) desc.value = "";
   return new Promise((resolve) => {
      newAlbumResolve = resolve;
      openModal(d);
      setTimeout(() => name?.focus(), 60);
   });
}
async function submitNewAlbum() {
   const name = $("#newAlbumName");
   const err = $("#newAlbumNameError");
   const desc = $("#newAlbumDesc");
   const title = (name?.value || "").trim();
   if (!title) {
      if (err) err.hidden = false;
      name?.classList.add("is-invalid");
      name?.focus();
      return;
   }
   try {
      const { albumId } = await createAlbum({ name: title, description: desc?.value || "" });
      closeNewAlbumDialog({ albumId });
      toast("Album created — invite your team from the Invite button.");
      navigate(`#/albums/${encodeURIComponent(albumId)}`);
   } catch (error) {
      console.error("[cloudUI] createAlbum failed:", error);
      if (err) { err.textContent = "Could not create the album."; err.hidden = false; }
      toast(isFirestorePermissionsError(error) ? "Create blocked — check Firestore security rules" : "Could not create the album — try again");
   }
}

// Edit album dialog for owners.
// Opened by the pencil action on an album card. This is intentionally its OWN
// dialog instead of switching the New Album dialog into an "edit" mode, so the
// create flow (prefill, autofocus, validation, navigation) stays untouched.
// It prefills the CURRENT values and writes through updateAlbum(); songs,
// members and invite codes are never touched.
let editAlbumResolve = null;
let editAlbumId = null;
function closeEditAlbumDialog(result) {
   const resolve = editAlbumResolve;
   const id = editAlbumId;
   editAlbumResolve = null;
   editAlbumId = null;
   closeModal($("#editAlbumDialog"));
   resolve?.(result ? { ...result, albumId: id } : null);
}
function openEditAlbumDialog(albumId) {
   const d = $("#editAlbumDialog");
   if (!d) return Promise.resolve(null);
   const album = cachedAlbums.find((a) => a.albumId === albumId) || null;
   if (!album) {
      toast("Could not open that album for editing");
      return Promise.resolve(null);
   }
   if (editAlbumResolve) { const prev = editAlbumResolve; editAlbumResolve = null; prev(null); }
   const name = $("#editAlbumName");
   const err = $("#editAlbumNameError");
   const desc = $("#editAlbumDesc");
   if (name) { name.value = album.name || ""; name.classList.remove("is-invalid"); }
   if (err) err.hidden = true;
   if (desc) desc.value = album.description || "";
   editAlbumId = albumId;
   return new Promise((resolve) => {
      editAlbumResolve = resolve;
      openModal(d);
      setTimeout(() => name?.focus(), 60);
   });
}
async function submitEditAlbum() {
   const albumId = editAlbumId;
   if (!albumId) return;
   const name = $("#editAlbumName");
   const err = $("#editAlbumNameError");
   const desc = $("#editAlbumDesc");
   const title = (name?.value || "").trim();
   if (!title) {
      if (err) { err.textContent = "Album name is required."; err.hidden = false; }
      name?.classList.add("is-invalid");
      name?.focus();
      return;
   }
   try {
      await updateAlbum(albumId, { name: title, description: desc?.value || "" });
      // Keep the album detail view (if it is open in memory) and the card list in
      // sync — the cards read name/description from cachedAlbums.
      if (currentAlbum?.albumId === albumId) {
         currentAlbum.name = title;
         currentAlbum.description = desc?.value || "";
         renderAlbumHeader();
      }
      closeEditAlbumDialog({ name: title });
      toast("Album updated");
      await refreshAlbums();
   } catch (error) {
      console.error("[cloudUI] updateAlbum failed:", error);
      if (err) { err.textContent = "Could not save the album."; err.hidden = false; }
      toast(
         isFirestorePermissionsError(error)
            ? "Save blocked — check Firestore security rules"
            : "Could not update the album — try again",
      );
   }
}

// Invite dialog for owners.
function closeInviteDialog() {
   const resolve = albumInviteResolve;
   albumInviteResolve = null;
   closeModal($("#inviteDialog"));
   resolve?.(true);
}
async function refreshInviteCodeIntoDialog(andCopy) {
   try {
      const code = (await getInviteCode(currentAlbum.albumId)) || null;
      const value = $("#inviteCodeValue");
      if (value) value.textContent = code || "—";
      if (currentAlbum) {
         currentAlbum.activeInviteCode = code || "";
         renderAlbumInviteChip();
      }
      if (code && andCopy) {
         const ok = await copyTextToClipboard(code);
         if (ok) {
            toast("Invite code copied!");
            flashInviteCopied();
         }
      }
   } catch {
      const value = $("#inviteCodeValue");
      if (value) value.textContent = "—";
   }
}
// In-place copy confirmation on the "Copy" button: the label flips to
// "Copied" for a beat, then restores. A timer guard prevents rapid clicks
// from leaking the temporary label past the timeout.
let inviteCopyTimer = 0;
let inviteCopyLabel = "";
function flashInviteCopied() {
   const btn = $("#inviteCodeCopy");
   if (!btn) return;
   const label = btn.querySelector(".btn-label");
   if (label && !inviteCopyTimer) inviteCopyLabel = label.textContent;
   btn.classList.add("is-copied");
   if (label) label.textContent = "Copied";
   clearTimeout(inviteCopyTimer);
   inviteCopyTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      if (label) label.textContent = inviteCopyLabel;
   }, 1600);
}
async function openInviteDialog() {
   const d = $("#inviteDialog");
   if (!d) return;
   if (albumInviteResolve) { const prev = albumInviteResolve; albumInviteResolve = null; prev(true); }
   openModal(d);
   albumInviteResolve = new Promise(() => {});
   await refreshInviteCodeIntoDialog(false);
}
async function rotateInviteInDialog() {
   if (!currentAlbum) return;
   const confirmed = await openConfirmDialog({
      title: "Create a new code?",
      message: "The current invite code will stop working immediately.",
      confirmLabel: "Create new code",
      cancelLabel: "Cancel",
      icon: "refresh",
   });
   if (!confirmed) return;
   try {
      await rotateInviteCode(currentAlbum.albumId);
      await refreshInviteCodeIntoDialog(true);
      toast("New invite code created and copied!");
   } catch {
      toast("Could not create a new code");
   }
}

// Add-song-to-album dialog for owners.
function closeAddSongDialog(result) {
   const resolve = addSongResolve;
   const trigger = addSongDialogTrigger;
   addSongResolve = null;
   addSongDialogTrigger = null;
   closeModal($("#addSongDialog"));
   setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
   }, 320);
   resolve?.(result);
}
// All My Songs loaded for the Add dialog (kept for client-side search filtering).
let addSongDialogSongs = [];
let addSongDialogTrigger = null;

async function openAddSongDialog(trigger = document.activeElement) {
   const d = $("#addSongDialog");
   if (!d) return;
   if (addSongResolve) { const prev = addSongResolve; addSongResolve = null; prev(null); }
   addSongDialogTrigger = trigger;
   albumSelectedSongId = null;
   const search = $("#addSongSearch");
   if (search) search.value = "";
   openModal(d);
   setTimeout(() => search?.focus(), 40);
   setAddSongDialogState("loading");
   try {
      addSongDialogSongs = await listSongs();
      applyAddSongFilter();
   } catch (error) {
      console.error("[cloudUI] add-song library load failed", error);
      setAddSongDialogState("error");
   }
}

function setAddSongDialogState(state) {
   const list = $("#addSongList");
   const loading = $("#addSongLoading");
   const empty = $("#addSongEmpty");
   const error = $("#addSongError");
   if (list) list.hidden = state !== "ready";
   if (loading) loading.hidden = state !== "loading";
   if (empty) empty.hidden = state !== "empty" && state !== "no-results";
   if (error) error.hidden = state !== "error";
   if (empty && state === "empty") empty.textContent = "Your library is empty. Save a song first, or create one directly in the album.";
   if (empty && state === "no-results") empty.textContent = "No songs match your search.";
   const addButton = $("#addSongOk");
   if (addButton) addButton.disabled = state !== "ready" || !albumSelectedSongId;
}

// Filter the Add-from-My-Songs list by the in-dialog search field.
function applyAddSongFilter() {
   const list = $("#addSongList");
   const term = ($("#addSongSearch")?.value || "").trim().toLowerCase();
   if (!addSongDialogSongs.length) {
      if (list) list.innerHTML = "";
      albumSelectedSongId = null;
      setAddSongDialogState("empty");
      return;
   }
   const filtered = term
      ? addSongDialogSongs.filter((s) => (s.title || "").toLowerCase().includes(term) || (s.artist || "").toLowerCase().includes(term))
      : addSongDialogSongs;
    if (!filtered.length) {
      if (list) list.innerHTML = "";
      albumSelectedSongId = null;
      setAddSongDialogState("no-results");
      return;
    }
    if (list) {
      list.innerHTML = filtered
         .map(
            (s, i) => {
               const mode = normalizeEditorMode(s.latestEditorMode || s.editorMode);
               const modeLabel = editorModeMeta[mode]?.badge || "Chord Chart";
               const key = s.latestKey || s.key || "";
               const meter = s.latestMeter || s.meter || "";
               const bpm = Number(s.latestBPM || s.bpm) || "";
               const versions = typeof s.versionCount === "number"
                  ? `${s.versionCount} version${s.versionCount === 1 ? "" : "s"}`
                  : "";
               const meta = [
                  s.artist || "Unknown",
                  versions,
                  key ? `Key ${key}` : "",
                  meter ? `${meter}${bpm ? ` · ${bpm} BPM` : ""}` : "",
               ].filter(Boolean).join(" · ");
               return `<label class="add-song-option">
                 <span class="mode-tile is-${mode} add-song-option-mode" title="${escapeHtml(modeLabel)}" aria-label="${escapeHtml(modeLabel)}">${libraryModeIcon(mode, "mode-mark")}</span>
                 <span class="add-song-option-text">
                    <strong>${escapeHtml(s.title)}</strong>
                    <small>${escapeHtml(meta)}</small>
                 </span>
                 <input type="radio" name="addSongChoice" value="${escapeHtml(s.cloudId)}" ${i === 0 ? "checked" : ""} />
              </label>`;
            },
         )
         .join("");
       list.querySelectorAll('input[name="addSongChoice"]').forEach((r) =>
         r.addEventListener("change", () => {
            albumSelectedSongId = r.value;
            setAddSongDialogState("ready");
         }),
       );
      const first = list.querySelector('input[name="addSongChoice"]');
      albumSelectedSongId = first ? first.value : null;
   }
   setAddSongDialogState("ready");
}
async function submitAddSong() {
   if (!currentAlbum || !albumSelectedSongId) return;
   try {
      const result = await addSongToAlbum(currentAlbum.albumId, albumSelectedSongId);
      const count = Number(result?.versionCount) || 0;
      closeAddSongDialog({ added: true });
      toast(count > 1 ? `Added to the album — ${count} versions copied` : "Song added to the album");
      await refreshAlbumSongs();
      renderAlbumHeader();
   } catch (error) {
      toast("Could not add that song");
   }
}

// Members dialog.
// Role NAMING lives in roleShortLabel()/roleMarker() above; this section owns the
// CONTROLS. Every verb lives in the member-actions sheet (#memberActionsDialog),
// which is used at EVERY width: a row carries exactly one ⋮ "Manage" button and
// the status stays where it belongs, in the bold-italic (MD) marker after a name.
// Reason: the old inline role buttons read as a STATUS badge — "Andi 🎼 MD" looks
// like it states that Andi IS an MD, not that pressing it makes him one. A ⋮ is
// unambiguous ("there are actions behind this"), and phones get the very same
// sheet instead of a separate code path.
// `member` = { uid, name, isMd }.
let memberActionMembers = [];
let memberActionsTrigger = null;
function memberActionsOpen() {
   // Null-safe on purpose: if the markup is missing (e.g. a service-worker-cached
   // index.html), this must read as CLOSED — otherwise the Escape chain below
   // would swallow the key and the album dialogs could never be dismissed.
   const d = $("#memberActionsDialog");
   return !!d && !d.hidden;
}
function closeMemberActionsDialog({ restoreFocus = true } = {}) {
   const trigger = memberActionsTrigger;
   memberActionsTrigger = null;
   if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      // The list can be re-rendered while the sheet is open (an action does
      // exactly that), which leaves `trigger` detached and unfocusable — then the
      // Members dialog's Done button takes the focus instead of the <body>.
      if (restoreFocus) {
         setTimeout(() => {
            // A HIDDEN trigger cannot take focus: on a phone the ⋮ is display:none
            // (the row's chevron is the affordance there), so the Members dialog's
            // Done button receives the focus instead of the <body>.
            const visible = trigger.isConnected && !!trigger.offsetParent;
            if (visible) trigger.focus();
            else $("#albumMembersClose")?.focus();
         }, 320);
      }
   }
   closeModal($("#memberActionsDialog"));
}
function openMemberActionsDialog(member, trigger = null) {
   const d = $("#memberActionsDialog");
   if (!d || !member) return;
   const who = member.name || member.email || "Member";
   const avatar = $("#memberActionsAvatar");
   const title = $("#memberActionsTitle");
   const desc = $("#memberActionsDesc");
   if (avatar) avatar.textContent = who.trim().charAt(0).toUpperCase();
   if (title) title.textContent = `Manage ${who}${member.isMd ? ` (${MD_LABEL})` : ""}`;
   if (desc) desc.textContent = `${member.email || "—"} · ${member.isMd ? `${MD_LABEL} — full access` : "Member · read-only"}`;
   const body = $("#memberActionsBody");
   if (body) body.innerHTML = memberControlsMarkup(member);
   // Remember where to put the focus back, and tell assistive tech that the ⋮ now
   // has its dialog open (the same aria-expanded contract as #versionSwitcherBtn).
   memberActionsTrigger = trigger && trigger.isConnected ? trigger : null;
   memberActionsTrigger?.setAttribute("aria-expanded", "true");
   openModal(d);
   // Keyboard parity with the app's other dialogs (see openConfirmDialog): focus
   // the first action so the sheet is operable the moment it appears.
   setTimeout(() => {
      ($("#memberActionsBody [data-member-action]") || $("#memberActionsClose"))?.focus();
   }, 40);
}

function closeMembersDialog() {
   const resolve = membersResolve;
   membersResolve = null;
   // The whole dialog is going away: the ⋮ inside it must not take the focus back.
   closeMemberActionsDialog({ restoreFocus: false });
   closeModal($("#albumMembersDialog"));
   resolve?.(true);
   if (currentAlbum) void hydrateAlbumMemberCount(currentAlbum.albumId);
}
async function openMembersDialog() {
   const d = $("#albumMembersDialog");
   const list = $("#memberList");
   const desc = $("#albumMembersDesc");
   const summary = $("#memberDialogSummary");
   if (!d) return;
   if (!currentAlbum) return;
   if (membersResolve) { const prev = membersResolve; membersResolve = null; prev(true); }
   const isOwner = currentAlbum?.role === "owner";
   const meUid = getCurrentUser()?.uid;
   const wasHidden = d.hidden;
   openModal(d);
   if (wasHidden) setTimeout(() => $("#albumMembersClose")?.focus(), 40);
   if (desc) desc.textContent = "Loading members…";
   if (summary) summary.hidden = true;
   if (list) {
      list.setAttribute("aria-busy", "true");
      list.innerHTML = `<div class="member-list-state" role="status">
         <span class="member-list-state-icon" aria-hidden="true"><span class="member-list-spinner"></span></span>
         <span>Loading members…</span>
      </div>`;
   }
   try {
      const members = await listMembers(currentAlbum.albumId);
      // Owners first (creation order), then members (join order).
      const rank = (m) => (m.role === "owner" ? 0 : 1);
      members.sort((a, b) => rank(a) - rank(b) || Number(a.joinedAt || 0) - Number(b.joinedAt || 0));
      const mdCount = members.filter((m) => m.role === "owner").length;
      const memberCount = members.length - mdCount;
      memberActionMembers = members;
      if (currentAlbum) {
         currentAlbum.memberCount = members.length;
         renderAlbumMemberChip();
      }
      if (summary) {
         summary.hidden = false;
         $("#memberMdCount").textContent = String(mdCount);
         $("#memberMdLabel").textContent = `${MD_LABEL}${mdCount === 1 ? "" : "s"}`;
         $("#memberMemberCount").textContent = String(memberCount);
         $("#memberMemberLabel").textContent = `Member${memberCount === 1 ? "" : "s"}`;
         const note = $("#memberDialogSummaryNote");
         if (note) {
            note.textContent = !isOwner
               ? `${MD_LABEL}s manage this list.`
               : isPhone()
                  ? "Tap a person to manage them."
                  : "Use the menu on a person to manage them.";
         }
      }
      if (desc) {
         desc.textContent = `${mdCount} ${MD_LABEL}${mdCount === 1 ? "" : "s"} and ${memberCount} member${memberCount === 1 ? "" : "s"} in this album.`;
      }
      if (list) {
         list.innerHTML = members
            .map((m) => {
               const self = m.uid === meUid;
               const you = self ? ` <em class="member-you">(you)</em>` : "";
               // Name shown for a member: Auth displayName (Google) → derived from
               // the email local part (email/password sign-up has no displayName)
               // → "Musician" as the last resort. The email stays visible below.
               const derived = friendlyName(m);
               const memberName = derived || "Musician";
               const avatarInitial = (derived || m.email || "?").trim().charAt(0).toUpperCase();
               // Role marker sits right after the name: "Dhandy (MD)" — bold
               // (inherited from <strong>) + italic, see .member-md-mark in styles/components/album.css.
               const mdMark = roleMarker(m.role);
               // A row is "manageable" only for ANOTHER MD (never their own:
               // Firestore rules forbid self-writes, which is what keeps the last
               // MD from orphaning the album). A manageable row carries the ⋮
               // "Manage" button (desktop/tablet) plus the phone's chevron
               // affordance; CSS shows exactly ONE of the two per width.
               const manageable = isOwner && !self;
               const controls = manageable
                  ? `${memberManageButtonMarkup({ uid: m.uid, name: memberName })}<span class="member-row-chevron" aria-hidden="true">›</span>`
                  : "";
               return `<div class="member-row${manageable ? " is-manageable" : ""}" data-uid="${escapeHtml(m.uid)}" role="listitem">
                       <span class="member-avatar" aria-hidden="true">${escapeHtml(avatarInitial)}</span>
                       <span class="member-who">
                          <strong>${escapeHtml(memberName)}${mdMark}${you}</strong>
                          <small>${escapeHtml(m.email || "—")}</small>
                       </span>
                       ${controls}
                    </div>`;
            })
            .join("");
      }
   } catch (error) {
      console.error("[cloudUI] listMembers failed:", error);
      if (desc) desc.textContent = "Members could not be loaded.";
      if (summary) summary.hidden = true;
      if (list) {
         list.innerHTML = `<div class="member-list-state is-error" role="alert">
            <span>Check your connection and try again.</span>
            <button class="button button-ghost button-small" type="button" data-members-retry>Try again</button>
         </div>`;
      }
   } finally {
      list?.removeAttribute("aria-busy");
   }
}
async function handleMemberAction(action, uid, members) {
   if (!currentAlbum) return;
   const member = members.find((m) => m.uid === uid);
   if (!member) return;
   const name = member.name || member.email || "this member";
   let confirmed = false;
   if (action === "promote") {
       confirmed = await openConfirmDialog({ title: `Make ${MD_TITLE} (${MD_LABEL})?`, message: `${name} gets full access — edit songs, invite people and manage members.`, confirmLabel: `Make ${MD_LABEL}`, cancelLabel: "Cancel", icon: "music" });
   } else if (action === "demote") {
       confirmed = await openConfirmDialog({ title: "Change back to a member?", message: `${name} becomes a read-only member: they can still play, transpose and export, but no longer edit.`, confirmLabel: "Make member", cancelLabel: "Cancel", icon: "person" });
   } else if (action === "remove") {
       confirmed = await openConfirmDialog({ title: "Remove member?", message: `${name} will lose access to this album.`, confirmLabel: "Remove", cancelLabel: "Cancel", icon: "delete", danger: true });
   }
   if (!confirmed) return;
   try {
      if (action === "promote") await setMemberRole(currentAlbum.albumId, uid, "owner");
      else if (action === "demote") await setMemberRole(currentAlbum.albumId, uid, "member");
      else if (action === "remove") await removeMember(currentAlbum.albumId, uid);
      toast("Members updated");
      await openMembersDialog();
   } catch (error) {
      toast("Could not update the member");
   }
}

// Leave an album as a member or MD.
async function confirmLeaveAlbum() {
   if (!currentAlbum) return;
   const confirmed = await openConfirmDialog({
      title: "Leave album?",
      message: `You will lose access to "${currentAlbum.name}". You can join again with an invite code.`,
      confirmLabel: "Leave album",
      cancelLabel: "Cancel",
      icon: "leave",
      danger: true,
   });
   if (!confirmed) return;
   try {
      await leaveAlbum(currentAlbum.albumId);
      closeModal($("#albumModal"));
      toast("You left the album");
      navigate("#/albums");
   } catch (error) {
      toast(error?.message || "Could not leave the album");
   }
}

// Delete an album from the album list as an owner.
async function confirmDeleteAlbum(album) {
   if (!album?.albumId) return;
   const confirmed = await openConfirmDialog({
      title: "Delete album?",
      message: `"${album.name}" and all its songs will be permanently deleted for everyone.`,
      confirmLabel: "Delete album",
      cancelLabel: "Cancel",
      icon: "delete",
      danger: true,
   });
   if (!confirmed) return;
   try {
      await deleteAlbum(album.albumId);
      closeModal($("#albumModal"));
      toast("Album deleted");
      navigate("#/albums");
   } catch (error) {
      toast("Could not delete the album");
   }
}

// Wire album tabs, buttons, card grids, and dialogs.
function initAlbums() {
   // Home tabs.
    const tabSongs = $("#tabMySongs");
    const tabAlbums = $("#tabAlbums");
    tabSongs?.addEventListener("click", () => navigate("#/songs"));
    tabAlbums?.addEventListener("click", () => navigate("#/albums"));
    // Album-detail appbar keeps the same two destinations visible while an
    // album is open; the active tab is Albums, so both routes leave the detail.
    $("#albumTabMySongs")?.addEventListener("click", () => navigate("#/songs"));
    $("#albumTabAlbums")?.addEventListener("click", () => navigate("#/albums"));
    $(".home-tabs")?.addEventListener("keydown", (event) => {
       if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
       const tabs = [tabSongs, tabAlbums].filter(Boolean);
       const index = tabs.indexOf(event.target);
       if (index < 0) return;
       event.preventDefault();
       const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
       next.focus();
       next.click();
    });

    // Albums tab actions.
    $("#newAlbumBtn")?.addEventListener("click", openNewAlbumDialog);
    $("#joinAlbumBtn")?.addEventListener("click", openJoinAlbumDialog);
    $("#albumSearch")?.addEventListener("input", applyAlbumFilter);
    $("#albumSort")?.addEventListener("change", (event) => {
       albumSortMode = event.target.value === "title" ? "title" : "updated";
       applyAlbumFilter();
    });
    $("#albumRoleFilter")?.addEventListener("click", (event) => {
       const button = event.target.closest("[data-album-role]");
       if (button) setAlbumRoleFilter(button.dataset.albumRole);
    });
    $("#albumsRetry")?.addEventListener("click", refreshAlbums);
    const albumsTrack = $("#albumsGalleryCards");
    albumsTrack?.addEventListener("click", async (e) => {
       const card = e.target.closest(".album-index-card");
       if (!card) return;
       const albumId = card.dataset.albumId;
       const copyBtn = e.target.closest("[data-act='copy-code']");
       if (copyBtn) {
          e.stopPropagation();
          const copied = await copyTextToClipboard(copyBtn.dataset.code || "");
          toast(copied ? "Invite code copied" : "Could not copy the invite code");
          if (copied) {
             copyBtn.classList.add("is-copied");
             setTimeout(() => copyBtn.classList.remove("is-copied"), 1400);
          }
          return;
       }
       const actionBtn = e.target.closest(".song-card-action");
       if (actionBtn) {
          e.stopPropagation();
          actionBtn.closest("details")?.removeAttribute("open");
          const act = actionBtn.dataset.act;
          if (act === "details") openEditAlbumDialog(albumId);
          else if (act === "delete") {
             const album = cachedAlbums.find((a) => a.albumId === albumId);
             if (album) confirmDeleteAlbum(album);
          }
          return;
       }
       if (e.target.closest(".song-row-menu")) return;
       navigate(`#/albums/${encodeURIComponent(albumId)}`);
    });
    albumsTrack?.addEventListener("keydown", (e) => {
       if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button, summary, input, a")) {
          const card = e.target.closest(".album-index-card");
          if (card) { e.preventDefault(); navigate(`#/albums/${encodeURIComponent(card.dataset.albumId)}`); }
       }
    });

   // Album detail header actions.
   $("#albumBackBtn")?.addEventListener("click", () => navigate("#/albums"));
   $("#albumInviteBtn")?.addEventListener("click", openInviteDialog);
   $("#albumMembersBtn")?.addEventListener("click", openMembersDialog);
   $("#albumAddFromBtn")?.addEventListener("click", openAddSongDialog);
   // New Song inside the open album. Guarded like the My Songs "New Song" button
   // so unsaved edits on the currently open arrangement can't be discarded
   // silently (a new album song opens as an unsaved draft).
   const startAlbumNewSong = () => {
      if (!currentAlbum) return;
      guardUnsavedThen(() => openAlbumNewSongFlow(currentAlbum.albumId));
   };
   $("#albumNewSongBtn")?.addEventListener("click", startAlbumNewSong);
   $("#albumLeaveBtn")?.addEventListener("click", confirmLeaveAlbum);
   $("#albumInviteCopyBtn")?.addEventListener("click", async (event) => {
      const code = event.currentTarget.dataset.code || "";
      if (!code) return;
      const copied = await copyTextToClipboard(code);
      toast(copied ? "Invite code copied" : "Could not copy the invite code");
   });

   // Song list filter (notation) and search.
   $("#albumSongFilters")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-album-song-mode]");
      if (button) setAlbumSongFilterMode(button.dataset.albumSongMode);
   });
   $("#albumSongSearch")?.addEventListener("input", applyAlbumSongFilter);
   $("#albumSongSearchClear")?.addEventListener("click", () => {
      const input = $("#albumSongSearch");
      if (input) {
         input.value = "";
         applyAlbumSongFilter();
         input.focus();
      }
   });
   // Same quick-search contract as My Songs: "/" focuses the field unless the
   // user is already typing or a dialog sits above the album detail screen.
   document.addEventListener("keydown", (event) => {
      const modal = $("#albumModal");
      if (!modal || modal.hidden) return;
      const input = $("#albumSongSearch");
      const target = event.target;
      const typing =
         target &&
         (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
         if (document.querySelector(".confirm-dialog:not([hidden])")) return;
         event.preventDefault();
         input?.focus();
         return;
      }
      if (event.key === "Escape" && document.activeElement === input) {
         input.value = "";
         applyAlbumSongFilter();
      }
   });
   $("#albumClearFilters")?.addEventListener("click", () => {
      resetAlbumSongFilters();
      $("#albumSongSearch")?.focus();
   });
   $("#albumRetry")?.addEventListener("click", refreshAlbumSongs);

   // Album song list (delegated): the row opens the arrangement; the menu owns
   // the secondary actions. Same anatomy as My Songs, so keyboard behaviour is
   // identical: Enter/Space on the row opens; controls keep their own keys.
   const albumTrack = $("#albumSongCards");
   albumTrack?.addEventListener("click", (e) => {
      const actionBtn = e.target.closest(".song-card-action");
      const card = e.target.closest(".song-card");
      if (!card) return;
      if (actionBtn) {
         e.stopPropagation();
         actionBtn.closest("details")?.removeAttribute("open");
         const act = actionBtn.dataset.act;
         if (act === "edit") openAlbumSongInEditor(currentAlbum.albumId, card.dataset.id);
         else if (act === "pdf") openAlbumSongPdf(card.dataset.id);
         else if (act === "delete") confirmRemoveAlbumSong(card.dataset.id);
         else if (act === "copy") copyAlbumSong(card.dataset.id);
         return;
      }
      if (e.target.closest(".song-row-menu")) return;
      openAlbumSongInEditor(currentAlbum.albumId, card.dataset.id);
   });
   albumTrack?.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button, summary, input, a")) {
         const card = e.target.closest(".song-card");
         if (card) {
            e.preventDefault();
            openAlbumSongInEditor(currentAlbum.albumId, card.dataset.id);
         }
      }
   });

   // Join dialog.
   $("#joinAlbumOk")?.addEventListener("click", submitJoinAlbum);
   $("#joinAlbumCancel")?.addEventListener("click", () => closeJoinAlbumDialog(null));
   $("#joinAlbumDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-joinalbum-dismiss]")) closeJoinAlbumDialog(null); });
   $("#joinAlbumCode")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitJoinAlbum(); });
   // Live-format the join code as XXXX-XXXX: uppercase, strip separators, cap
   // at 8 chars. Cosmetic only — normalizeInviteCode remains the source of
   // truth on submit. Typing also clears a stale error state.
   $("#joinAlbumCode")?.addEventListener("input", () => {
      const input = $("#joinAlbumCode");
      if (!input) return;
      const token = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      input.value = token.length > 4 ? `${token.slice(0, 4)}-${token.slice(4)}` : token;
      input.classList.remove("is-invalid");
   });

   // New album dialog.
   $("#newAlbumOk")?.addEventListener("click", submitNewAlbum);
   $("#newAlbumCancel")?.addEventListener("click", () => closeNewAlbumDialog(null));
   $("#newAlbumDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-newalbum-dismiss]")) closeNewAlbumDialog(null); });

   // Edit album dialog (album-card pencil action, owners only). Enter in the name
   // field saves, mirroring the join dialog's code field.
   $("#editAlbumOk")?.addEventListener("click", submitEditAlbum);
   $("#editAlbumCancel")?.addEventListener("click", () => closeEditAlbumDialog(null));
   $("#editAlbumDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-editalbum-dismiss]")) closeEditAlbumDialog(null); });
   $("#editAlbumName")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitEditAlbum(); } });

   // Invite dialog.
   $("#inviteDialogClose")?.addEventListener("click", closeInviteDialog);
   $("#inviteCodeCopy")?.addEventListener("click", () => refreshInviteCodeIntoDialog(true));
   $("#inviteCodeRotate")?.addEventListener("click", rotateInviteInDialog);
   $("#inviteDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-invite-dismiss]")) closeInviteDialog(); });

    // Add-song dialog.
    $("#addSongSearch")?.addEventListener("input", applyAddSongFilter);
    $("#addSongRetry")?.addEventListener("click", () => openAddSongDialog(addSongDialogTrigger));
    $("#addSongOk")?.addEventListener("click", submitAddSong);
   $("#addSongCancel")?.addEventListener("click", () => closeAddSongDialog(null));
   $("#addSongDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-addsong-dismiss]")) closeAddSongDialog(null); });

   // Members dialog.
   $("#albumMembersClose")?.addEventListener("click", closeMembersDialog);
   $("#albumMembersDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-albummembers-dismiss]")) closeMembersDialog(); });
   // The member-actions sheet — the one place the verbs live — opens from the row's
   // ⋮ on a desktop/tablet, and from a tap ANYWHERE on the row on a phone (that is
   // where the ⋮ is hidden by CSS and the chevron shows instead). Delegated, so it
   // survives every re-render of the list; both paths open the same sheet with the
   // same two verb buttons, and both use the row's ⋮ as the focus/aria trigger.
   $("#memberList")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-members-retry]")) {
         openMembersDialog();
         return;
      }
      const row = event.target.closest(".member-row.is-manageable");
      if (!row) return;
      const menuBtn = event.target.closest("[data-member-menu]");
      if (!menuBtn && !isPhone()) return;
      const member = memberActionMembers.find((m) => m.uid === row.dataset.uid);
      if (!member) return;
      // The row's own ⋮ is the trigger even when the row was tapped: that is what
      // gets the focus back (and the aria-expanded flag) when the sheet closes.
      openMemberActionsDialog({
         uid: member.uid,
         name: friendlyName(member) || "Musician",
         email: member.email,
         isMd: member.role === "owner",
      }, row.querySelector("[data-member-menu]"));
   });
   // Member-actions sheet: one delegated handler feeds the SAME handleMemberAction
   // the inline buttons use, so both paths stay identical.
   $("#memberActionsDialog")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-memberactions-dismiss]")) { closeMemberActionsDialog(); return; }
      const btn = event.target.closest("#memberActionsBody [data-member-action]");
      if (!btn) return;
      const action = btn.dataset.memberAction;
      const uid = btn.dataset.uid;
      closeMemberActionsDialog();
      handleMemberAction(action, uid, memberActionMembers);
   });

   // Choose-album dialog (New Song while on the Albums tab).
   $("#chooseAlbumOk")?.addEventListener("click", submitChooseAlbum);
   $("#chooseAlbumCancel")?.addEventListener("click", () => closeChooseAlbumDialog(null));
   $("#chooseAlbumDialog")?.addEventListener("click", (e) => { if (e.target.closest("[data-choosealbum-dismiss]")) closeChooseAlbumDialog(null); });

   // Global: Escape closes album dialogs (the member-actions sheet sits ON TOP of
   // the member list, so it goes first).
   document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (memberActionsOpen()) closeMemberActionsDialog();
      else if (albumJoinResolve) closeJoinAlbumDialog(null);
      else if (newAlbumResolve) closeNewAlbumDialog(null);
      else if (editAlbumResolve) closeEditAlbumDialog(null);
      else if (addSongResolve) closeAddSongDialog(null);
      else if (!$("#albumMembersDialog")?.hidden) closeMembersDialog();
      else if (chooseAlbumResolve) closeChooseAlbumDialog(null);
   });
}

async function openAlbumSongPdf(songId) {
   const loading = beginEditorLoading("Preparing PDF…");
   try {
      const full = await loadAlbumSong(currentAlbum.albumId, songId);
      bridge.applyProject(full);
      bridge.setCloudContext({ scope: "album", albumId: currentAlbum.albumId, albumName: currentAlbum.name, songId, versionId: full.versionId || null, versionLabel: full.label || "", role: currentAlbum?.role || "member" });
      endEditorLoading(loading);
      navigate(albumEditorUrl(currentAlbum.albumId, songId, full.versionId || null));
      setTimeout(() => bridge.openPdfOptions(), 340);
   } catch (error) {
      toast("Could not open that song");
      navigate(`#/albums/${encodeURIComponent(currentAlbum.albumId)}`, { replace: true });
   } finally {
      endEditorLoading(loading);
   }
}

async function copyAlbumSong(songId) {
   try {
      await copyAlbumSongToMySongs(currentAlbum.albumId, songId);
      toast("Saved a copy to My Songs");
   } catch (error) {
      toast("Could not copy that song");
   }
}

async function confirmRemoveAlbumSong(songId) {
   const song = cachedAlbumSongs.find((s) => s.songId === songId);
   const title = song?.title || "this song";
   const confirmed = await openConfirmDialog({
      title: "Remove song?",
      message: `Remove "${title}" from this album? This does not affect your own library.`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      icon: "delete",
      danger: true,
   });
   if (!confirmed) return;
   try {
      await deleteAlbumSong(currentAlbum.albumId, songId);
      toast("Song removed from the album");
      await refreshAlbumSongs();
      renderAlbumHeader();
   } catch (error) {
      toast("Could not remove that song");
   }
}


export function initCloudUI(editorBridge) {
   bridge = { ...bridge, ...editorBridge };
   initLogin();
   initGallery();
   initNewSongDialog();
   initVersionCrud();
   initAccountButton();
   initAlbums();
   // Test hook: the per-card Export .file path can't reach Firebase in headless
   // CI, so expose the pure download helper for the regression suite to exercise.
   if (TEST_MODE) window.__cloudDownloadSong = downloadSongFile;
   // Test hook: the old file-upload import flow (an <input type=file> triggered
   // applyProject) was replaced by share-link import, so expose the real
   // applyProject path for the regression suite to import a project directly.
   if (TEST_MODE) window.__cloudImportForTest = (project) => bridge.applyProject(project);
   // Test hook: render N mock cards through the real grid path so the
   // regression suite exercises actual layout (not a DOM stub).
   if (TEST_MODE) {
      window.__cloudRenderMock = (n) => {
         const songs = Array.from({ length: n }, (_, i) => ({
            cloudId: `id${i}`,
            title: ["Amazing Grace", "How Great Is Our God", "10,000 Reasons", "Cornerstone", "Oceans"][i % 5],
            artist: `Artist ${i}`,
            key: "G",
            meter: "4/4",
            sections: [{ name: "Verse" }, { name: "Chorus" }, { name: "Bridge" }],
            versionCount: 3,
            latestVersionId: `v${i}`,
            latestVersionLabel: `Version ${(i % 3) + 1}`,
            latestYoutubeId: i % 3 === 0 ? "dQw4w9WgXcQ" : "",
            latestEditorMode: i % 2 ? "numbers" : "chords",
            latestKey: ["G", "A", "B♭", "C", "D"][i % 5],
            latestMeter: "4/4",
            latestBPM: 68 + (i % 5),
            updatedAt: Date.now() - i * 3600000,
         }));
         renderCards(songs);
         return $("#songCards")?.querySelectorAll(".song-card").length || 0;
      };
      window.__cloudNudge = (dir) => nudgeCarousel(dir);
      window.__cloudScrollLeft = () => $("#songCards")?.scrollLeft || 0;
      window.__cloudUpdateBlur = () => {
         updateEdgeBlur();
         updateNudgeVisibility();
      };
      // Drive the real filter/sort path from the regression harness.
      window.__cloudSetSongs = (songs) => {
         cachedSongs = Array.isArray(songs) ? songs : [];
         hasLoadedSongs = true;
         updateHomeHeading();
         applyFilter();
         return $("#songCards")?.querySelectorAll(".song-card").length || 0;
      };
      window.__cloudApplyFilter = applyFilter;
   }
   $("#saveCloudBtn")?.addEventListener("click", saveToCloud);
   // #4 unsaved-changes indicator: the editor broadcasts a dirty-state change
   // whenever the document is edited (or saved/loaded). Reflect it as a badge on
   // the Save to Cloud button so the user can see at a glance that there is work
   // to persist. The badge is only meaningful when cloud save is possible.
   window.addEventListener("chordsheet:dirtychange", (e) => {
      updateSaveButtonDirty(!!e.detail?.dirty);
   });
   // Editor header: Back returns to home (the library). Guarded so unsaved cloud
   // changes prompt a Save & leave / Leave without saving / Cancel choice first.
   $("#backToSongsBtn")?.addEventListener("click", () => leaveEditorToHome());
   // Browser Back/Forward and manual hash edits re-render the matching screen.
   window.addEventListener("hashchange", () => {
      if (suppressHashHandling) return;
      // Detect a browser Back/Forward (or manual hash edit) that leaves an open
      // editor for home. When audio is playing or there are unsaved cloud
      // changes, we re-pin the editor URL (no new history entry) and route
      // through the async guards so a "Cancel" keeps the user in the editor.
      const from = lastRoute;
      const to = parseRoute(location.hash);
      const leavingEditor = from.name === "editor" && to.name === "home";
      if (leavingEditor && (bridge.isPlaying?.() || (bridge.hasUnsavedChanges() && cloudSaveAvailable()))) {
         const editorHash = editorRoute();
         // Re-pin the URL to the editor without a new history entry, then prompt.
         suppressHashHandling = true;
         history.replaceState(null, "", editorHash);
         suppressHashHandling = false;
         lastHash = editorHash;
         handleLeaveWithGuard();
         return;
      }
      applyRoute();
   });
   // Async tail of the hashchange guard: confirm stopping playback first (if
   // active), then run the unsaved-changes dialog (if needed) before completing
   // the navigation home. Cancelling any step keeps the (re-pinned) editor open.
   async function handleLeaveWithGuard() {
      if (!(await confirmStopPlayback())) {
         applyRoute();
         return;
      }
      if (bridge.hasUnsavedChanges() && cloudSaveAvailable()) {
         guardUnsavedThen(() => navigate(homeTarget()));
      } else {
         navigate(homeTarget());
      }
   }
   // Reload / tab close protection. Custom dialogs can't run here — the browser
   // shows its own native "Leave site?" prompt when we cancel the event. Only
   // arm it when there is genuinely unsaved cloud work to lose. NEVER arm it in
   // TEST_MODE: the regression harness drives navigation via CDP Page.navigate,
   // and a native beforeunload prompt is unanswerable headless — it deadlocks
   // the harness.
   window.addEventListener("beforeunload", (e) => {
      if (TEST_MODE) return;
      if (bridge.hasUnsavedChanges() && cloudSaveAvailable()) {
         e.preventDefault();
         e.returnValue = "";
      }
   });
   // Reflect auth state in the topbar (and route on sign-in/out) as it changes.
   onAuth(reflectAuth);
   // Decide the initial screen (login page vs My Songs) from the restored session.
   routeOnLoad();
   // Control surface for the editor (the dependency graph stays one-way: cloudUI never imports
   // events.js; the editor uses these through the object it gets back from this init).
   return {
      /**
       * Open the version-details dialog for the arrangement that is open (rename / link / delete,
       * written straight to the cloud, scope-aware). Returns null when there is nothing to manage
       * — a local draft or a file-opened song has no version document, and the editor then uses
       * its own YouTube link dialog instead.
       */
      openVersionDetailsForCurrent: () => {
         const ctx = bridge.getCloudContext?.() || null;
         if (!ctx?.versionId) return Promise.resolve(null);
         return editVersionDetails(ctx.versionId);
      },
   };
}
