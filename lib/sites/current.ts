/**
 * The site the user is working in (warehouse / branch code, e.g. "MUM-WH").
 * SiteProvider sets it; every request carries it:
 *   - API mode: the `X-Site` header. The backend must check it against the
 *     user's allowed_sites and scope stock, prices and documents to it.
 *   - Mock mode: services read it with getCurrentSite().
 */
let current: string | null = null;
export const setCurrentSite = (code: string | null) => { current = code; };
export const getCurrentSite = () => current;
