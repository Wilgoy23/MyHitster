// Copy this file to js/config.js and fill in your Supabase credentials.
// js/config.js is gitignored — your keys stay local.
//
// Setup steps:
// 1. Create a free project at https://supabase.com
// 2. Go to Project Settings → API → copy "Project URL" and "anon public" key below
// 3. In the SQL Editor run the migration in supabase/migration.sql
// 4. In Storage, create a bucket named "pdfs" (private)
// 5. In Authentication → Providers, enable Email and Google OAuth
//    For Google OAuth, set the redirect URL in the Google Cloud Console to:
//    https://<your-supabase-project>.supabase.co/auth/v1/callback
// 6. In Authentication → URL Configuration, add your site URL to Allowed Redirect URLs
//    e.g. https://wilgoy23.github.io/MyHitster/card-generator.html
// 7. (Optional) For Discogs cross-checking in Step 3:
//    - Get a personal access token at https://www.discogs.com/settings/developers
//    - Run: supabase secrets set DISCOGS_TOKEN=your_token_here
//    - Run: supabase functions deploy discogs-year
//    The token stays server-side; Discogs checks are skipped if not set up.

export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
