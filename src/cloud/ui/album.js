import { editorModeMeta, normalizeEditorMode } from "../../notation/notation.js?v=__BUILD__";
import {
   arrangementLabel,
   coverMarkup,
   escapeHtml,
   libraryModeIcon,
   relativeUpdated,
   songMediaMarkup,
} from "./markup.js?v=__BUILD__";
import { ALBUM_TRACK_PREVIEW, MD_LABEL, MD_TITLE } from "./state.js?v=__BUILD__";

export function roleShortLabel(role) {
   return role === "owner" ? MD_LABEL : "Member";
}
export function roleMarker(role) {
   return role === "owner"
      ? ` <span class="member-md-mark" title="${MD_TITLE}">(${MD_LABEL})</span>`
      : "";
}

// Albums index (Albums tab).
// A two-column card index: role tag, invite code (MDs only), name, description,
// a preview of the newest arrangements, then the counts that decide whether the
// album is worth opening. The words come from the project's own vocabulary
// ("arrangements", "MD", "songs"), never "items"/"records".
// Cache key: the card's extras are only valid for the album revision that was
// read (songCount/updatedAt move whenever the album's content changes).
export function albumTrackChipsMarkup(tracks, total) {
   const list = Array.isArray(tracks) ? tracks.slice(0, ALBUM_TRACK_PREVIEW) : [];
   const chips = list.map((track) => {
      const key = String(track.key || "").trim();
      return `<span class="album-index-track">${escapeHtml(track.title || "Untitled")}${key ? ` <span class="album-index-track-key">(${escapeHtml(key)})</span>` : ""}</span>`;
   });
   const totalCount = Number.isFinite(total) ? Math.max(0, total) : list.length;
   const remaining = Math.max(0, totalCount - list.length);
   if (remaining > 0 && chips.length) chips.push(`<span class="album-index-track is-more">+${remaining} more</span>`);
   return chips.join("");
}

// "Updated 2 hours ago" reads as a sentence: the two capitalised relative words
// become lower case, while a real date ("Mar 3") keeps its capital.
export function albumSongMode(song) {
   return normalizeEditorMode(song.latestEditorMode || song.editorMode);
}

export function foldAlbumSearch(value) {
   return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll("♯", "#")
      .replaceAll("♭", "b")
      .replace(/\s+/g, " ")
      .trim();
}

export function albumSongFilterCounts(songs = []) {
   const counts = { all: songs.length, chords: 0, numbers: 0, chordpro: 0 };
   for (const song of songs) counts[albumSongMode(song)] += 1;
   return counts;
}

