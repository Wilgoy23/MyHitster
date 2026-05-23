const HITSTER_URL = 'https://wilgoy23.github.io/MyHitster';

let tracks = [];  // [{name, artist, year, previewUrl}]

// ── Format detection & parsing ────────────────────────────────────────────────

/*
 Parses raw text (from textarea or CSV file) into an array of
 {artist, title} query strings for iTunes.

 Supported formats (auto-detected):
   • CSV with headers  — Exportify, TuneMyMusic, Soundiiz, Apple Music export
   • TSV               — Spotify desktop copy (Title \t Artist \t Album \t Duration)
   • "Artist - Title"  — manual input (default)
   • Numbered list     — "1. Artist - Title"
*/
function parseInput(raw) {
    const text = raw.trim();
    if (!text) return [];

    // CSV: has quoted fields or comma-separated header row
    if (looksLikeCSV(text)) return parseCSV(text);

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // TSV: Spotify desktop copy — columns are Tab-separated, Title first
    if (lines[0].includes('\t')) return parseTSV(lines);

    // Plain text: "Artist - Title", "1. Artist - Title", etc.
    return lines.map(line => {
        // Strip leading numbering like "1." or "1)"
        const stripped = line.replace(/^\d+[\.\)]\s*/, '').trim();
        return stripped;
    });
}

function looksLikeCSV(text) {
    const first = text.split('\n')[0];
    // Has a quoted field, or has multiple comma-separated values with a header
    return /^"/.test(first.trim()) || (first.includes(',') && /artist|track|title|song/i.test(first));
}

/*
 Parses CSV text. Detects column headers to extract artist + title.
 Falls back to first two columns if headers are unrecognised.
*/
function parseCSV(text) {
    const rows = splitCSVRows(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase().trim());

    // Find artist and track columns by common header names
    const artistCol = findCol(headers, ['artist name(s)', 'artist name', 'artist', 'creator']);
    const titleCol  = findCol(headers, ['track name', 'title', 'song', 'name', 'track']);

    if (artistCol === -1 || titleCol === -1) {
        // No recognisable headers — treat as two-column (col 0 = artist, col 1 = title)
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
    // Partial match
    for (const c of candidates) {
        const idx = headers.findIndex(h => h.includes(c));
        if (idx !== -1) return idx;
    }
    return -1;
}

/* Splits a CSV string into a 2D array of fields, handling quoted fields. */
function splitCSVRows(text) {
    const rows = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const fields = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                fields.push(field);
                field = '';
            } else {
                field += ch;
            }
        }
        fields.push(field);
        rows.push(fields);
    }
    return rows;
}

/*
 Parses Spotify desktop copy format: Title \t Artist \t Album \t Duration
 (title comes first, artist second).
*/
function parseTSV(lines) {
    return lines.map(line => {
        const parts = line.split('\t');
        const title  = (parts[0] || '').trim();
        const artist = (parts[1] || '').trim();
        return artist ? `${artist} ${title}` : title;
    }).filter(Boolean);
}

/* Handles a CSV file dropped or selected via the file input. */
function handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('track-input').value = e.target.result;
        showStatus(`Loaded "${file.name}". Click "Search iTunes" to continue.`, 'success');
    };
    reader.readAsText(file);
}

// ── Track input & iTunes search ───────────────────────────────────────────────

async function searchTracks() {
    const input = document.getElementById('track-input').value.trim();
    if (!input) {
        showStatus('Please upload a CSV or paste a track list.', 'error');
        return;
    }

    tracks = [];
    document.getElementById('track-list-section').style.display = 'none';
    document.getElementById('generate-btn').style.display = 'none';

    const queries = parseInput(input).filter(q => q.length > 0);
    if (!queries.length) {
        showStatus('Could not parse any tracks from the input.', 'error');
        return;
    }

    setLoading(true, `Searching iTunes… (0 / ${queries.length})`);

    let notFound = 0;
    let noPreview = 0;

    for (let i = 0; i < queries.length; i++) {
        updateStatus(`Searching iTunes… (${i + 1} / ${queries.length}): ${queries[i]}`);

        try {
            const result = await searchItunes(queries[i]);
            if (result) {
                tracks.push(result);
                if (!result.previewUrl) noPreview++;
            } else {
                tracks.push({ name: queries[i], artist: '', year: 'Unknown', previewUrl: null, notFound: true });
                notFound++;
            }
        } catch (e) {
            tracks.push({ name: queries[i], artist: '', year: 'Unknown', previewUrl: null, notFound: true });
            notFound++;
        }

        if (i < queries.length - 1) await sleep(250);
    }

    setLoading(false);

    let statusMsg = `Found ${tracks.length - notFound} of ${queries.length} tracks.`;
    if (notFound > 0)  statusMsg += ` ${notFound} not found.`;
    if (noPreview > 0) statusMsg += ` ${noPreview} have no preview available.`;
    showStatus(statusMsg, notFound > 0 ? 'warning' : 'success');

    renderTrackList();
}

