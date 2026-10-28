import { editorModeMeta, modeIconMarkup, normalizeEditorMode } from "../../notation/notation.js?v=__BUILD__";
import { parseYoutubeUrl, thumbnailUrl } from "../../util/youtube.js?v=__BUILD__";

export const escapeHtml = (s) =>
   String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
   );

// Card cover.
// A card shows either the song's real YouTube thumbnail (.is-photo) or, when
// the song has no video, a quiet typographic motif (.is-motif) that states what
// the song IS: its notation glyph + the first tokens of its content. Honest
// data, no fake imagery.
export function songCoverId(song) {
   const raw = song && song.latestYoutubeId;
   if (typeof raw !== "string") return "";
   return parseYoutubeUrl(raw.trim())?.videoId || "";
}

// First few "tokens" printed on a motif cover, per mode. Chord charts show the
// opening chords, numeric shows opening scale degrees, ChordPro shows section
// tags. Everything is derived from the song itself — nothing invented.
export function motifTokens(song, mode) {
   if (mode === "chordpro") {
      const sections = Array.isArray(song.sections) ? song.sections : [];
      const tags = sections
         .map((s) => (s && typeof s.tag === "string" ? s.tag.replace(/[{}]/g, "").trim() : ""))
         .filter(Boolean)
         .slice(0, 3);
      return tags.join(" · ");
   }
   const flat = typeof song.chordLine === "string" ? song.chordLine : "";
   const source = flat || (Array.isArray(song.sections) ? song.sections.map((s) => s?.chords || "").join(" ") : "");
   const tokens = String(source)
      .split(/\s+/)
      .filter((t) => t && t !== "|" && t !== "·")
      .slice(0, 3);
   return tokens.join(" · ");
}

// Library mode marks come from the shared notation helper so the index, the
// version popover and the editor topbar always draw the same icon for a mode.
export function libraryModeIcon(mode, className = "") {
   return modeIconMarkup(mode, className);
}

export function coverMarkup(song, mode, forceMotif = false) {
   // The My Songs index always leads with the notation mode; a YouTube
   // thumbnail belongs in the Video column, not in place of the mode glyph.
   const videoId = forceMotif ? "" : songCoverId(song);
   const modeName = mode === "numbers" ? "Numeric Notation + Lyrics" : editorModeMeta[mode]?.badge || "Chord Chart";
   if (videoId) {
      return `<div class="song-card-cover is-photo" data-mode="${mode}">
         <img class="song-card-cover-img" src="${thumbnailUrl(videoId)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      </div>`;
   }
   const tokens = motifTokens(song, mode);
   return `<div class="song-card-cover is-motif mode-tile is-${mode}" data-mode="${mode}" title="${escapeHtml(modeName)}" aria-label="${escapeHtml(modeName)}">
      ${libraryModeIcon(mode, "song-card-mode-mark song-card-mode-icon")}
      ${tokens ? `<span class="song-card-cover-tokens" aria-hidden="true">${escapeHtml(tokens)}</span>` : ""}
   </div>`;
}

// Firestore timestamps can arrive as millis, a Timestamp object, or a string;
// normalise once so relative labels and sorting agree.
export function songTimestamp(value) {
   if (typeof value === "number" && Number.isFinite(value)) return value;
   if (value && typeof value.toMillis === "function") return value.toMillis();
   if (value && typeof value.seconds === "number") return value.seconds * 1000;
   const parsed = Date.parse(value);
   return Number.isFinite(parsed) ? parsed : 0;
}

