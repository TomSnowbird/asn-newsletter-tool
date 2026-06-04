// ─── Vercel Edge Middleware — Auth Gate ───────────────────────────────────────

export const config = {
  matcher: ['/((?!login\\.html|api/auth|_vercel|favicon\\.ico).*)'],
};

export default function middleware(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);

  if (cookies['asn_auth'] !== 'authorized') {
    const loginUrl = new URL('/login.html', request.url);
    return Response.redirect(loginUrl, 302);
  }
  // No return = pass through to the destination
}

function parseCookies(header) {
  return Object.fromEntries(
    header.split(';')
      .filter(Boolean)
      .map(c => {
        const idx = c.indexOf('=');
        return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
      })
  );
}
