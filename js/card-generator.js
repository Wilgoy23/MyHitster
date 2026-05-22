const HITSTER_URL = 'https://wilgoy23.github.io/MyHitster';

let accessToken = null;
let tracks = [];
let playlistInfo = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

function init() {
    accessToken = getValidToken();
    if (!accessToken) {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('generator-section').style.display = 'none';
    } else {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('generator-section').style.display = 'block';
        const name = localStorage.getItem('spotify_user_name');
        if (name) document.getElementById('user-name').textContent = `Signed in as ${name}`;
    }
}

// ── Spotify fetch ─────────────────────────────────────────────────────────────

function extractPlaylistId(input) {
    const urlMatch = input.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];
    return null;
}

async function spotifyFetch(url) {
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
    return response.json();
}

async function fetchPlaylistTracks() {
    const input = document.getElementById('playlist-url').value.trim();
    const playlistId = extractPlaylistId(input);
    if (!playlistId) {
        showStatus('Invalid Spotify playlist URL or URI.', 'error');
        return;
    }

    setLoading(true, 'Fetching playlist info…');
    tracks = [];
    document.getElementById('track-list-section').style.display = 'none';
    document.getElementById('generate-btn').style.display = 'none';

    try {
        const pl = await spotifyFetch(
            `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,owner(display_name)`
        );
        playlistInfo = { name: pl.name, owner: pl.owner.display_name };

        let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks` +
            `?limit=100&fields=next,items(track(name,artists,album(name,release_date,images),external_urls))`;

        while (url) {
            updateStatus(`Fetching tracks… (${tracks.length} so far)`);
            const data = await spotifyFetch(url);
            for (const item of data.items) {
                if (!item.track || !item.track.external_urls) continue;
                const t = item.track;
                const rawDate = t.album.release_date || '';
                const year = rawDate.length >= 4 ? rawDate.substring(0, 4) : 'Unknown';
                tracks.push({
                    name: cleanSongTitle(t.name),
                    artist: t.artists[0].name,
                    album: t.album.name,
                    year,
                    url: t.external_urls.spotify,
                });
            }
            url = data.next || null;
        }

        showStatus(`Found ${tracks.length} tracks in "${playlistInfo.name}".`, 'success');
        renderTrackList();
    } catch (e) {
        showStatus(`Error: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
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
        const tr = document.createElement('tr');
        if (outOfRange) tr.className = 'out-of-range';
        tr.innerHTML =
            `<td>${i + 1}</td>` +
            `<td>${escHtml(track.artist)}</td>` +
            `<td>${escHtml(track.name)}</td>` +
            `<td><input type="text" class="year-input" value="${escHtml(track.year)}" ` +
            `data-idx="${i}" maxlength="4"></td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.year-input').forEach(input => {
        input.addEventListener('change', e => {
            tracks[parseInt(e.target.dataset.idx)].year = e.target.value.trim();
            renderTrackList();
        });
    });

    document.getElementById('track-list-section').style.display = 'block';
    document.getElementById('generate-btn').style.display = 'inline-block';

    const outCount = tbody.querySelectorAll('.out-of-range').length;
    if (outCount > 0 && minYear > 0) {
        showStatus(
            `${tracks.length} tracks loaded. ${outCount} are outside the ${minYear}–${maxYear} range (highlighted in yellow).`,
            'warning'
        );
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
    const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=10`;

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

function buildQrUrl(spotifyTrackUrl) {
    const trackId = spotifyTrackUrl.split('/').pop().split('?')[0];
    const uri = `spotify:track:${trackId}`;
    const encoded = btoa(uri).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { encoded, uri };
}

async function generatePDF() {
    if (!tracks.length) return;

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
    for (let i = 0; i < tracks.length; i++) {
        updateStatus(`Generating QR code ${i + 1} / ${tracks.length}…`);
        setLoading(true, `Generating QR code ${i + 1} / ${tracks.length}…`);
        const { encoded } = buildQrUrl(tracks[i].url);
        const hex = await sha256hex(tracks[i].url);
        const qrUrl = `${HITSTER_URL}/index.html?id=${hex.substring(0, 12)}&track=${encoded}`;
        try {
            const dataUrl = await QRCode.toDataURL(qrUrl, {
                width: 300, margin: 2, errorCorrectionLevel: 'L',
            });
            qrDataUrls.push(dataUrl);
        } catch (e) {
            console.error('QR generation error:', e);
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
        const len = 15;
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        // corner crop marks
        [[0, pageH - marginY, len, pageH - marginY],
         [marginX, pageH, marginX, pageH - len],
         [pageW - len, pageH - marginY, pageW, pageH - marginY],
         [pageW - marginX, pageH, pageW - marginX, pageH - len],
         [0, marginY, len, marginY],
         [marginX, 0, marginX, len],
         [pageW - len, marginY, pageW, marginY],
         [pageW - marginX, 0, pageW - marginX, len],
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

    const totalPages = Math.ceil(tracks.length / perPage);

    for (let page = 0; page < totalPages; page++) {
        const start = page * perPage;
        const end = Math.min(start + perPage, tracks.length);

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
            const x = marginX + col * cardW + (cardW - qrSize) / 2;
            const y = pageH - marginY - row * cardH - (cardH + qrSize) / 2;
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
            const rel = i - start;
            const row = Math.floor(rel / cols);
            const col = rel % cols;
            const mirCol = (cols - 1) - col;
            const track = tracks[i];

            const cx = marginX + mirCol * cardW + cardW / 2;
            let y = pageH - marginY - row * cardH - cardH * 0.2;
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

    const safeName = (playlistInfo?.name || 'cards').replace(/[^a-z0-9]/gi, '_');
    doc.save(`Hitster_${safeName}.pdf`);

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
    el.className = type === 'error' ? 'status error' :
                   type === 'success' ? 'status success-msg' :
                   type === 'warning' ? 'status warning-msg' : 'status';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

window.onload = () => {
    init();
    document.getElementById('login-button')?.addEventListener('click', initiateLogin);
    document.getElementById('fetch-btn').addEventListener('click', fetchPlaylistTracks);
    document.getElementById('verify-btn').addEventListener('click', verifyWithMusicBrainz);
    document.getElementById('generate-btn').addEventListener('click', generatePDF);
    document.getElementById('year-filter-apply').addEventListener('click', renderTrackList);

    document.getElementById('playlist-url').addEventListener('keydown', e => {
        if (e.key === 'Enter') fetchPlaylistTracks();
    });
};
