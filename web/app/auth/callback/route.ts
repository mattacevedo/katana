// app/auth/callback/route.ts
//
// Supabase magic-link PKCE callback.
//
// @supabase/ssr 0.5+ always generates PKCE magic links (ignores flowType:'implicit').
// Supabase redirects here with ?code=xxx (PKCE auth code). We exchange it
// server-side for a session, then:
//
//   • kt_from=extension cookie  →  Inline HTML page that sends the token to the
//                                   Chrome extension via chrome.runtime.sendMessage.
//                                   No redirect needed — the token, email, and plan
//                                   are embedded directly in the response HTML.
//   • ?next=/admin              →  redirect to that path (web destination)
//   • no next, no cookie        →  /dashboard
//
// For extension logins we render an inline HTML page instead of redirecting.
// This is MORE RELIABLE than redirecting to a separate React page because:
//   1. No hash fragment that CDNs might strip
//   2. No dependency on client-side getSession() reading cookies
//   3. No dependency on React hydration or Next.js routing
//   4. The server has the token in memory — just embed it directly
//
// IMPORTANT: In the Supabase dashboard → Authentication → URL Configuration,
// add  https://www.gradewithkatana.com/auth/callback  to the Redirect URLs list.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '';

  if (!code) {
    console.error('[auth/callback] No code in URL — stale or malformed link');
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  const cookieStore = await cookies();

  // Check for the extension sign-in cookie (set by the signin page when
  // ?source=extension is in the URL, i.e. opened from Chrome extension).
  const fromExtension = cookieStore.get('kt_from')?.value === 'extension';
  console.log('[auth/callback] fromExtension:', fromExtension, '| code length:', code.length);

  // ── Exchange the PKCE code for a session ──────────────────────────────────
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet.map(c => ({
            name: c.name,
            value: c.value,
            options: c.options as Record<string, unknown>,
          })));
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch { /* server component */ }
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  console.log('[auth/callback] Session exchanged OK, user:', data.session?.user?.email);

  // ── Extension login: render inline HTML that sends token to extension ─────
  if (fromExtension) {
    const token = data.session?.access_token || '';
    const email = data.session?.user?.email || '';
    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

    // Fetch plan server-side so the extension gets it immediately
    let plan = 'free';
    try {
      if (data.session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', data.session.user.id)
          .single();
        if (profile?.plan) plan = profile.plan;
      }
    } catch { /* default to free */ }

    console.log('[auth/callback] Extension login — rendering inline callback page. extensionId:', extensionId, '| plan:', plan);

    const html = buildExtensionCallbackHTML(token, email, plan, extensionId);
    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    // Set session cookies on this response too (so the web session is established)
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
    });
    // Clear kt_from
    response.cookies.set('kt_from', '', { maxAge: 0, path: '/' });

    return response;
  }

  // ── Web login: redirect to dashboard or ?next= target ─────────────────────
  let redirectTarget: string;
  if (next) {
    try {
      const resolved = new URL(next, origin);
      redirectTarget = resolved.origin === origin ? resolved.href : `${origin}/dashboard`;
    } catch {
      redirectTarget = `${origin}/dashboard`;
    }
  } else {
    redirectTarget = `${origin}/dashboard`;
  }

  const response = NextResponse.redirect(redirectTarget);

  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}

// ── Inline HTML for extension auth callback ─────────────────────────────────
// Renders a self-contained page that sends the token to the Chrome extension.
// Uses JSON.stringify to safely inject values into the JS context.
function buildExtensionCallbackHTML(token: string, email: string, plan: string, extensionId: string): string {
  const t = JSON.stringify(token);
  const e = JSON.stringify(email);
  const p = JSON.stringify(plan);
  const x = JSON.stringify(extensionId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Katana — Signing In</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f5f7}
    .card{background:#fff;border-radius:14px;padding:40px 36px;text-align:center;max-width:380px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.09)}
    .spinner{width:32px;height:32px;margin:0 auto 18px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:spin .7s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:10px}
    p{font-size:14px;color:#6b7280;line-height:1.6}
    .icon{font-size:44px;margin-bottom:18px;line-height:1}
    a{color:#2563eb;font-weight:600;text-decoration:none;font-size:14px}
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="spinner" id="spinner"></div>
    <h1 id="title">Signing in\u2026</h1>
    <p id="msg">Activating Katana in your browser\u2026</p>
  </div>
  <script>
  (function(){
    var token=${t},email=${e},plan=${p},extId=${x};
    console.log("[extension-callback] Inline page loaded. extId:",extId||"(empty)","email:",email);

    function done(icon,title,msg,link){
      document.getElementById("spinner").style.display="none";
      document.getElementById("title").textContent=title;
      document.getElementById("msg").innerHTML=msg+(link||"");
      var el=document.createElement("div");el.className="icon";el.textContent=icon;
      var c=document.getElementById("card");c.insertBefore(el,c.firstChild);
    }
    function success(){
      done("\\u2705","You\\u2019re signed in!","Katana is ready. You can close this tab.");
      setTimeout(function(){window.close();},2500);
    }
    function fail(msg){
      done("\\u274C","Sign-in failed",msg,"<br><br><a href=\\"/auth/signin\\">\\u2190 Try again</a>");
    }

    if(!token){fail("No session token received.");return;}

    if(!extId){
      console.error("[extension-callback] EXTENSION_ID empty \\u2014 cannot notify extension");
      success();return;
    }

    try{
      var cr=window.chrome&&window.chrome.runtime;
      if(!cr||!cr.sendMessage){
        console.warn("[extension-callback] chrome.runtime.sendMessage not available");
        success();return;
      }
      console.log("[extension-callback] Sending AUTH_TOKEN_RECEIVED to",extId);
      cr.sendMessage(extId,{type:"AUTH_TOKEN_RECEIVED",token:token,email:email,plan:plan},function(resp){
        if(chrome.runtime.lastError){
          console.error("[extension-callback] sendMessage error:",chrome.runtime.lastError.message);
        }else{
          console.log("[extension-callback] Extension responded:",JSON.stringify(resp));
        }
        success();
      });
    }catch(err){
      console.error("[extension-callback] sendMessage threw:",err.message||err);
      success();
    }
  })();
  </script>
</body>
</html>`;
}
