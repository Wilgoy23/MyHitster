import { parseInput }                                          from './parser.js';
import { searchItunes, searchItunesEntities,
         fetchAlbumTracks, fetchArtistTracks, cleanSongTitle } from './itunes.js';
import { fetchDeezerPlaylistTracks }                           from './deezer.js';
import { queryMusicBrainz }                                    from './musicbrainz.js';
import { generatePDF }                                         from './pdf.js';
import { isConfigured }                                        from './supabase.js';
import { getUser, onAuthStateChange }                          from './auth.js';
import {
    saveDeck, getDeckByShareToken, uploadPdf,
    setDeckPublic, setOnLoadDeck,
    getCurrentDeckId, getCurrentShareToken, setCurrentDeck,
    buildShareUrl,
} from './decks.js';

// ── State ─────────────────────────────────────────────────────────────────────

let tracks    = [];
let searchTab = 'album';

// ── Deezer playlist import ────────────────────────────────────────────────────

async function importPlaylistUrl() {
    const raw = document.getElementById('playlist-url-input').value.trim();
    if (!raw) { showStatus('Paste a Deezer playlist URL first.', 'error'); return; }

    try {
        const m = new URL(raw).pathname.match(/\/playlist\/(\d+)/);
        if (!m) { showStatus('URL not recognised — paste a deezer.com/playlist/… link.', 'error'); return; }
        setLoading(true, 'Fetching Deezer playlist…');
        const trackList = await fetchDeezerPlaylistTracks(m[1]);
        if (!trackList.length) { setLoading(false); showStatus('Playlist is empty or private.', 'error'); return; }
        await searchItunesForTracks(trackList);
    } catch (e) {
        setLoading(false);
        showStatus(`Deezer error: ${e.message}`, 'error');
    }
}

// ── iTunes album / artist search ──────────────────────────────────────────────

async function runItunesSearch() {
    const query = document.getElementById('itunes-search-input').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('itunes-results');
    resultsEl.innerHTML = '<p style="color:#aaa;font-size:13px;padding:8px 0">Searching…</p>';

    try {
        const entity  = searchTab === 'album' ? 'album' : 'musicArtist';
        const results = await searchItunesEntities(query, entity);
        if (!results.length) {
            resultsEl.innerHTML = '<p style="color:#aaa;font-size:13px;padding:8px 0">No results found.</p>';
            return;
        }
        renderItunesResults(results, resultsEl);
    } catch {
        resultsEl.innerHTML = '<p style="color:#e74c3c;font-size:13px;padding:8px 0">Search failed. Please try again.</p>';
    }
}

function renderItunesResults(results, container) {
    container.innerHTML = '';
    for (const item of results) {
        const card = document.createElement('div');
        card.className = 'result-card';

        if (searchTab === 'album') {
            const artwork    = (item.artworkUrl100 || '').replace('100x100bb', '60x60bb');
            const year       = item.releaseDate ? new Date(item.releaseDate).getFullYear() : '';
            const trackCount = item.trackCount ? ` · ${item.trackCount} tracks` : '';
            card.innerHTML =
                `<img class="result-artwork" src="${escHtml(artwork)}" alt="" onerror="this.style.display='none'">` +
                `<div class="result-info">` +
                    `<div class="result-name">${escHtml(item.collectionName)}</div>` +
                    `<div class="result-sub">${escHtml(item.artistName)}${year ? ' · ' + year : ''}${trackCount}</div>` +
                `</div>`;
            card.addEventListener('click', () => importAlbum(item.collectionId, item.collectionName, item.artistName));
        } else {
            card.innerHTML =
                `<div class="result-info">` +
                    `<div class="result-name">${escHtml(item.artistName)}</div>` +
                    `<div class="result-sub">Artist</div>` +
                `</div>`;
            card.addEventListener('click', () => importArtist(item.artistId, item.artistName));
        }
        container.appendChild(card);
    }
}

async function importAlbum(collectionId, albumName, artistName) {
    document.getElementById('itunes-results').innerHTML = '';
    setLoading(true, `Loading "${albumName}"…`);
    try {
        const songs = await fetchAlbumTracks(collectionId);
        if (!songs.length) { setLoading(false); showStatus('No tracks found for this album.', 'error'); return; }
        tracks = songs.map(s => itunesResultToTrack(s, { fallbackArtist: artistName, fallbackAlbum: albumName }));
        await finishImport(`Loaded ${tracks.length} tracks from "${albumName}".`);
    } catch {
        setLoading(false);
        showStatus('Failed to load album tracks. Please try again.', 'error');
    }
}

