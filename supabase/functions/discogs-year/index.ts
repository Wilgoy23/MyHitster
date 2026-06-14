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

    const query = `${artist} ${title}`.trim();
    const url   = `https://api.discogs.com/database/search?type=master&per_page=10&q=${encodeURIComponent(query)}`;

    const resp = await fetch(url, {
        headers: {
            'User-Agent':    'MyHitster/1.0 +https://github.com/wilgoy23/MyHitster',
            'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        },
    });
    if (!resp.ok) return json({ year: null });

    const data = await resp.json();
    let earliest: number | null = null;
    for (const r of data.results ?? []) {
        const y = parseInt(r.year);
        if (!isNaN(y) && (earliest === null || y < earliest)) earliest = y;
    }

    return json({ year: earliest !== null ? String(earliest) : null });
});
