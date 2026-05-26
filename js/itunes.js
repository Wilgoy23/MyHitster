const STRIP_PATTERNS = [
    / \(From .*?\)/gi,
    / - From .+$/gi,
    / \(Remastered[^)]*\)/gi,
    / - Remastered.+$/gi,
    / \[Remastered[^\]]*\]/gi,
    / \([^)]*Anniversary[^)]*\)/gi,
    / \([^)]*Edition[^)]*\)/gi,
    / \([^)]*Version[^)]*\)/gi,
    / \([^)]*Mix[^)]*\)/gi,
    / \([^)]*Reissue[^)]*\)/gi,
    / \(Bonus Track\)/gi,
];

export function cleanSongTitle(title) {
    let clean = title;
    for (const p of STRIP_PATTERNS) clean = clean.replace(p, '');
    return clean.replace(/ -\s*$/, '').trim();
}

// Returns the best-matching Track object, or null if nothing found.
export async function searchItunes(query) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&media=music&limit=10`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iTunes API error ${resp.status}`);
    const data = await resp.json();
    if (!data.results?.length) return null;

    const best = data.results.find(r => r.previewUrl) ?? data.results[0];
    const year = best.releaseDate ? new Date(best.releaseDate).getFullYear().toString() : 'Unknown';
    return {
        name:       cleanSongTitle(best.trackName || ''),
        artist:     best.artistName || '',
        year,
        previewUrl: best.previewUrl || null,
        album:      best.collectionName || '',
    };
}

// Returns raw iTunes results for album or musicArtist entity searches.
export async function searchItunesEntities(query, entity) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&media=music&limit=12`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iTunes API error ${resp.status}`);
    const data = await resp.json();
    return data.results || [];
}

// Returns raw song result objects for a given album collection ID.
export async function fetchAlbumTracks(collectionId) {
    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iTunes API error ${resp.status}`);
    const data = await resp.json();
    return data.results.filter(r => r.wrapperType === 'track' && r.kind === 'song');
}

// Returns raw song result objects for a given artist ID (up to 50).
export async function fetchArtistTracks(artistId) {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=50`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iTunes API error ${resp.status}`);
    const data = await resp.json();
    return data.results.filter(r => r.wrapperType === 'track' && r.kind === 'song');
}
