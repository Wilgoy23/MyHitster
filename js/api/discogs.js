import { throttle }            from './rateLimit.js';
import { supabase, isConfigured } from '../backend/supabase.js';

// Returns the earliest known master-release year for a given artist + title,
// via a Supabase Edge Function that holds the Discogs token server-side.
// Returns null if Supabase isn't configured or Discogs has no data.
export async function queryDiscogs(artist, title) {
    if (!isConfigured) return null;
    await throttle('discogs', 1100);

    const clean = title.split('(')[0].split('[')[0].trim();
    try {
        const { data, error } = await supabase.functions.invoke('discogs-year', {
            body: { artist, title: clean },
        });
        if (error) return null;
        return data?.year ?? null;
    } catch {
        return null;
    }
}