export function albumSongFilterIcon(mode) {
   if (mode === "all") {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><path d="M15 15h4M15 18h4"/></svg>`;
   }
   return libraryModeIcon(mode, "album-song-filter-mark");
}

export function albumSongSearchText(song) {
   const mode = albumSongMode(song);
   const modeWords = mode === "numbers"
      ? "numeric nashville numbers"
      : mode === "chordpro"
         ? "chordpro chord pro lyrics"
         : "chord chart chords";
   return foldAlbumSearch([
      song.title,
      song.artist,
      song.latestKey || song.key,
      song.latestMeter || song.meter,
      song.latestBPM || song.bpm,
      arrangementLabel(song),
      editorModeMeta[mode]?.badge,
      modeWords,
   ].join(" "));
}

export function albumSongRowMarkup(song, role) {
   const title = escapeHtml(song.title || "Untitled");
   const creator = escapeHtml(song.artist || "Unknown");
   const updated = relativeUpdated(song.updatedAt);
   const mode = albumSongMode(song);
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
   const actions = role === "owner"
      ? `<button class="song-card-action" type="button" data-act="edit">Open in editor</button>
         <button class="song-card-action" type="button" data-act="pdf">Export PDF</button>
         <button class="song-card-action is-delete" type="button" data-act="delete">Remove from album</button>`
      : `<button class="song-card-action" type="button" data-act="edit">Open arrangement</button>
         <button class="song-card-action" type="button" data-act="pdf">Export PDF</button>
         <button class="song-card-action" type="button" data-act="copy">Save a copy</button>`;
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
                  <div class="song-row-menu-items" role="group" aria-label="Album song actions">${actions}</div>
               </details>
            </div>
         </div>
      </article>`;
}

const REMOVE_ICON =
   '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6h16" /><path d="M9 6V4h6v2" /><path d="M6.5 6l.9 14h9.2l.9-14" /><path d="M10 10.5v6.5" /><path d="M14 10.5v6.5" /></svg>';
// ⋮ — three FILLED dots. The trash below is stroked because it is an outline
// shape; a stroked 1.9px dot would just read as a tiny hollow circle.
const MEMBER_MENU_ICON =
   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" /></svg>';
// The per-row control on a DESKTOP: a 38px ⋮ that opens the sheet. On a phone it
// is hidden by CSS (≤680px) and the row's own chevron takes over — there the WHOLE
// row is the target, so a button inside it would only compete with the chevron.
// It stays the element that carries the full "what can I do here" copy for
// assistive tech, and it is what gets the focus back when the sheet closes.
export function memberManageButtonMarkup(member) {
   const uid = escapeHtml(member.uid);
   const name = escapeHtml(member.name || "this member");
   return `<button class="member-row-menu-btn" data-member-menu data-uid="${uid}" type="button" title="Manage ${name}" aria-label="Manage ${name} — make ${MD_LABEL}, make member, or remove from album" aria-haspopup="dialog" aria-controls="memberActionsDialog" aria-expanded="false">${MEMBER_MENU_ICON}</button>`;
}
// The sheet's two buttons — built HERE, once, so they can never drift apart from
// the sheet again. The labels are VERBS ("Make MD", never a bare "MD") so they
// can only be read as actions: a noun in a pill reads as a status. The subtitle
// of the sheet already states the member's CURRENT role, so the buttons don't.
export function memberControlsMarkup(member) {
   const uid = escapeHtml(member.uid);
   const name = escapeHtml(member.name || "this member");
   const roleBtn = member.isMd
      ? `<button class="button button-ghost button-small member-role-btn is-demote" data-member-action="demote" data-uid="${uid}" type="button" title="Change back to a regular member (read-only)" aria-label="Make ${name} a regular member"><span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Make member</button>`
      : `<button class="button button-ghost button-small member-role-btn is-promote" data-member-action="promote" data-uid="${uid}" type="button" title="Make ${MD_TITLE} (${MD_LABEL}) — full access" aria-label="Make ${name} the ${MD_TITLE}"><span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span> Make ${MD_LABEL}</button>`;
   // The trash is an inline SVG (the app's stroke-icon language, see index.html)
   // instead of the 🗑 emoji: U+1F5D1 defaults to the TEXT presentation and its
   // glyph metrics never sit dead-centre in the button. A 17px SVG in a
   // grid-centred square is centred by construction and stays crisp at any zoom.
   // The label is always rendered now — the sheet is the only surface, and there
   // a full-width bar reads better with the words "Remove from album" in it.
   const removeBtn = `<button class="button button-ghost button-small is-danger member-remove-btn" data-member-action="remove" data-uid="${uid}" type="button" title="Remove from album" aria-label="Remove ${name} from the album">${REMOVE_ICON}<span class="member-remove-label">Remove from album</span></button>`;
   return `<div class="member-controls">${roleBtn}${removeBtn}</div>`;
}

// The member-actions sheet: the ONE place the verbs live, opened by the row's ⋮
// at every width (and by tapping the row itself on a phone, where the whole row
// is the comfortable thumb target). BUTTONS are the sheet's only focusable
// elements, so opening it moves focus to the first action and closing hands it
// back to the ⋮ that opened it — the same contract as openConfirmDialog().
