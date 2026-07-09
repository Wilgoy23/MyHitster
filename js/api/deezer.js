// Fetches Deezer playlist tracks via JSONP to bypass browser CORS restrictions.
// Returns [{artist, title}] for every track in the playlist.

import { throttle } from './rateLimit.js';

function jsonp(url) {
    return new Promise((resolve, reject) => {
        const cb = 'dz_' + Date.now();
        const script = document.createElement('script');
        window[cb] = data => { delete window[cb]; script.remove(); resolve(data); };
        script.onerror = () => { delete window[cb]; script.remove(); reject(new Error('Failed to reach Deezer API')); };
        script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
        document.head.appendChild(script);
    });
}

export async function fetchDeezerPlaylistTracks(playlistId) {
    const trackList = [];
    let index = 0;

    while (true) {
        await throttle('deezer', 500);
        const page = await jsonp(`https://api.deezer.com/playlist/${playlistId}/tracks?limit=100&index=${index}`);
        if (page.error) throw new Error(page.error.message || 'Playlist not found or private');

        for (const track of (page.data || [])) {
            if (track.title && track.artist?.name) {
                trackList.push({
                    artist:     track.artist.name,
                    title:      track.title,
                    previewUrl: track.preview || null,
                    albumId:    track.album?.id ?? null,
                    albumTitle: track.album?.title || '',
                });
            }
        }
        if (!page.next) break;
        index += 100;
    }

    return trackList;
}

// Returns the release year of a Deezer album as a string, or null.
// The in-flight promise is cached per album ID, so concurrent lookups for
// tracks from the same album share a single request.
const _albumYearCache = new Map();

export function fetchDeezerAlbumYear(albumId) {
    if (!albumId) return Promise.resolve(null);
    if (!_albumYearCache.has(albumId)) {
        _albumYearCache.set(albumId, (async () => {
            try {
                await throttle('deezer', 500);
                const album = await jsonp(`https://api.deezer.com/album/${albumId}`);
                const m = /^(\d{4})/.exec(album?.release_date || '');
                return m ? m[1] : null;
            } catch {
                return null;
            }
        })());
    }
    return _albumYearCache.get(albumId);
}
