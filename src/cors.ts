// ---------------------------------------------------------------------------
// CORS utilities for the islam-push Worker.
// ---------------------------------------------------------------------------
// Used by the fetch handler to set Access-Control-Allow-Origin headers
// for cross-origin requests from the islam app (islam.raharoho.me) and
// its Cloudflare Pages preview deployments.
// ---------------------------------------------------------------------------

export const ALLOWED_ORIGINS = [
  'https://islam.raharoho.me',                  // Production
  'https://*.raharoho-islam.pages.dev',          // Cloudflare Pages preview
  'http://localhost:5173',                      // Astro dev server (Vite default)
  'http://localhost:4321',                      // Astro dev server (Astro default)
];

/**
 * Check if an origin matches any allowed pattern.
 * Supports `*` wildcard in patterns (matches any chars, e.g. for subdomains).
 *
 * Examples:
 *   isOriginAllowed('https://islam.raharoho.me') === true
 *   isOriginAllowed('https://abc123.raharoho-islam.pages.dev') === true
 *   isOriginAllowed('https://evil.com') === false
 */
export function isOriginAllowed(origin: string): boolean {
  for (const allowed of ALLOWED_ORIGINS) {
    if (allowed === origin) return true;
    if (allowed.includes('*')) {
      // Escape regex special chars except `*`, then replace `*` with `.*`
      const pattern = allowed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) return true;
    }
  }
  return false;
}

/**
 * Build CORS response headers.
 * Reflects the request origin if it's allowed, otherwise defaults to
 * the production origin (so non-CORS requests still get a valid header).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && isOriginAllowed(origin) ? origin : 'https://islam.raharoho.me';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}
