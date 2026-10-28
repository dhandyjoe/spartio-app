export const MD_LABEL = "MD";
export const MD_TITLE = "Music Director";
export const ALBUM_DESC_MAX = 220;
export const ALBUM_TRACK_PREVIEW = 3;

export const cloudUIState = {
   activeAlbumCtx: null,
};

export function setActiveAlbumCtx(next) {
   cloudUIState.activeAlbumCtx = next && next.albumId
      ? { albumId: next.albumId, albumName: next.albumName || "", role: next.role || null }
      : null;
}
