// Card registry: maps the 12-hex-char card ID printed in each QR code to the
// track it represents. Written when a PDF is generated, read by the player to
// recover a fresh preview URL when the one baked into the card has expired.
// Everything no-ops when Supabase isn't configured.

import { supabase, isConfigured } from './supabase.js';
import { searchItunes }           from '../api/itunes.js';

// Registers card records ({id, artist, title, year}). Existing IDs are left
// untouched (cards are immutable once registered). Failures are non-fatal —
// the PDF works without the registry, cards just lose recoverability.
export async function saveCards(records) {
    if (!isConfigured) return;
    // The table constraints require a non-empty artist and title (manual
    // imports can lack an artist) — skip records that would fail the insert.
    const valid = records
        .filter(r => r.id && r.artist && r.title)
        .map(r => ({
            id:     r.id,
            artist: r.artist.slice(0, 300),
            title:  r.title.slice(0, 300),
            year:   String(r.year ?? '').slice(0, 10),
        }));
    if (!valid.length) return;
    const { error } = await supabase
        .from('cards')
        .upsert(valid, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
}

// Returns {id, artist, title, year} for a card ID, or null.
export async function lookupCard(id) {
    if (!isConfigured || !id) return null;
    const { data, error } = await supabase
        .from('cards')
        .select('id, artist, title, year')
        .eq('id', id)
        .limit(1);
    if (error || !data?.length) return null;
    return data[0];
}

// Looks up the track behind a card ID and searches iTunes for a working
// preview URL. Returns the URL or null.
export async function recoverPreviewUrl(id) {
    const card = await lookupCard(id);
    if (!card) return null;
    const result = await searchItunes(`${card.artist} ${card.title}`);
    return result?.previewUrl ?? null;
}

// player.js and scanner.js are plain (non-module) scripts, so expose the
// recovery entry point on window for them.
window.recoverCardPreview = recoverPreviewUrl;
