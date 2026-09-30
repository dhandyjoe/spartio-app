// youtube.js — pure YouTube link parsing/helpers. No DOM, no network, so it can
// be unit-tested in Node and safely composed into the pure UI helpers.
//
// The editor lets each version carry one YouTube link. We store BOTH the
// canonical URL and the extracted 11-character video id: the id powers the
// thumbnail preview and a "watch" deep-link without re-parsing the URL.
//
// Accepted input forms (all reduced to a canonical watch URL):
//   - a bare 11-char id           -> "aBcD_eFgH1-" (youtube video ids)
//   - https://youtu.be/<id>
//   - https://www.youtube.com/watch?v=<id>[&…]
//   - https://www.youtube.com/shorts/<id>
//   - https://www.youtube.com/embed/<id>
//   - https://www.youtube.com/live/<id>
//
// A "start at" marker survives the trip: `?t=3214`, `&t=3214s`, `&start=3214` and the hash form
// `#t=53m34s` are all parsed into SECONDS and re-emitted as `&t=<seconds>` on the canonical URL, so
// a chart taken from a full-set video still opens at the right moment. Every other parameter
// (`list=`, `si=`, `utm_…`) is dropped: it is not part of the video's identity.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Match an owner-hosted source and capture the 11-char id that follows it.
const SOURCE_RE =
   /(?:youtube\.com\/watch\?(?:[^#\n]*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|embed|live|v)\/)([A-Za-z0-9_-]{11})/;

/** Canonical "watch" URL for a video id, optionally starting at `start` (seconds or "1h2m3s"). */
export function canonicalUrl(videoId, start) {
   const seconds = parseStartTime(start);
   return `https://www.youtube.com/watch?v=${videoId}${seconds ? `&t=${seconds}` : ""}`;
}

/**
 * Parse a YouTube "start at" value into whole seconds, or null when there is none.
 * Accepts every form YouTube itself emits: `3214`, `3214s`, `53m34s`, `1h2m3s`, `2m`.
 * `0`, negative numbers and junk all mean "no timestamp" → null.
 */
export function parseStartTime(value) {
   if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
   if (typeof value !== "string") return null;
   const text = value.trim().toLowerCase();
   if (!text) return null;
   if (/^\d+$/.test(text)) {
      const seconds = Number(text);
      return seconds > 0 ? seconds : null;
   }
   // "1h2m3s" / "53m34s" / "90s" — any part may be missing, but at least one unit must be there.
   const clock = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
   if (!clock) return null;
   const seconds = Number(clock[1] || 0) * 3600 + Number(clock[2] || 0) * 60 + Number(clock[3] || 0);
   return seconds > 0 ? seconds : null;
}

/** "53:34" / "1:02:03" — for hints ("play from here"); "" when there is no timestamp. */
export function formatStartTime(value) {
   const seconds = parseStartTime(value);
   if (!seconds) return "";
   const h = Math.floor(seconds / 3600);
   const m = Math.floor((seconds % 3600) / 60);
   const s = seconds % 60;
   const pad = (n) => String(n).padStart(2, "0");
   return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// The "start at" seconds carried by a link: `?t=3214`, `&start=3214s`, `#t=53m34s`.
// The query string is what youtu.be / watch links use; the hash form is accepted too because
// YouTube's own "share at current time" sometimes emits `#t=`. Returns null when there is none.
function startTimeFromParams(text) {
   const at = text.indexOf("?");
   const params = new URLSearchParams(at === -1 ? text : text.slice(at + 1));
   for (const key of ["t", "start"]) {
      const seconds = parseStartTime(params.get(key));
      if (seconds) return seconds;
   }
   return null;
}
function readStartTime(link) {
   const hashIndex = link.indexOf("#");
   const query = hashIndex === -1 ? link : link.slice(0, hashIndex);
   const hash = hashIndex === -1 ? "" : link.slice(hashIndex + 1);
   return startTimeFromParams(query) ?? startTimeFromParams(hash);
}

/**
 * Parse a user-supplied YouTube link (or bare id) into { videoId, url, start }.
 * `url` is the canonical watch URL (carrying `&t=<seconds>` when the input had a start marker) and
 * `start` is that start in seconds (null when there is none). Returns null when the input is not a
 * recognizable single YouTube video (also handles empty input → null).
 */
export function parseYoutubeUrl(input) {
   if (typeof input !== "string") return null;
   const text = input.trim();
   if (!text) return null;
   if (VIDEO_ID.test(text)) {
      return { videoId: text, url: canonicalUrl(text), start: null };
   }
   const match = text.match(SOURCE_RE);
   if (!match) return null;
   const videoId = match[1];
   const start = readStartTime(text);
   return { videoId, url: canonicalUrl(videoId, start), start };
}

// Image-preset sizes YouTube exposes for a video id.
const THUMB_SIZES = ["default", "mqdefault", "hqdefault", "sddefault"];

/** Thumbnail image URL for a video id (defaults to the 320×180 preset). */
export function thumbnailUrl(videoId, size = "mqdefault") {
   const preset = THUMB_SIZES.includes(size) ? size : "mqdefault";
   return `https://i.ytimg.com/vi/${videoId}/${preset}.jpg`;
}

/**
 * The YouTube fields of a project/version document, normalized so a version's link always
 * round-trips: `projectData() → version doc → composeSong() → applyProject() → projectData()`.
 *
 *   - the URL wins over the id when both are present (the URL is what the user last pasted),
 *     and it is rewritten to the canonical watch URL;
 *   - an id without a URL gets one back (and vice versa), so neither half can go missing;
 *   - an unrecognizable URL is preserved verbatim instead of being dropped (older data),
 *     it simply has no id to offer.
 * Always returns strings — `""` means "this version has no link".
 */
export function youtubeFields(source) {
   const url = typeof source?.youtubeUrl === "string" ? source.youtubeUrl.trim() : "";
   const id = typeof source?.youtubeId === "string" ? source.youtubeId.trim() : "";
   const parsed = parseYoutubeUrl(url);
   const videoId = parsed?.videoId || id;
   if (!videoId) return { youtubeUrl: parsed ? parsed.url : url, youtubeId: "" };
   // The start time survives the normalization too, so "play from 53:34" is still there after a
   // save/reload (see the header note about `&t=`).
   return { youtubeUrl: canonicalUrl(videoId, parsed?.start), youtubeId: videoId };
}

/**
 * View-model for the editor's YouTube chip (topbar). Derived from the OPEN document, so the chip
 * and the score always describe the same arrangement:
 *   { hasLink, href, thumb, label, title }
 * `hasLink: false` means "offer ＋ YouTube" instead of a thumbnail (nothing stored, or a value we
 * could not recognize — the link dialog is where such a value gets fixed).
 */
export function youtubeChipMeta(source) {
   const { youtubeUrl, youtubeId } = youtubeFields(source);
   if (!youtubeId) return { hasLink: false, href: "", thumb: "", label: "", title: "" };
   const at = formatStartTime(parseYoutubeUrl(youtubeUrl)?.start);
   return {
      hasLink: true,
      href: youtubeUrl,
      thumb: thumbnailUrl(youtubeId, "mqdefault"),
      label: at ? `▶ ${at}` : "▶",
      title: at ? `Open on YouTube — starts at ${at}` : "Open on YouTube",
   };
}
