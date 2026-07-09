import { throttle } from './rateLimit.js';

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
    / \[[^\]]*Mix[^\]]*\]/gi,
    / \([^)]*Remix[^)]*\)/gi,
    / \[[^\]]*Remix[^\]]*\]/gi,
    / \([^)]*Edit[^)]*\)/gi,
    / \[[^\]]*Edit[^\]]*\]/gi,
    / \([^)]*Mixed[^)]*\)/gi,
    / \[[^\]]*Mixed[^\]]*\]/gi,
    / \([^)]*Reissue[^)]*\)/gi,
    / \(Bonus Track\)/gi,
];

export function cleanSongTitle(title) {
    let clean = title;
    for (const p of STRIP_PATTERNS) clean = clean.replace(p, '');
    return clean.replace(/ -\s*$/, '').trim();
}

async function itunesFetch(url) {
    await throttle('itunes', 3000);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes request failed: ${res.status}`);
    return res.json();
}

// Returns the best-matching Track object, or null if nothing found.
export async function searchItunes(query) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanSongTitle(query))}&entity=song&media=music&limit=10`;
    const data = await itunesFetch(url);
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

