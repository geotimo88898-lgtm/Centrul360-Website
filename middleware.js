// Vercel Routing Middleware (it runs before the files are looked up). On the portal's domains the portal is the
// home page: admin.centrul360.com/ and staff.centrul360.com/ show the portal, /login its sign-in page. The site
// (www.centrul360.com) goes on untouched. There is no /portal address anymore: vercel.json sends the old links
// (the site's /portal, the portal domains' /portal and /portal-login) here.
export const config = { matcher: ['/', '/login'] };

const PORTAL_HOSTS = ['admin.centrul360.com', 'staff.centrul360.com'];
const isPortalHost = (h) => PORTAL_HOSTS.includes(h);

export default function middleware(request) {
  const url = new URL(request.url);
  if (!isPortalHost(url.hostname)) return undefined; // the site: its own home page
  const page = url.pathname === '/login' ? '/portal-login' : '/portal';
  // what @vercel/functions' rewrite() does: the address stays, the page shown is the portal's
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL(page, url).toString() } });
}
