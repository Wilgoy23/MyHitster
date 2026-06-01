import { supabase, isConfigured } from './supabase.js';
import { getUser, onAuthStateChange } from './auth.js';

// ── State ────────────────────────────────────────────────────────────────────

let _deckId      = null;
let _shareToken  = null;
let _onLoadDeck  = null; // registered by card-generator.js

export function getCurrentDeckId()    { return _deckId; }
export function getCurrentShareToken(){ return _shareToken; }
export function setCurrentDeck(id, token) { _deckId = id; _shareToken = token; }
export function setOnLoadDeck(cb)     { _onLoadDeck = cb; }

// ── Data operations ───────────────────────────────────────────────────────────

export async function listDecks() {
    const { data, error } = await supabase
        .from('decks')
        .select('id, name, tracks, share_token, is_public, created_at, updated_at')
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function saveDeck(name, tracks, existingId = null) {
    const user = getUser();
    if (!user) throw new Error('Not signed in.');

    const payload = {
        name,
        tracks: JSON.parse(JSON.stringify(tracks)),
        updated_at: new Date().toISOString(),
    };

    let result;
    if (existingId) {
        const { data, error } = await supabase
            .from('decks').update(payload)
            .eq('id', existingId).eq('user_id', user.id)
            .select('id, name, share_token, is_public').single();
        if (error) throw error;
        result = data;
    } else {
        const { data, error } = await supabase
            .from('decks').insert({ ...payload, user_id: user.id })
            .select('id, name, share_token, is_public').single();
        if (error) throw error;
        result = data;
    }

    _deckId     = result.id;
    _shareToken = result.share_token;
    return result;
}

export async function deleteDeck(id) {
    const { error } = await supabase.from('decks').delete().eq('id', id);
    if (error) throw error;
    if (_deckId === id) { _deckId = null; _shareToken = null; }
}

export async function getDeckByShareToken(token) {
    const { data, error } = await supabase
        .from('decks').select('*')
        .eq('share_token', token).eq('is_public', true)
        .single();
    if (error) return null;
    return data;
}

export async function setDeckPublic(id, isPublic) {
    const { data, error } = await supabase
        .from('decks').update({ is_public: isPublic })
        .eq('id', id)
        .select('id, share_token, is_public').single();
    if (error) throw error;
    if (isPublic && data) _shareToken = data.share_token;
    return data;
}

export async function uploadPdf(deckId, pdfBlob, trackCount) {
    const user = getUser();
    if (!user || !deckId) return null;

    const path = `${user.id}/${deckId}/${Date.now()}.pdf`;

    const { error: uploadErr } = await supabase.storage
        .from('pdfs').upload(path, pdfBlob, { contentType: 'application/pdf' });
    if (uploadErr) throw uploadErr;

    await supabase.from('deck_pdfs').insert({ deck_id: deckId, storage_path: path, track_count: trackCount });

    const { data } = await supabase.storage.from('pdfs').createSignedUrl(path, 86400);
    return data?.signedUrl ?? null;
}

export async function listPdfHistory(deckId) {
    const { data, error } = await supabase
        .from('deck_pdfs').select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) return [];
    return data || [];
}

// ── Share URL ─────────────────────────────────────────────────────────────────

export function buildShareUrl(token) {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/[^/]*$/, '/card-generator.html');
    url.search   = `?deck=${token}`;
    url.hash     = '';
    return url.toString();
}

