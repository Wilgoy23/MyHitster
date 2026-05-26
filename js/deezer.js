// Fetches Deezer playlist tracks via JSONP to bypass browser CORS restrictions.
// Returns [{artist, title}] for every track in the playlist.

function jsonp(url) {
    return new Promise((resolve, reject) => {
        const cb = 'dz_' + Date.now();
        const script = document.createElement('script');
        window[cb] = data => { delete window[cb]; script.remove(); resolve(data); };
        script.onerror = () => { delete window[cb]; script.remove(); reject(new Error('Failed to reach Deezer API')); };
        script.src = `${url}&output=jsonp&callback=${cb}`;
        document.head.appendChild(script);
    });
}

export async function fetchDeezerPlaylistTracks(playlistId) {
    const trackList = [];
    let index = 0;

    while (true) {
        const page = await jsonp(`https://api.deezer.com/playlist/${playlistId}/tracks?limit=100&index=${index}`);
        if (page.error) throw new Error(page.error.message || 'Playlist not found or private');

        for (const track of (page.data || [])) {
            if (track.title && track.artist?.name) {
                trackList.push({ artist: track.artist.name, title: track.title });
            }
        }
        if (!page.next) break;
        index += 100;
    }

    return trackList;
}