async function importArtist(artistId, artistName) {
    document.getElementById('itunes-results').innerHTML = '';
    setLoading(true, `Loading tracks for "${artistName}"…`);
    try {
        const songs = await fetchArtistTracks(artistId);
        if (!songs.length) { setLoading(false); showStatus('No tracks found for this artist.', 'error'); return; }
        tracks = songs.map(s => itunesResultToTrack(s, { fallbackArtist: artistName }));
        await finishImport(`Loaded ${tracks.length} tracks for "${artistName}".`);
    } catch {
        setLoading(false);
        showStatus('Failed to load artist tracks. Please try again.', 'error');
    }
}

function itunesResultToTrack(s, { fallbackArtist = '', fallbackAlbum = '' } = {}) {
    return {
        name:       cleanSongTitle(s.trackName || ''),
        artist:     s.artistName || fallbackArtist,
        year:       s.releaseDate ? new Date(s.releaseDate).getFullYear().toString() : 'Unknown',
        previewUrl: s.previewUrl || null,
        album:      s.collectionName || fallbackAlbum,
        notFound:   false,
    };
}

async function finishImport(baseMsg) {
    setLoading(false);
    showStatus(baseMsg, 'success');
    renderTrackList();
    await fillMissingPreviews();
    await autoFixUnknownYears();
}

// For tracks that the Deezer lookup returned without a previewUrl, run a
// targeted search to find a version that does have one.
async function fillMissingPreviews() {
    const missing = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.previewUrl && !t.notFound);
    if (!missing.length) return;

    setLoading(true, `Finding previews for ${missing.length} track(s)…`);
    updateStatus(`Searching previews for ${missing.length} track(s)…`);

    for (let j = 0; j < missing.length; j++) {
        const { t, i } = missing[j];
        updateStatus(`Searching preview ${j + 1}/${missing.length}: ${t.artist} – ${t.name}`);
        try {
            const result = await searchItunes(`${t.artist} ${t.name}`);
            if (result?.previewUrl) tracks[i].previewUrl = result.previewUrl;
        } catch {
            // leave previewUrl as null
        }
        if (j < missing.length - 1) await sleep(250);
    }

    setLoading(false);
    const stillMissing = tracks.filter(t => !t.previewUrl && !t.notFound).length;
    const found = missing.length - stillMissing;
    if (found > 0) {
        showStatus(`Found previews for ${found} additional track(s).`, 'success');
        renderTrackList();
    }
}

// ── CSV / textarea import ─────────────────────────────────────────────────────

async function searchTracks() {
    const input = document.getElementById('track-input').value.trim();
    if (!input) { showStatus('Please upload a CSV or paste a track list.', 'error'); return; }
    const queries = parseInput(input).filter(q => q.length > 0);
    if (!queries.length) { showStatus('Could not parse any tracks from the input.', 'error'); return; }
    await searchItunesForTracks(queries.map(q => ({ artist: '', title: q })));
}

function handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('track-input').value = e.target.result;
        showStatus(`Loaded "${file.name}". Click "Search iTunes" to continue.`, 'success');
    };
    reader.readAsText(file);
}

// ── Shared iTunes search loop ─────────────────────────────────────────────────

async function searchItunesForTracks(trackList) {
    tracks = [];
    document.getElementById('track-list-section').style.display = 'none';
    document.getElementById('generate-btn').style.display = 'none';
    setLoading(true, `Searching… (0 / ${trackList.length})`);

    let notFound = 0, noPreview = 0;
    for (let i = 0; i < trackList.length; i++) {
        const { artist, title } = trackList[i];
        const query = artist ? `${artist} ${title}` : title;
        updateStatus(`Searching iTunes… (${i + 1} / ${trackList.length}): ${query}`);
        try {
            const result = await searchItunes(query);
            if (result) {
                tracks.push(result);
                if (!result.previewUrl) noPreview++;
            } else {
                tracks.push({ name: title, artist, year: 'Unknown', previewUrl: null, notFound: true });
                notFound++;
            }
        } catch {
            tracks.push({ name: title, artist, year: 'Unknown', previewUrl: null, notFound: true });
            notFound++;
        }
        if (i < trackList.length - 1) await sleep(250);
    }

    setLoading(false);
    let msg = `Found ${tracks.length - notFound} of ${trackList.length} tracks on iTunes.`;
    if (notFound  > 0) msg += ` ${notFound} not found.`;
    if (noPreview > 0) msg += ` ${noPreview} have no preview.`;
    showStatus(msg, notFound > 0 ? 'warning' : 'success');
    renderTrackList();
    await autoFixUnknownYears();
}

// ── MusicBrainz: auto-fix unknown years ───────────────────────────────────────

