import { throttle } from './rateLimit.js';

function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Returns the earliest known release year for a given artist + title, or null
// if MusicBrainz has no trustworthy data.
//
// Only recordings that demonstrably match the requested artist AND title are
// considered — with "earliest year wins" logic downstream, a single fuzzy
// match on a same-named song would otherwise set a wildly wrong year that
// can never be corrected automatically.
export async function queryMusicBrainz(artist, title) {
    await throttle('musicbrainz', 1100);
    const clean = title.split('(')[0].split('[')[0].trim();
    const query = `recording:"${clean}" AND artist:"${artist}"`;
    const url   = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;

    const resp = await fetch(url, {
        headers: { 'User-Agent': 'MyHitster/1.0 (github.com/wilgoy23/MyHitster)' },
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.recordings?.length) return null;

    const wantTitle  = norm(clean);
    const wantArtist = norm(artist);

    let earliest = null;
    for (const rec of data.recordings) {
        if ((rec.score ?? 0) < 90) continue;

        // The recording must be the same song, allowing suffixes on either
        // side ("Song" vs "Song Remastered").
        const recTitle = norm(rec.title || '');
        if (recTitle !== wantTitle &&
            !recTitle.startsWith(wantTitle + ' ') &&
            !wantTitle.startsWith(recTitle + ' ')) continue;

        // …credited to the same artist ("The Rolling Stones" vs "Rolling
        // Stones" and joint credits still match).
        const credit = norm((rec['artist-credit'] || [])
            .map(c => c.name || c.artist?.name || '').join(' '));
        if (wantArtist && credit &&
            !credit.includes(wantArtist) && !wantArtist.includes(credit)) continue;

        // first-release-date is MusicBrainz's own earliest-release computation
        // for the recording — more reliable than scanning the attached release
        // list, which can contain misdated entries.
        const y = parseInt(rec['first-release-date']);
        if (!isNaN(y) && y >= 1900 && (earliest === null || y < earliest)) earliest = y;
    }
    return earliest !== null ? String(earliest) : null;
}
