// Vercel Routing Middleware (it runs before the files are looked up). On the portal's domains the portal is the
// home page: admin.centrul360.com/ and staff.centrul360.com/ show the portal, /login its sign-in page. The site
// (www.centrul360.com) goes on untouched. There is no /portal address anymore: vercel.json sends the old links
// (the site's /portal, the portal domains' /portal and /portal-login) here.
// The team's sheets (/fise, /academy-fisa: the client sheets, the internal guide of the recommended programme) open
// only for someone signed in to the portal; on the site they do not exist.
export const config = { matcher: ['/', '/login', '/fise/:path*', '/academy-fisa/:path*'] };

const PORTAL_HOSTS = ['admin.centrul360.com', 'staff.centrul360.com'];
const isPortalHost = (h) => PORTAL_HOSTS.includes(h);
const SESSION_COOKIE = 'c360_portal_session';

// the portal's session cookie, checked the way api/_lib/auth.js signs it (HMAC-SHA256 of the payload, hex)
async function signedIn(request) {
  const raw = ((request.headers.get('cookie') || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(SESSION_COOKIE + '=')) || '').slice(SESSION_COOKIE.length + 1);
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return false;
  const encoded = decodeURIComponent(raw.slice(0, dot)), sig = raw.slice(dot + 1);
  const secret = process.env.PORTAL_SECRET || '';
  if (!secret) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)));
    const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff) return false;
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const payload = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const expiry = Number(payload.split('.')[2]);
    return !!expiry && Date.now() < expiry;
  } catch (e) { return false; }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/fise/') || url.pathname.startsWith('/academy-fisa/')) {
    if (!isPortalHost(url.hostname)) return new Response('Not found', { status: 404 });
    if (await signedIn(request)) return undefined;
    return new Response(null, { status: 302, headers: { Location: '/login' } });
  }
  if (!isPortalHost(url.hostname)) return undefined; // the site: its own home page
  const page = url.pathname === '/login' ? '/portal-login' : '/portal';
  // what @vercel/functions' rewrite() does: the address stays, the page shown is the portal's
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL(page, url).toString() } });
}
