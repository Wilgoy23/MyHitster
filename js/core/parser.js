// Parses raw text (textarea / CSV file) into [{artist, title}] query objects.
// Supported formats (auto-detected):
//   CSV with headers — Exportify, TuneMyMusic, Soundiiz, Apple Music export
//   TSV              — Spotify desktop copy (Title \t Artist \t Album \t Duration)
//   "Artist - Title" — manual input / numbered list

export function parseInput(raw) {
    const text = raw.trim();
    if (!text) return [];
    if (looksLikeCSV(text)) return parseCSV(text);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0].includes('\t')) return parseTSV(lines);
    return lines.map(line => line.replace(/^\d+[\.\)]\s*/, '').trim());
}

function looksLikeCSV(text) {
    const first = text.split('\n')[0];
    return /^"/.test(first.trim()) || (first.includes(',') && /artist|track|title|song/i.test(first));
}

function parseCSV(text) {
    const rows = splitCSVRows(text);
    if (rows.length < 2) return [];
    const headers  = rows[0].map(h => h.toLowerCase().trim());
    const artistCol = findCol(headers, ['artist name(s)', 'artist name', 'artist', 'creator']);
    const titleCol  = findCol(headers, ['track name', 'title', 'song', 'name', 'track']);
    if (artistCol === -1 || titleCol === -1) {
        return rows.slice(1)
            .filter(r => r.length >= 2)
            .map(r => `${r[0].trim()} ${r[1].trim()}`);
    }
    return rows.slice(1)
        .filter(r => r[artistCol] || r[titleCol])
        .map(r => `${(r[artistCol] || '').trim()} ${(r[titleCol] || '').trim()}`.trim());
}

function findCol(headers, candidates) {
    for (const c of candidates) {
        const idx = headers.indexOf(c);
        if (idx !== -1) return idx;
    }
    for (const c of candidates) {
        const idx = headers.findIndex(h => h.includes(c));
        if (idx !== -1) return idx;
    }
    return -1;
}

function splitCSVRows(text) {
    const rows = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const fields = [];
        let field = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                fields.push(field); field = '';
            } else {
                field += ch;
            }
        }
        fields.push(field);
        rows.push(fields);
    }
    return rows;
}

// Spotify desktop copy: Title \t Artist \t Album \t Duration
function parseTSV(lines) {
    return lines.map(line => {
        const parts  = line.split('\t');
        const title  = (parts[0] || '').trim();
        const artist = (parts[1] || '').trim();
        return artist ? `${artist} ${title}` : title;
    }).filter(Boolean);
}
