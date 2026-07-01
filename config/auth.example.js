/**
 * Supabase auth config — copy to auth.js and fill in your project values.
 * Dashboard: https://supabase.com/dashboard → Project Settings → API
 *
 * Google sign-in (Supabase Dashboard → Authentication → Providers → Google):
 *   1. Create OAuth credentials in Google Cloud Console
 *   2. Authorized redirect URI: https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
 *   3. Paste Client ID + Client Secret into Supabase Google provider settings
 *   4. Authentication → URL Configuration:
 *        Site URL: https://www.hskprep.cc
 *        Redirect URLs (add ALL — Google OAuth returns to "/", email confirmation to /auth/callback.html):
 *          https://www.hskprep.cc/
 *          https://www.hskprep.cc/auth/callback.html
 *          http://localhost:PORT/                    (local dev — Google)
 *          http://localhost:PORT/auth/callback.html  (local dev — email confirm)
 *
 *   cp config/auth.example.js config/auth.js
 */
window.HSK_AUTH_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  siteUrl: 'https://www.hskprep.cc',
};
