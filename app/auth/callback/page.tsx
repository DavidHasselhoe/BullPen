/**
 * OAuth Callback Page (PKCE flow)
 *
 * Runs the code exchange in an inline script BEFORE React loads.
 * This avoids AbortError from React/Next.js lifecycle.
 * Supabase redirects here with ?code= after Google login.
 */

import Script from 'next/script';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

export default function AuthCallbackPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const exchangeScript = `
(function(){
  var u=${JSON.stringify(url)},k=${JSON.stringify(key)};
  if(!u||!k){window.location.replace('/login?error=config');return;}
  var params=new URLSearchParams(window.location.search);
  var err=params.get('error');
  if(err){
    window.location.replace('/login?error='+encodeURIComponent(params.get('error_description')||err));
    return;
  }
  var code=params.get('code');
  if(!code){
    window.location.replace('/');
    return;
  }
  var s=document.createElement('script');
  s.src=${JSON.stringify(SUPABASE_CDN)};
  s.onload=function(){
    var supabase=window.supabase.createClient(u,k,{auth:{flowType:'pkce',detectSessionInUrl:false}});
    supabase.auth.exchangeCodeForSession(code)
      .then(function(r){
        if(r.error){
          window.location.replace('/login?error='+encodeURIComponent(r.error.message));
        }else{
          window.location.replace('/');
        }
      })
      .catch(function(e){
        window.location.replace('/login?error='+encodeURIComponent(e.message||'Sign-in failed'));
      });
  };
  s.onerror=function(){window.location.replace('/login?error='+encodeURIComponent('Failed to load auth'));};
  document.head.appendChild(s);
})();
`.replace(/\s+/g, ' ').trim();

  return (
    <>
      <Script id="auth-callback-exchange" strategy="beforeInteractive">
        {exchangeScript}
      </Script>
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Completing sign in…</p>
        </div>
      </div>
    </>
  );
}