// ── My Decks panel UI ─────────────────────────────────────────────────────────

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function _renderDeckList() {
    const list = document.getElementById('my-decks-list');
    if (!list) return;

    list.innerHTML = '<p class="my-decks-info">Loading…</p>';

    try {
        const decks = await listDecks();
        if (!decks.length) {
            list.innerHTML = '<p class="my-decks-info">No saved decks yet.</p>';
            return;
        }
        list.innerHTML = '';

        for (const deck of decks) {
            const count = Array.isArray(deck.tracks) ? deck.tracks.length : '?';
            const item  = document.createElement('div');
            item.className = 'my-decks-item';
            item.innerHTML = `
                <div class="my-decks-item-info">
                    <div class="my-decks-item-name">${_esc(deck.name)}</div>
                    <div class="my-decks-item-meta">${count} tracks &middot; ${_fmtDate(deck.updated_at)}</div>
                </div>
                <div class="my-decks-item-actions">
                    <button class="my-decks-btn" data-action="load"   data-id="${_esc(deck.id)}">Load</button>
                    <button class="my-decks-btn ${deck.is_public ? 'active' : ''}"
                            data-action="share"  data-id="${_esc(deck.id)}"
                            data-token="${_esc(deck.share_token)}"
                            data-public="${deck.is_public}"
                            title="${deck.is_public ? 'Shared — click to copy link' : 'Share this deck'}">
                        ${deck.is_public ? 'Shared' : 'Share'}
                    </button>
                    <button class="my-decks-btn my-decks-btn--danger" data-action="delete" data-id="${_esc(deck.id)}">Delete</button>
                </div>`;
            list.appendChild(item);
        }

        list.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const deck = decks.find(d => d.id === btn.dataset.id);
                if (!deck) return;
                _deckId     = deck.id;
                _shareToken = deck.share_token;
                _closePanel();
                if (_onLoadDeck) _onLoadDeck(deck);
            });
        });

        list.querySelectorAll('[data-action="share"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isPublic = btn.dataset.public === 'true';
                try {
                    if (!isPublic) {
                        const result = await setDeckPublic(btn.dataset.id, true);
                        btn.dataset.public = 'true';
                        btn.classList.add('active');
                        btn.dataset.token  = result.share_token;
                        _shareToken = result.share_token;
                    }
                    await navigator.clipboard.writeText(buildShareUrl(btn.dataset.token));
                    const prev = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = btn.dataset.public === 'true' ? 'Shared' : 'Share'; }, 2000);
                    void prev;
                } catch (e) {
                    console.error('Share error:', e);
                }
            });
        });

        list.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this deck? This cannot be undone.')) return;
                try {
                    await deleteDeck(btn.dataset.id);
                    btn.closest('.my-decks-item').remove();
                    if (!list.querySelector('.my-decks-item')) {
                        list.innerHTML = '<p class="my-decks-info">No saved decks yet.</p>';
                    }
                } catch (e) {
                    console.error('Delete error:', e);
                }
            });
        });

    } catch (e) {
        list.innerHTML = `<p class="my-decks-info" style="color:#e74c3c">Error: ${_esc(e.message)}</p>`;
    }
}

function _openPanel() {
    const panel    = document.getElementById('my-decks-panel');
    const backdrop = document.getElementById('my-decks-backdrop');
    if (panel)    panel.classList.add('open');
    if (backdrop) backdrop.style.display = 'block';
}

function _closePanel() {
    const panel    = document.getElementById('my-decks-panel');
    const backdrop = document.getElementById('my-decks-backdrop');
    if (panel)    panel.classList.remove('open');
    if (backdrop) backdrop.style.display = 'none';
}

// ── Init ─────────────────────────────────────────────────────────────────────

function _init() {
    // Wire up the static panel elements already in the HTML
    document.getElementById('my-decks-close')?.addEventListener('click', _closePanel);
    document.getElementById('my-decks-backdrop')?.addEventListener('click', _closePanel);

    window.addEventListener('auth:show-decks', () => {
        if (!getUser()) return;
        _openPanel();
        _renderDeckList();
    });

    // Hide deck toolbar when user signs out
    onAuthStateChange(user => {
        if (!user) {
            const toolbar = document.getElementById('deck-toolbar');
            if (toolbar) toolbar.style.display = 'none';
        }
    });
}

if (isConfigured) _init();
