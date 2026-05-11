// Basic Auth gate for the admin area.
//
// Runs as a Netlify Edge Function (Deno runtime) so it fires BEFORE the
// static asset / function response is generated. Both /admin/* HTML and
// /api/admin/* API calls go through here.
//
// Matches AlexZAP's pattern (middleware.ts): single shared admin user via
// ADMIN_USERNAME / ADMIN_PASSWORD env vars. Mismatched / missing credentials
// return 401 with a WWW-Authenticate header so browsers show the native
// Basic Auth prompt.

const REALM = 'Admin';

export default async (request, context) => {
  const username = Netlify.env.get('ADMIN_USERNAME');
  const password = Netlify.env.get('ADMIN_PASSWORD');

  if (!username || !password) {
    return new Response(
      JSON.stringify({ error: 'admin_auth_not_configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const header = request.headers.get('authorization');
  const expected = `Basic ${btoa(`${username}:${password}`)}`;

  if (header !== expected) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="${REALM}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Auth passed — let Netlify continue serving the underlying asset/function.
  return context.next();
};

export const config = {
  path: ['/admin', '/admin/*', '/api/admin/*'],
};