export function relativeUpdated(value) {
   const ms = songTimestamp(value);
   if (!ms) return "";
   const diff = Math.max(0, Date.now() - ms);
   const minutes = Math.floor(diff / 60000);
   if (minutes < 1) return "Just now";
   if (minutes < 60) return `${minutes} min ago`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
   const days = Math.floor(hours / 24);
   if (days === 1) return "Yesterday";
   if (days < 7) return `${days} days ago`;
   const weeks = Math.floor(days / 7);
   if (days < 30) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
   return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The library summary carries the latest version's label. That is more useful
// in the index than a raw count, and it is real data (never invented).
export function arrangementLabel(song) {
   const label = String(song.latestVersionLabel || "").trim();
   if (label) return label;
   if (typeof song.versionCount === "number" && song.versionCount > 0) {
      return `${song.versionCount} version${song.versionCount === 1 ? "" : "s"}`;
   }
   const sections = Array.isArray(song.sections) ? song.sections.length : 0;
   return sections ? `${sections} section${sections === 1 ? "" : "s"}` : "Draft";
}

export function songMediaMarkup(song) {
   if (!songCoverId(song)) {
      return `<span class="song-card-media is-empty" title="No video reference" aria-label="No video reference">—</span>`;
   }
   return `<span class="song-card-media is-video" role="img" aria-label="YouTube reference" title="YouTube reference">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>
   </span>`;
}

export function cardMarkup(song) {
   const title = escapeHtml(song.title || "Untitled");
   const creator = escapeHtml(song.artist || "Unknown");
   const updated = relativeUpdated(song.updatedAt);
   const mode = normalizeEditorMode(song.latestEditorMode || song.editorMode);
   const modeLabel = editorModeMeta[mode]?.badge || "Chord Chart";
   const arrangement = arrangementLabel(song);
   const key = song.latestKey || song.key || "";
   const timeSignature = song.latestMeter || song.meter || "";
   const bpm = Number(song.latestBPM || song.bpm) || "";
   const keyCell = key
      ? `<span class="song-card-chip is-key"><small>Key</small><strong>${escapeHtml(key)}</strong></span>`
      : `<span class="song-card-chip is-key is-empty"><small>Key</small><strong>—</strong></span>`;
   const meterValue = `<span class="song-card-meter"><strong>${timeSignature ? escapeHtml(timeSignature) : "—"}</strong>${bpm ? `<span class="song-card-bpm">${bpm} BPM</span>` : ""}</span>`;
   const meterCell = `<span class="song-card-chip is-meter${timeSignature ? "" : " is-empty"}"><small>Meter</small>${meterValue}</span>`;
   return `
      <article class="song-card library-song-row is-index-row is-${mode}" role="listitem" tabindex="0" data-id="${escapeHtml(song.cloudId)}"
               aria-label="${title} by ${creator}, ${escapeHtml(modeLabel)}${key ? `, key ${escapeHtml(key)}` : ""}">
         ${coverMarkup(song, mode, true)}
         <div class="song-card-identity">
            <h3 class="song-card-title">${title}</h3>
            <div class="song-card-creator">${creator}</div>
         </div>
         <div class="song-card-detail">
            <span class="song-card-arrangement" title="${escapeHtml(arrangement)}">${escapeHtml(arrangement)}</span>
            <span class="song-card-updated${updated ? "" : " is-empty"}"><span class="song-card-updated-label">Updated </span>${updated ? escapeHtml(updated) : "—"}</span>
         </div>
         ${songMediaMarkup(song)}
         <div class="song-card-dock">
            <div class="song-card-meta">
               ${keyCell}
               ${meterCell}
            </div>
            <div class="song-card-actions">
               <button class="song-card-action song-card-open is-open" type="button" data-act="edit">Open</button>
               <details class="song-row-menu">
                  <summary class="song-row-menu-trigger" aria-label="Actions for ${title}">
                     <svg class="song-row-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
                  </summary>
                  <div class="song-row-menu-items" role="group" aria-label="Song actions">
                     <button class="song-card-action" type="button" data-act="edit">Open song</button>
                     <button class="song-card-action" type="button" data-act="pdf">Export PDF</button>
                     <button class="song-card-action" type="button" data-act="export">Copy Link</button>
                     <button class="song-card-action" type="button" data-act="duplicate">Duplicate</button>
                     <button class="song-card-action is-delete" type="button" data-act="delete">Delete</button>
                  </div>
               </details>
            </div>
         </div>
      </article>`;
}

export function normalizeSongSearch(value) {
   return String(value ?? "")
      .toLowerCase()
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
}

export function relativeWhen(value) {
   const relative = relativeUpdated(value);
   if (relative === "Yesterday") return "yesterday";
   if (relative === "Just now") return "just now";
   return relative;
}

export function albumCardMarkup(
   album,
   { readCachedAlbumExtras, albumTracksMarkup, descMax = 220, mdLabel = "MD", mdTitle = "Music Director" } = {},
) {
   const title = escapeHtml(album.name || "Untitled album");
   const isOwner = album.role === "owner";
   const code = isOwner ? String(album.activeInviteCode || "").trim() : "";
   const description = String(album.description || "").trim();
   const shortDesc = description.length > descMax ? `${description.slice(0, descMax)}…` : description;
   const updated = relativeWhen(album.updatedAt);
   const songCount = typeof album.songCount === "number" && Number.isFinite(album.songCount)
      ? Math.max(0, Math.round(album.songCount))
      : null;
   const songsLabel = songCount === null ? "" : `${songCount} song${songCount === 1 ? "" : "s"}`;
   const cached = readCachedAlbumExtras?.(album);
   const members = cached && Number.isFinite(cached.members) ? Math.max(0, Math.round(cached.members)) : null;
   const ownerMenu = isOwner
      ? `<details class="song-row-menu album-index-menu">
            <summary class="song-row-menu-trigger" aria-label="More actions for ${title}">
               <svg class="song-row-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
            </summary>
            <div class="song-row-menu-items" role="group" aria-label="Album actions">
               <button class="song-card-action" type="button" data-act="details">Edit details</button>
               <button class="song-card-action is-delete" type="button" data-act="delete">Delete album</button>
            </div>
         </details>`
      : "";
   return `
      <article class="album-index-card" role="listitem" tabindex="0"
         data-album-id="${escapeHtml(album.albumId)}" aria-label="Open album ${title}">
         <div class="album-index-head">
            <span class="album-index-role${isOwner ? " is-md" : ""}"
               title="${isOwner ? mdTitle : "Read-only member"}">
               ${isOwner ? `<span class="album-index-role-dot" aria-hidden="true"></span>` : ""}
               ${isOwner ? mdLabel : "Member"}
            </span>
            ${code ? `<button class="album-index-code" type="button" data-act="copy-code" data-code="${escapeHtml(code)}"
               aria-label="Copy invite code ${escapeHtml(code)}" title="Copy invite code ${escapeHtml(code)}">
               <span class="album-index-code-label">Code</span>
               <span class="album-index-code-value">${escapeHtml(code)}</span>
               <span class="album-index-code-copy" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
               </span>
            </button>` : ""}
            ${ownerMenu}
         </div>
         <h3 class="album-index-title" title="${title}">${title}</h3>
         <p class="album-index-desc"${description.length > descMax ? ` title="${escapeHtml(description)}"` : ""}>${shortDesc ? escapeHtml(shortDesc) : `<span class="album-index-desc-empty">No description yet</span>`}</p>
         ${albumTracksMarkup?.(album) || ""}
         <div class="album-index-foot">
            <p class="album-index-stats">
               ${songsLabel ? `<strong class="album-index-songs">${escapeHtml(songsLabel)}</strong>` : ""}
               <span class="album-index-members" data-album-members${members === null ? " hidden" : ""}>${members === null ? "" : `${members} member${members === 1 ? "" : "s"}`}</span>
               ${updated ? `<span class="album-index-updated"><span class="album-index-updated-prefix">Updated </span>${escapeHtml(updated)}</span>` : ""}
            </p>
            <span class="album-index-open" aria-hidden="true">Open album
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
            </span>
         </div>
      </article>`;
}
