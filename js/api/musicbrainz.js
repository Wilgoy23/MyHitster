// Returns the earliest known release year for a given artist + title,
// or null if MusicBrainz has no data.
export async function queryMusicBrainz(artist, title) {
    const clean = title.split('(')[0].split('[')[0].trim();
    const query = `recording:"${clean}" AND artist:"${artist}"`;
    const url   = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;

    const resp = await fetch(url, {
        headers: { 'User-Agent': 'MyHitster/1.0 (github.com/wilgoy23/MyHitster)' },
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.recordings?.length) return null;

    let earliest = null;
    for (const rec of data.recordings) {
        // first-release-date on the recording is more reliable than individual release dates
        if (rec['first-release-date']) {
            const y = parseInt(rec['first-release-date'].split('-')[0]);
            if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
        }
        for (const rel of (rec.releases || [])) {
            if (rel.date) {
                const y = parseInt(rel.date.split('-')[0]);
                if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
            }
        }
    }
    return earliest !== null ? String(earliest) : null;
}