async function autoFixUnknownYears() {
    const unknown = tracks.map((t, i) => ({ t, i })).filter(({ t }) => t.year === 'Unknown' && !t.notFound);
    if (!unknown.length) return;

    setLoading(true, `Looking up ${unknown.length} unknown release date(s) via MusicBrainz…`);
    let updated = 0;

    for (let j = 0; j < unknown.length; j++) {
        const { t, i } = unknown[j];
        updateStatus(`Looking up year ${j + 1}/${unknown.length}: ${t.artist} – ${t.name}`);
        try {
            const year = await queryMusicBrainz(t.artist, t.name);
            if (year) { tracks[i].year = year; updated++; }
        } catch (e) {
            console.warn('MusicBrainz lookup failed:', e);
        }
        if (j < unknown.length - 1) await sleep(1100);
    }

    setLoading(false);
    if (updated > 0) {
        showStatus(`${updated} of ${unknown.length} unknown year(s) resolved.`, 'success');
        renderTrackList();
    } else if (unknown.length > 0) {
        showStatus(`Could not determine year for ${unknown.length} track(s) — edit manually.`, 'warning');
    }
}

// ── MusicBrainz: manual broad verification (Step 3) ──────────────────────────

const CLASSIC_ARTISTS = [
    'queen', 'led zeppelin', 'pink floyd', 'the beatles', 'rolling stones',
    'ac/dc', 'acdc', 'black sabbath', 'deep purple', 'bob dylan', 'david bowie',
    'the who', 'jimi hendrix', 'the doors', 'eagles', 'fleetwood mac',
];

