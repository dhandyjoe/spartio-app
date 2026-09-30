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

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Match an owner-hosted source and capture the 11-char id that follows it.
const SOURCE_RE =
   /(?:youtube\.com\/watch\?(?:[^#\n]*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|embed|live|v)\/)([A-Za-z0-9_-]{11})/;

/** Canonical "watch" URL for a video id. */
export function canonicalUrl(videoId) {
   return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Parse a user-supplied YouTube link (or bare id) into { videoId, url }.
 * Returns null when the input is not a recognizable single YouTube video
 * (also handles empty input → null).
 */
export function parseYoutubeUrl(input) {
   if (typeof input !== "string") return null;
   const text = input.trim();
   if (!text) return null;
   if (VIDEO_ID.test(text)) {
      return { videoId: text, url: canonicalUrl(text) };
   }
   const match = text.match(SOURCE_RE);
   if (!match) return null;
   return { videoId: match[1], url: canonicalUrl(match[1]) };
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
   return { youtubeUrl: canonicalUrl(videoId), youtubeId: videoId };
}
