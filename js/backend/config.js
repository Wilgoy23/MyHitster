// config.js
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

export const SUPABASE_URL = 'https://rutebnnywqgapvjccmle.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dGVibm55d3FnYXB2amNjbWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM2OTMsImV4cCI6MjA5NTM4OTY5M30.z5Gju0rTGNzjaMQFQMh9AefCrlg92MLhYtS_7kUP_no';