async function verifyWithMusicBrainz() {
    const maxLookups = parseInt(document.getElementById('mb-limit').value) || 25;
    setLoading(true, 'Starting MusicBrainz verification…');
    let count = 0, updated = 0;

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
                if (isNaN(yr) || vyr < yr) { tracks[i].year = verified; updated++; }
            }
        } catch (e) {
            console.warn('MusicBrainz lookup failed:', e);
        }
        await sleep(1100);
    }

    setLoading(false);
    showStatus(`Verification complete. Checked ${count} track(s), updated ${updated} release date(s).`, 'success');
    renderTrackList();
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function handleGeneratePDF() {
    setLoading(true, 'Starting PDF generation…');
    try {
        const blob = await generatePDF(tracks, msg => updateStatus(msg));
        showStatus('PDF downloaded! Print double-sided with "Flip on short edge" for correct alignment.', 'success');

        if (isConfigured && getUser() && getCurrentDeckId() && blob) {
            try {
                updateStatus('Uploading PDF to your account…');
                const playable = tracks.filter(t => t.previewUrl).length;
                await uploadPdf(getCurrentDeckId(), blob, playable);
                setDeckSaveStatus('PDF saved to history.');
            } catch (e) {
                console.warn('PDF upload failed:', e);
            }
        }
    } catch (e) {
        showStatus(`PDF generation failed: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

// ── Track list UI ─────────────────────────────────────────────────────────────

function renderTrackList() {
    const minYear = parseInt(document.getElementById('min-year').value) || 0;
    const maxYear = parseInt(document.getElementById('max-year').value) || 9999;
    const tbody   = document.getElementById('track-tbody');
    tbody.innerHTML = '';

    tracks.forEach((track, i) => {
        const yr         = parseInt(track.year);
        const outOfRange = !isNaN(yr) && minYear > 0 && (yr < minYear || yr > maxYear);
        const noPreview  = !track.previewUrl;
        const notFound   = track.notFound;

        const tr = document.createElement('tr');
        if      (notFound)    tr.className = 'not-found';
        else if (noPreview)   tr.className = 'no-preview';
        else if (outOfRange)  tr.className = 'out-of-range';

        const badge = notFound  ? '<span class="badge badge-error">Not found</span>'
                    : noPreview ? '<span class="badge badge-warning">No preview</span>'
                                : '<span class="badge badge-ok">&#10003;</span>';

        tr.innerHTML =
            `<td>${i + 1}</td>` +
            `<td>${escHtml(track.artist)}</td>` +
            `<td>${escHtml(track.name)}</td>` +
            `<td><input type="text" class="year-input" value="${escHtml(track.year)}" data-idx="${i}" maxlength="4"></td>` +
            `<td>${badge}</td>`;
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
    if (playable === 0) showStatus('No tracks with previews found. Cannot generate PDF.', 'error');

    if (isConfigured) {
        const toolbar = document.getElementById('deck-toolbar');
        if (toolbar) toolbar.style.display = getUser() && playable > 0 ? 'flex' : 'none';
        const shareBtn = document.getElementById('share-deck-btn');
        if (shareBtn) shareBtn.style.display = getCurrentDeckId() ? 'inline-block' : 'none';
    }
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
    el.className = type === 'error'   ? 'status error'      :
                   type === 'success' ? 'status success-msg' :
                   type === 'warning' ? 'status warning-msg' : 'status';
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setDeckSaveStatus(msg, ok = true) {
    const el = document.getElementById('deck-save-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? '#4ade80' : '#e74c3c';
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
}

// ── Deck feature handlers ──────────────────────────────────────────────────────

async function handleSaveDeck() {
    const nameInput = document.getElementById('deck-name-input');
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        setDeckSaveStatus('Enter a deck name first.', false);
        return;
    }
    const btn = document.getElementById('save-deck-btn');
    btn.disabled = true;
    setDeckSaveStatus('Saving…');
    try {
        await saveDeck(name, tracks, getCurrentDeckId());
        setDeckSaveStatus('Saved!');
        const shareBtn = document.getElementById('share-deck-btn');
        if (shareBtn) shareBtn.style.display = 'inline-block';
    } catch (e) {
        setDeckSaveStatus(e.message, false);
    } finally {
        btn.disabled = false;
    }
}

async function handleShareDeck() {
    const btn = document.getElementById('share-deck-btn');
    const deckId = getCurrentDeckId();
    if (!deckId) return;
    btn.disabled = true;
    try {
        let token = getCurrentShareToken();
        if (!token) {
            const result = await setDeckPublic(deckId, true);
            token = result.share_token;
        } else {
            await setDeckPublic(deckId, true);
        }
        await navigator.clipboard.writeText(buildShareUrl(token));
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = prev; }, 2000);
    } catch (e) {
        setDeckSaveStatus('Could not copy link: ' + e.message, false);
    } finally {
        btn.disabled = false;
    }
}

async function loadSharedDeck(token) {
    setLoading(true, 'Loading shared deck…');
    try {
        const deck = await getDeckByShareToken(token);
        if (!deck || !Array.isArray(deck.tracks) || !deck.tracks.length) {
            setLoading(false);
            showStatus('Shared deck not found or has no tracks.', 'error');
            return;
        }
        tracks = deck.tracks;
        setCurrentDeck(deck.id, deck.share_token);
        document.getElementById('deck-name-input').value = deck.name;
        setLoading(false);
        showStatus(`Loaded shared deck "${deck.name}" (${tracks.length} tracks).`, 'success');
        renderTrackList();
    } catch (e) {
        setLoading(false);
        showStatus(`Failed to load shared deck: ${e.message}`, 'error');
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function _init() {
    // Deezer playlist import
    document.getElementById('playlist-import-btn').addEventListener('click', importPlaylistUrl);
    document.getElementById('playlist-url-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') importPlaylistUrl();
    });

    // iTunes collection search
    document.getElementById('itunes-search-btn').addEventListener('click', runItunesSearch);
    document.getElementById('itunes-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') runItunesSearch();
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchTab = btn.dataset.tab;
            document.getElementById('itunes-results').innerHTML = '';
        });
    });

    // CSV / textarea import
    document.getElementById('search-btn').addEventListener('click', searchTracks);
    const fileInput = document.getElementById('csv-upload');
    fileInput.addEventListener('change', e => handleFileUpload(e.target.files[0]));
    const textarea = document.getElementById('track-input');
    textarea.addEventListener('dragover', e => { e.preventDefault(); textarea.classList.add('drag-over'); });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('drag-over'));
    textarea.addEventListener('drop', e => {
        e.preventDefault();
        textarea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    // Step controls
    document.getElementById('year-filter-apply').addEventListener('click', renderTrackList);
    document.getElementById('verify-btn').addEventListener('click', verifyWithMusicBrainz);
    document.getElementById('generate-btn').addEventListener('click', handleGeneratePDF);

    // ── Deck / auth features (only when Supabase is configured) ──
    if (isConfigured) {
        document.getElementById('save-deck-btn').addEventListener('click', handleSaveDeck);
        document.getElementById('share-deck-btn').addEventListener('click', handleShareDeck);
        document.getElementById('deck-name-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') handleSaveDeck();
        });

        // Update toolbar visibility when auth state changes
        onAuthStateChange(user => {
            const toolbar = document.getElementById('deck-toolbar');
            if (!toolbar) return;
            const playable = tracks.filter(t => t.previewUrl).length;
            toolbar.style.display = user && playable > 0 ? 'flex' : 'none';
        });

        // Register callback for "Load" button in My Decks panel
        setOnLoadDeck(deck => {
            tracks = deck.tracks;
            document.getElementById('deck-name-input').value = deck.name;
            renderTrackList();
            showStatus(`Loaded deck "${deck.name}".`, 'success');
        });

        // Auto-load shared deck from URL
        const token = new URLSearchParams(window.location.search).get('deck');
        if (token) loadSharedDeck(token);
    }
}

if (document.readyState === 'complete') {
    _init();
} else {
    window.addEventListener('load', _init);
}
