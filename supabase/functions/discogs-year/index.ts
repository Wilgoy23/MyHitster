// Looks up the earliest known release year for an artist/title via Discogs'
// master-release search. The Discogs personal access token is kept as a
// server-side secret so it's never shipped to the browser.
//
// Deploy: supabase functions deploy discogs-year
// Secret: supabase secrets set DISCOGS_TOKEN=your_token_here

const DISCOGS_TOKEN = Deno.env.get('DISCOGS_TOKEN');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (!DISCOGS_TOKEN) return json({ year: null });

    let artist = '', title = '';
    try {
        const body = await req.json();
        artist = body.artist ?? '';
        title  = body.title  ?? '';
    } catch {
        return json({ year: null });
    }
    if (!artist && !title) return json({ year: null });

    // Search by artist + track name rather than a combined free-text query —
    // a "q=artist title" search matches unrelated masters that merely share a
    // word with the title, which can drag the picked year way off (e.g. a
    // same-named song by someone else from decades earlier).
    const params = new URLSearchParams({ type: 'master', per_page: '10' });
    if (artist) params.set('artist', artist);
    if (title)  params.set('track', title);
    const url = `https://api.discogs.com/database/search?${params.toString()}`;

    const resp = await fetch(url, {
        headers: {
            'User-Agent':    'MyHitster/1.0 +https://github.com/wilgoy23/MyHitster',
            'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        },
    });
    if (!resp.ok) return json({ year: null });

    const data = await resp.json();
    const artistNorm = normalize(artist);

    let earliest: number | null = null;
    for (const r of data.results ?? []) {
        const y = parseInt(r.year);
        if (isNaN(y)) continue;
        // Master titles are formatted "Artist - Release Title" — require the
        // artist to actually appear so a same-named track credited to someone
        // else doesn't pull the year down.
        if (artistNorm && !normalize(r.title ?? '').includes(artistNorm)) continue;
        if (earliest === null || y < earliest) earliest = y;
    }

    return json({ year: earliest !== null ? String(earliest) : null });
});
