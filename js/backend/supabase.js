// Initialises the Supabase client only when js/config.js exists and is filled in.
// If config.js is missing or has placeholder values, isConfigured stays false
// and all auth/deck features are silently disabled.
//
// supabase-js is loaded as a regular <script> tag in the HTML (window.supabase),
// so no async CDN import is needed here.

let _url = '', _key = '';
try {
    const cfg = await import('./config.js');
    _url = cfg.SUPABASE_URL  || '';
    _key = cfg.SUPABASE_ANON_KEY || '';
} catch {
    // config.js not present — backend features disabled
}

let _client = null;
if (_url && _key && !_url.includes('YOUR_PROJECT') && window.supabase?.createClient) {
    _client = window.supabase.createClient(_url, _key);
}

export const supabase = _client;
export const isConfigured = _client !== null;
