import { searchItunes, cleanSongTitle }                       from '../api/itunes.js';
import { fetchDeezerPlaylistTracks, fetchDeezerAlbumYear }     from '../api/deezer.js';
import { queryMusicBrainz }                                    from '../api/musicbrainz.js';
import { queryDiscogs }                                        from '../api/discogs.js';
import { generatePDF }                                         from './pdf.js';
import { isConfigured }                                        from '../backend/supabase.js';
import { getUser, onAuthStateChange }                          from '../backend/auth.js';
import {
    saveDeck, getDeckByShareToken, uploadPdf,
    setDeckPublic, setOnLoadDeck,
    getCurrentDeckId, getCurrentShareToken, setCurrentDeck,
    buildShareUrl,
} from '../backend/decks.js';

// ── State ─────────────────────────────────────────────────────────────────────
//
// Each track: { name, artist, year, previewUrl, album, albumId,
//               yearInfo:  per-source years, e.g. { deezer: '1981', musicbrainz: '1975' }
//               yearEdited: true once the user typed a year manually }

let tracks = [];

const YEAR_SOURCE_LABELS = { deezer: 'Deezer', musicbrainz: 'MusicBrainz', discogs: 'Discogs' };

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

        tracks = trackList.map(t => ({
            name:       cleanSongTitle(t.title),
            artist:     t.artist,
            year:       'Unknown',
            previewUrl: t.previewUrl,
            album:      t.albumTitle,
            albumId:    t.albumId,
            yearInfo:   {},
        }));

        setLoading(false);
        showStatus(`Imported ${tracks.length} tracks from Deezer.`, 'success');
        renderTrackList();

        await fillMissingPreviews();
        await verifyReleaseDates();
    } catch (e) {
        setLoading(false);
        showStatus(`Deezer error: ${e.message}`, 'error');
    }
}

// For tracks that Deezer returned without a preview, run a targeted iTunes
// search to find a version that does have one.
async function fillMissingPreviews() {
    const missing = tracks.filter(t => !t.previewUrl);
    if (!missing.length) return;

    setLoading(true, `Finding previews for ${missing.length} track(s)…`);

    let found = 0;
    for (let j = 0; j < missing.length; j++) {
        const t = missing[j];
        updateStatus(`Searching preview ${j + 1}/${missing.length}: ${t.artist} – ${t.name}`);
        try {
            const result = await searchItunes(`${t.artist} ${t.name}`);
            if (result?.previewUrl) { t.previewUrl = result.previewUrl; found++; }
        } catch {
            // leave previewUrl as null
        }
    }

    setLoading(false);
    if (found > 0) {
        showStatus(`Found previews for ${found} additional track(s).`, 'success');
        renderTrackList();
    }
}

// ── Release-date verification ─────────────────────────────────────────────────
//
// Cross-checks every track against the Deezer album date, MusicBrainz (earliest
// recording release) and Discogs (master release year, when Supabase is
// configured) and keeps the earliest credible year — the original release, not
// a reissue or compilation date. Tracks whose sources disagree get a review
// flag in the list. Runs automatically after import; the Step 3 button re-runs
// it (e.g. for a loaded deck).

async function verifyReleaseDates() {
    if (!tracks.length) { showStatus('No tracks to verify.', 'warning'); return; }

    setLoading(true, 'Verifying release dates…');
    let updated = 0;

    for (let j = 0; j < tracks.length; j++) {
        const t = tracks[j];
        updateStatus(`Verifying release dates… (${j + 1} / ${tracks.length}): ${t.artist} – ${t.name}`);

        // The three sources have independent rate-limit queues, so the
        // lookups run in parallel — one track costs the slowest queue (~1.1 s).
        const [dzYear, mbYear, dcYear] = await Promise.all([
            fetchDeezerAlbumYear(t.albumId).catch(() => null),
            queryMusicBrainz(t.artist, t.name).catch(() => null),
            queryDiscogs(t.artist, t.name).catch(() => null),
        ]);

        t.yearInfo = {};
        if (dzYear) t.yearInfo.deezer      = dzYear;
        if (mbYear) t.yearInfo.musicbrainz = mbYear;
        if (dcYear) t.yearInfo.discogs     = dcYear;

        if (!t.yearEdited) {
            const maxYear = new Date().getFullYear() + 1;
            const candidates = [t.year, dzYear, mbYear, dcYear]
                .map(y => parseInt(y))
                .filter(y => !isNaN(y) && y >= 1900 && y <= maxYear);
            if (candidates.length) {
                const earliest = String(Math.min(...candidates));
                if (earliest !== t.year) {
                    t.year = earliest;
                    updated++;
                }
            }
        }

        updateYearCell(j);
    }

    setLoading(false);
    showStatus(`Verification complete. Checked ${tracks.length} track(s), updated ${updated} release date(s).`, 'success');
    renderTrackList();
}

// Refreshes one row's year input and disagreement flag in place, so results
// appear progressively during verification without rebuilding the table
// (which would steal focus from a year the user is editing).
function updateYearCell(index) {
    const input = document.querySelector(`.year-input[data-idx="${index}"]`);
    if (!input) return;
    const track = tracks[index];

    if (document.activeElement !== input) input.value = track.year;

    const cell = input.parentElement;
    cell.querySelector('.year-flag')?.remove();
    const conflict = yearConflict(track);
    if (conflict) {
        const flag = document.createElement('span');
        flag.className   = 'year-flag';
        flag.title       = `Sources disagree — ${conflict}`;
        flag.textContent = '!';
        cell.appendChild(flag);
    }
}

// Returns the per-source year list for the review flag, or null when the
// sources agree (or the user has manually set the year).
function yearConflict(track) {
    if (track.yearEdited) return null;
    const info = track.yearInfo || {};
    const years = [...new Set(Object.values(info))];
    if (years.length < 2) return null;
    return Object.entries(info)
        .map(([source, year]) => `${YEAR_SOURCE_LABELS[source] || source}: ${year}`)
        .join(' · ');
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function handleGeneratePDF() {
    setLoading(true, 'Starting PDF generation…');
    try {
        const filename = document.getElementById('pdf-name-input').value.trim();
        const blob = await generatePDF(tracks, msg => updateStatus(msg), filename || undefined);
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

        const tr = document.createElement('tr');
        if      (noPreview)  tr.className = 'no-preview';
        else if (outOfRange) tr.className = 'out-of-range';

        const badge = noPreview ? '<span class="badge badge-warning">No preview</span>'
                                : '<span class="badge badge-ok">&#10003;</span>';

        const conflict = yearConflict(track);
        const flag = conflict
            ? `<span class="year-flag" title="Sources disagree — ${escHtml(conflict)}">!</span>`
            : '';

        tr.innerHTML =
            `<td>${i + 1}</td>` +
            `<td>${escHtml(track.artist)}</td>` +
            `<td>${escHtml(track.name)}</td>` +
            `<td class="year-cell"><input type="text" class="year-input" value="${escHtml(track.year)}" data-idx="${i}" maxlength="4">${flag}</td>` +
            `<td>${badge}</td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.year-input').forEach(input => {
        input.addEventListener('change', e => {
            const track = tracks[parseInt(e.target.dataset.idx)];
            track.year       = e.target.value.trim();
            track.yearEdited = true;
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

    // Step controls
    document.getElementById('year-filter-apply').addEventListener('click', renderTrackList);
    document.getElementById('verify-btn').addEventListener('click', verifyReleaseDates);
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