/*
 Searches the iTunes Search API for a query string.
 Returns the best match with a previewUrl, or the best match without one,
 or null if nothing was found.
 @param {string} query
 @returns {Object|null}
*/
async function searchItunes(query) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&media=music&limit=10`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iTunes API error ${resp.status}`);
    const data = await resp.json();

    if (!data.results?.length) return null;

    // Prefer a result with a preview URL
    const withPreview = data.results.find(r => r.previewUrl);
    const best = withPreview || data.results[0];

    const rawDate = best.releaseDate || '';
    const year = rawDate ? new Date(rawDate).getFullYear().toString() : 'Unknown';

    return {
        name:       cleanSongTitle(best.trackName || ''),
        artist:     best.artistName || '',
        year,
        previewUrl: best.previewUrl || null,
        album:      best.collectionName || '',
    };
}

// ── Track title cleanup ───────────────────────────────────────────────────────

function cleanSongTitle(title) {
    const patterns = [
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
    let clean = title;
    for (const p of patterns) clean = clean.replace(p, '');
    return clean.replace(/ -\s*$/, '').trim();
}

// ── Track list UI ─────────────────────────────────────────────────────────────

function renderTrackList() {
    const minYear = parseInt(document.getElementById('min-year').value) || 0;
    const maxYear = parseInt(document.getElementById('max-year').value) || 9999;
    const tbody = document.getElementById('track-tbody');
    tbody.innerHTML = '';

    tracks.forEach((track, i) => {
        const yr = parseInt(track.year);
        const outOfRange = !isNaN(yr) && minYear > 0 && (yr < minYear || yr > maxYear);
        const noPreview  = !track.previewUrl;
        const notFound   = track.notFound;

        const tr = document.createElement('tr');
        if (notFound)      tr.className = 'not-found';
        else if (noPreview) tr.className = 'no-preview';
        else if (outOfRange) tr.className = 'out-of-range';

        const previewBadge = notFound
            ? '<span class="badge badge-error">Not found</span>'
            : noPreview
                ? '<span class="badge badge-warning">No preview</span>'
                : '<span class="badge badge-ok">&#10003;</span>';

        tr.innerHTML =
            `<td>${i + 1}</td>` +
            `<td>${escHtml(track.artist)}</td>` +
            `<td>${escHtml(track.name)}</td>` +
            `<td><input type="text" class="year-input" value="${escHtml(track.year)}" data-idx="${i}" maxlength="4"></td>` +
            `<td>${previewBadge}</td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.year-input').forEach(input => {
        input.addEventListener('change', e => {
            tracks[parseInt(e.target.dataset.idx)].year = e.target.value.trim();
            renderTrackList();
        });
    });

    document.getElementById('track-list-section').style.display = 'block';

    const playable = tracks.filter(t => t.previewUrl).length;
    document.getElementById('generate-btn').style.display = playable > 0 ? 'inline-block' : 'none';
    if (playable === 0) {
        showStatus('No tracks with previews found. Cannot generate PDF.', 'error');
    }
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── MusicBrainz date verification ─────────────────────────────────────────────

const CLASSIC_ARTISTS = [
    'queen', 'led zeppelin', 'pink floyd', 'the beatles', 'rolling stones',
    'ac/dc', 'acdc', 'black sabbath', 'deep purple', 'bob dylan', 'david bowie',
    'the who', 'jimi hendrix', 'the doors', 'eagles', 'fleetwood mac',
];

async function verifyWithMusicBrainz() {
    const maxLookups = parseInt(document.getElementById('mb-limit').value) || 25;
    setLoading(true, 'Starting MusicBrainz verification…');

    let count = 0;
    let updated = 0;

    for (let i = 0; i < tracks.length && count < maxLookups; i++) {
        const track = tracks[i];
        if (!track.previewUrl) continue;

        const yr = parseInt(track.year);
        let suspicious = isNaN(yr) || yr > 2020;
        if (!suspicious && yr > 2010) {
            suspicious = CLASSIC_ARTISTS.some(a => track.artist.toLowerCase().includes(a));
        }
        if (!suspicious) continue;

        count++;
        updateStatus(`Verifying ${count}/${maxLookups}: ${track.artist} – ${track.name}`);

        try {
            const verified = await queryMusicBrainz(track.artist, track.name);
            if (verified) {
                const vyr = parseInt(verified);
                if (isNaN(yr) || vyr < yr) {
                    tracks[i].year = verified;
                    updated++;
                }
            }
        } catch (e) {
            console.warn('MusicBrainz lookup failed:', e);
        }

        await sleep(1100);
    }

    setLoading(false);
    showStatus(
        `Verification complete. Checked ${count} track(s), updated ${updated} release date(s).`,
        'success'
    );
    renderTrackList();
}

async function queryMusicBrainz(artist, title) {
    const clean = title.split('(')[0].split('[')[0].trim();
    const query = encodeURIComponent(`recording:${clean} AND artist:${artist}`);
    const url   = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=10`;

    const resp = await fetch(url, {
        headers: { 'User-Agent': 'MyHitster/1.0 (github.com/wilgoy23/MyHitster)' }
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.recordings?.length) return null;

    let earliest = null;
    for (const rec of data.recordings) {
        for (const rel of (rec.releases || [])) {
            if (rel.date) {
                const y = parseInt(rel.date.split('-')[0]);
                if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
            }
        }
    }
    return earliest ? String(earliest) : null;
}

// ── QR + PDF generation ───────────────────────────────────────────────────────

async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildQrUrl(previewUrl, cardHash) {
    const encoded = btoa(previewUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${HITSTER_URL}/index.html?id=${cardHash}&preview=${encoded}`;
}

async function generatePDF() {
    const playableTracks = tracks.filter(t => t.previewUrl);
    if (!playableTracks.length) return;

    const { jsPDF } = window.jspdf;
    const pageW = 612, pageH = 792;
    const marginX = 50, marginY = 50;
    const rows = 5, cols = 3;
    const perPage = rows * cols;
    const cardW = (pageW - 2 * marginX) / cols;
    const cardH = (pageH - 2 * marginY) / rows;
    const qrSize = Math.min(cardW, cardH) * 0.8;

    // Generate QR data URLs
    const qrDataUrls = [];
    for (let i = 0; i < playableTracks.length; i++) {
        setLoading(true, `Generating QR code ${i + 1} / ${playableTracks.length}…`);
        const track   = playableTracks[i];
        const hex     = await sha256hex(track.previewUrl);
        const cardId  = hex.substring(0, 12);
        const qrUrl   = buildQrUrl(track.previewUrl, cardId);

        try {
            const dataUrl = await QRCode.toDataURL(qrUrl, {
                width: 300, margin: 2, errorCorrectionLevel: 'L',
            });
            qrDataUrls.push(dataUrl);
        } catch (e) {
            console.error('QR error:', e);
            qrDataUrls.push(null);
        }
    }

    updateStatus('Rendering PDF…');

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    function drawGrid() {
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        for (let r = 0; r <= rows; r++) {
            const y = pageH - marginY - r * cardH;
            doc.line(marginX, y, pageW - marginX, y);
        }
        for (let c = 0; c <= cols; c++) {
            const x = marginX + c * cardW;
            doc.line(x, marginY, x, pageH - marginY);
        }
    }

    function drawGuides() {
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        [[0, pageH - marginY, 15, pageH - marginY],
         [marginX, pageH, marginX, pageH - 15],
         [pageW - 15, pageH - marginY, pageW, pageH - marginY],
         [pageW - marginX, pageH, pageW - marginX, pageH - 15],
         [0, marginY, 15, marginY],
         [marginX, 0, marginX, 15],
         [pageW - 15, marginY, pageW, marginY],
         [pageW - marginX, 0, pageW - marginX, 15],
        ].forEach(([x1, y1, x2, y2]) => doc.line(x1, y1, x2, y2));
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
    }

    function wrappedText(text, cx, y, maxW, size) {
        doc.setFontSize(size);
        const words = text.split(' ');
        const lines = [];
        let cur = '';
        for (const w of words) {
            const test = cur ? `${cur} ${w}` : w;
            if (doc.getTextWidth(test) <= maxW) { cur = test; }
            else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        const lh = size * 1.3;
        for (const line of lines) { doc.text(line, cx, y, { align: 'center' }); y += lh; }
        return lines.length * lh;
    }

    const totalPages = Math.ceil(playableTracks.length / perPage);

    for (let page = 0; page < totalPages; page++) {
        const start = page * perPage;
        const end   = Math.min(start + perPage, playableTracks.length);

        // ── QR page ──
        if (page > 0) doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');
        drawGuides();
        drawGrid();
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`QR page ${page + 1}/${totalPages}`, pageW - marginX, 15, { align: 'right' });

        for (let i = start; i < end; i++) {
            const rel = i - start;
            const row = Math.floor(rel / cols);
            const col = rel % cols;
            const x   = marginX + col * cardW + (cardW - qrSize) / 2;
            const y   = pageH - marginY - row * cardH - (cardH + qrSize) / 2;
            if (qrDataUrls[i]) doc.addImage(qrDataUrls[i], 'PNG', x, y, qrSize, qrSize);
        }

        // ── Info page (columns mirrored for duplex printing) ──
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');
        drawGuides();
        drawGrid();
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Info page ${page + 1}/${totalPages}`, pageW - marginX, 15, { align: 'right' });

        for (let i = start; i < end; i++) {
            const rel    = i - start;
            const row    = Math.floor(rel / cols);
            const col    = rel % cols;
            const mirCol = (cols - 1) - col;
            const track  = playableTracks[i];

            const cx    = marginX + mirCol * cardW + cardW / 2;
            let y       = pageH - marginY - row * cardH - cardH * 0.2;
            const textW = cardW * 0.88;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(0);
            doc.text(track.artist, cx, y, { align: 'center' });
            y += 18;

            doc.setFont('helvetica', 'normal');
            const titleH = wrappedText(track.name, cx, y, textW, 9);
            y += titleH + 8;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.text(track.year, cx, y, { align: 'center' });
        }
    }

    const filename = `Hitster_cards.pdf`;
    doc.save(filename);

    setLoading(false);
    showStatus(
        `PDF downloaded! Print double-sided with "Flip on short edge" for correct alignment.`,
        'success'
    );
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function setLoading(on, message = '') {
    document.getElementById('loading-section').style.display = on ? 'block' : 'none';
    if (message) document.getElementById('loading-message').textContent = message;
}

function updateStatus(msg) {
    document.getElementById('loading-message').textContent = msg;
}

function showStatus(msg, type = '') {
    const el = document.getElementById('status-message');
    el.textContent = msg;
    el.className = type === 'error'   ? 'status error'       :
                   type === 'success' ? 'status success-msg'  :
                   type === 'warning' ? 'status warning-msg'  : 'status';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

window.onload = () => {
    document.getElementById('search-btn').addEventListener('click', searchTracks);
    document.getElementById('verify-btn').addEventListener('click', verifyWithMusicBrainz);
    document.getElementById('generate-btn').addEventListener('click', generatePDF);
    document.getElementById('year-filter-apply').addEventListener('click', renderTrackList);

    const fileInput = document.getElementById('csv-upload');
    fileInput.addEventListener('change', e => handleFileUpload(e.target.files[0]));

    // Drag-and-drop onto the textarea
    const textarea = document.getElementById('track-input');
    textarea.addEventListener('dragover', e => { e.preventDefault(); textarea.classList.add('drag-over'); });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('drag-over'));
    textarea.addEventListener('drop', e => {
        e.preventDefault();
        textarea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });
};
